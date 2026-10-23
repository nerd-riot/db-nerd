use crate::DbConfig;
use std::collections::HashMap;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

struct ActiveTunnel {
    local_port: u16,
    child: Child,
}

static SSH_TUNNELS: OnceLock<Mutex<HashMap<String, ActiveTunnel>>> = OnceLock::new();

fn tunnel_registry() -> &'static Mutex<HashMap<String, ActiveTunnel>> {
    SSH_TUNNELS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn resolve_ssh_key_path(raw_path: &str) -> PathBuf {
    let trimmed = raw_path.trim();
    if let Some(stripped) = trimmed.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home).join(stripped);
        }
    }
    let candidate = PathBuf::from(trimmed);
    if candidate.is_absolute() || candidate.exists() {
        return candidate;
    }
    if let Ok(home) = std::env::var("HOME") {
        let in_ssh_dir = PathBuf::from(home).join(".ssh").join(trimmed);
        if in_ssh_dir.exists() {
            return in_ssh_dir;
        }
    }
    candidate
}

fn allocate_ephemeral_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to allocate local port for SSH tunnel: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to read local port for SSH tunnel: {}", e))?
        .port();
    Ok(port)
}

/// Resolves the target `(host, port)` for a database connection.
/// When `config.use_ssh` is enabled, establishes or reuses a local SSH port-forwarding tunnel.
pub async fn resolve_endpoint(config: &DbConfig) -> Result<(String, u16), String> {
    if !config.use_ssh.unwrap_or(false) {
        return Ok((config.host.clone(), config.port));
    }

    let ssh_host = config
        .ssh_host
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "SSH Bastion host is required when SSH tunneling is enabled".to_string())?;

    let ssh_port = config.ssh_port.unwrap_or(22);
    let ssh_user = config
        .ssh_user
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("ec2-user");

    let tunnel_key = format!(
        "{}@{}:{}->{}:{}",
        ssh_user, ssh_host, ssh_port, config.host, config.port
    );

    let mut registry = tunnel_registry().lock().await;
    if let Some(existing) = registry.get_mut(&tunnel_key) {
        if let Ok(None) = existing.child.try_wait() {
            if TcpStream::connect(("127.0.0.1", existing.local_port))
                .await
                .is_ok()
            {
                return Ok(("127.0.0.1".to_string(), existing.local_port));
            }
        }
        let _ = existing.child.kill().await;
        registry.remove(&tunnel_key);
    }

    let local_port = allocate_ephemeral_port()?;
    let forward_spec = format!("127.0.0.1:{}:{}:{}", local_port, config.host, config.port);

    let mut cmd = Command::new("ssh");
    cmd.arg("-N")
        .arg("-L")
        .arg(&forward_spec)
        .arg("-p")
        .arg(ssh_port.to_string())
        .arg("-o")
        .arg("ExitOnForwardFailure=yes")
        .arg("-o")
        .arg("StrictHostKeyChecking=accept-new")
        .arg("-o")
        .arg("ConnectTimeout=8")
        .arg("-o")
        .arg("ServerAliveInterval=30")
        .arg("-o")
        .arg("BatchMode=yes");

    if config.use_ssh_key.unwrap_or(true) {
        if let Some(key_path) = config
            .ssh_key_path
            .as_deref()
            .map(str::trim)
            .filter(|p| !p.is_empty())
        {
            let resolved = resolve_ssh_key_path(key_path);
            cmd.arg("-i").arg(resolved);
        }
    }

    cmd.arg(format!("{}@{}", ssh_user, ssh_host))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn SSH bastion client: {}", e))?;

    // Wait up to 8 seconds for local forwarded port to become reachable
    for _ in 0..80 {
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!(
                "SSH tunnel to {}@{}:{} exited early with status {}",
                ssh_user, ssh_host, ssh_port, status
            ));
        }
        if TcpStream::connect(("127.0.0.1", local_port)).await.is_ok() {
            registry.insert(
                tunnel_key,
                ActiveTunnel {
                    local_port,
                    child,
                },
            );
            return Ok(("127.0.0.1".to_string(), local_port));
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    let _ = child.kill().await;
    Err(format!(
        "Timed out establishing SSH bastion tunnel via {}@{}:{}",
        ssh_user, ssh_host, ssh_port
    ))
}
