use crate::DbConfig;
use std::collections::HashMap;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::io::AsyncReadExt;
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

/// Collects all candidate SSH private keys:
/// 1. The explicit key specified by the user.
/// 2. Any matching keys discovered in ~/.ssh and its subdirectories (e.g. ~/.ssh/vigo/id_rsa).
/// 3. Automatically fixes Unix permissions to 0600 so OpenSSH does not reject the keys.
fn find_candidate_ssh_keys(raw_path: Option<&str>, context_hint: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(raw) = raw_path.map(str::trim).filter(|s| !s.is_empty()) {
        let p = resolve_ssh_key_path(raw);
        if p.exists() {
            candidates.push(p);
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        let ssh_dir = PathBuf::from(&home).join(".ssh");
        if ssh_dir.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&ssh_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        for sub_name in &["id_rsa", "id_ed25519", "id_ecdsa"] {
                            let sub_key = path.join(sub_name);
                            if sub_key.is_file() && !candidates.contains(&sub_key) {
                                candidates.push(sub_key);
                            }
                        }
                    } else if path.is_file() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if (name.starts_with("id_") || name.ends_with(".pem"))
                            && !name.ends_with(".pub")
                            && !candidates.contains(&path)
                        {
                            candidates.push(path);
                        }
                    }
                }
            }
        }
    }

    // Prioritize keys whose path matches the context hint (e.g. "vigo" in connection name or host)
    let hint_lower = context_hint.to_lowercase();
    candidates.sort_by_key(|p| {
        let path_str = p.to_string_lossy().to_lowercase();
        if !hint_lower.is_empty() && (hint_lower.contains("vigo") && path_str.contains("vigo")) {
            0
        } else {
            1
        }
    });

    // Cap candidate keys to avoid OpenSSH "Too many authentication failures"
    candidates.truncate(4);

    // Ensure permissions on Unix are 0600 so OpenSSH doesn't reject with "UNPROTECTED PRIVATE KEY"
    #[cfg(unix)]
    for key in &candidates {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(key) {
            let mode = meta.permissions().mode();
            if mode & 0o077 != 0 {
                let _ = std::fs::set_permissions(key, std::fs::Permissions::from_mode(0o600));
            }
        }
    }

    candidates
}

fn validate_ssh_token(value: &str, field_name: &str) -> Result<(), String> {
    if value.is_empty() {
        return Err(format!("{} cannot be empty", field_name));
    }
    if value.starts_with('-') {
        return Err(format!(
            "Invalid {}: must not start with '-' (potential SSH option injection)",
            field_name
        ));
    }
    if value.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(format!(
            "Invalid {}: must not contain whitespace or control characters",
            field_name
        ));
    }
    Ok(())
}

fn build_tunnel_key(config: &DbConfig) -> Option<String> {
    if !config.use_ssh.unwrap_or(false) {
        return None;
    }
    let ssh_host = config.ssh_host.as_deref().map(str::trim).filter(|s| !s.is_empty())?;
    let ssh_port = config.ssh_port.unwrap_or(22);
    let ssh_user = config
        .ssh_user
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("ec2-user");
    Some(format!(
        "{}@{}:{}->{}:{}",
        ssh_user, ssh_host, ssh_port, config.host, config.port
    ))
}

/// Closes and removes an active SSH tunnel for the given configuration if one exists.
pub async fn close_ssh_tunnel(config: &DbConfig) {
    if let Some(key) = build_tunnel_key(config) {
        let mut registry = tunnel_registry().lock().await;
        if let Some(mut active) = registry.remove(&key) {
            let _ = active.child.kill().await;
            let _ = active.child.wait().await;
        }
    }
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

    validate_ssh_token(ssh_host, "SSH host")?;
    validate_ssh_token(ssh_user, "SSH username")?;
    validate_ssh_token(config.host.trim(), "Database target host")?;

    let tunnel_key = format!(
        "{}@{}:{}->{}:{}",
        ssh_user, ssh_host, ssh_port, config.host, config.port
    );

    let mut registry = tunnel_registry().lock().await;
    if let Some(existing) = registry.get_mut(&tunnel_key) {
        if let Ok(None) = existing.child.try_wait() {
            return Ok(("127.0.0.1".to_string(), existing.local_port));
        }
        let _ = existing.child.kill().await;
        let _ = existing.child.wait().await;
        registry.remove(&tunnel_key);
    }

    let local_port = allocate_ephemeral_port()?;
    let forward_spec = format!("127.0.0.1:{}:{}:{}", local_port, config.host.trim(), config.port);

    let mut cmd = Command::new("ssh");
    cmd.kill_on_drop(true)
        .arg("-N")
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
        .arg("ServerAliveCountMax=3")
        .arg("-o")
        .arg("BatchMode=yes");

    if config.use_ssh_key.unwrap_or(true) {
        let hint = format!("{} {}", config.host, config.database);
        let candidate_keys = find_candidate_ssh_keys(config.ssh_key_path.as_deref(), &hint);
        for key in &candidate_keys {
            cmd.arg("-i").arg(key);
        }
    }

    cmd.arg("--")
        .arg(format!("{}@{}", ssh_user, ssh_host))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn SSH bastion client: {}", e))?;

    // Wait up to 8 seconds for local forwarded port to become reachable
    for _ in 0..80 {
        if let Ok(Some(status)) = child.try_wait() {
            let mut stderr_msg = String::new();
            if let Some(mut stderr) = child.stderr.take() {
                let _ = stderr.read_to_string(&mut stderr_msg).await;
            }
            let err_summary = stderr_msg.trim();
            let detail = if !err_summary.is_empty() {
                format!(": {}", err_summary)
            } else {
                format!(" (exit status {})", status)
            };
            return Err(format!(
                "SSH tunnel to {}@{}:{} failed{}",
                ssh_user, ssh_host, ssh_port, detail
            ));
        }

        if TcpStream::connect(("127.0.0.1", local_port)).await.is_ok() {
            // Verify child is still healthy and didn't crash right after initial connect
            tokio::time::sleep(Duration::from_millis(120)).await;
            if let Ok(Some(_status)) = child.try_wait() {
                let mut stderr_msg = String::new();
                if let Some(mut stderr) = child.stderr.take() {
                    let _ = stderr.read_to_string(&mut stderr_msg).await;
                }
                return Err(format!(
                    "SSH tunnel to {}@{}:{} failed: {}",
                    ssh_user, ssh_host, ssh_port, stderr_msg.trim()
                ));
            }

            // Drain stderr asynchronously so the OS pipe buffer never fills and blocks ssh
            if let Some(mut stderr) = child.stderr.take() {
                tokio::spawn(async move {
                    let mut buf = [0u8; 1024];
                    while let Ok(n) = stderr.read(&mut buf).await {
                        if n == 0 {
                            break;
                        }
                    }
                });
            }

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
    let _ = child.wait().await;
    Err(format!(
        "Timed out establishing SSH bastion tunnel via {}@{}:{}",
        ssh_user, ssh_host, ssh_port
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_ssh_token_blocks_option_injection() {
        assert!(validate_ssh_token("13.212.189.147", "SSH host").is_ok());
        assert!(validate_ssh_token("ec2-user", "SSH username").is_ok());
        assert!(validate_ssh_token("-oProxyCommand=evil", "SSH host").is_err());
        assert!(validate_ssh_token("host with space", "SSH host").is_err());
    }
}
