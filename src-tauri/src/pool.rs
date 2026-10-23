use crate::ssh::resolve_endpoint;
use crate::DbConfig;
use sqlx::mysql::{MySqlConnectOptions, MySqlPoolOptions};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{MySqlPool, PgPool};
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::sync::RwLock;

struct PoolRegistry {
    pg_pools: RwLock<HashMap<String, PgPool>>,
    mysql_pools: RwLock<HashMap<String, MySqlPool>>,
    redis_clients: RwLock<HashMap<String, redis::Client>>,
}

static POOL_REGISTRY: OnceLock<PoolRegistry> = OnceLock::new();

fn registry() -> &'static PoolRegistry {
    POOL_REGISTRY.get_or_init(|| PoolRegistry {
        pg_pools: RwLock::new(HashMap::new()),
        mysql_pools: RwLock::new(HashMap::new()),
        redis_clients: RwLock::new(HashMap::new()),
    })
}

/// Percent-encodes a credential component (username or password) per RFC 3986
/// so special characters (`@`, `:`, `/`, `?`, `#`, `%`, spaces) never corrupt connection URLs.
pub fn percent_encode_credential(input: &str) -> String {
    let mut encoded = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    encoded
}

fn cache_key(config: &DbConfig, target_host: &str, target_port: u16) -> String {
    format!(
        "{}://{}@{}:{}/{}?pw_len={}",
        config.engine,
        config.username.as_deref().unwrap_or_default(),
        target_host,
        target_port,
        config.database,
        config.password.as_deref().unwrap_or_default().len()
    )
}

pub fn build_pg_options(config: &DbConfig, host: &str, port: u16) -> PgConnectOptions {
    let user = config.username.as_deref().unwrap_or("postgres");
    let pass = config.password.as_deref().unwrap_or_default();
    let db = if config.database.trim().is_empty() {
        "postgres"
    } else {
        config.database.trim()
    };

    let mut opts = PgConnectOptions::new()
        .host(host)
        .port(port)
        .username(user)
        .database(db);

    if !pass.is_empty() {
        opts = opts.password(pass);
    }
    opts
}

pub fn build_mysql_options(config: &DbConfig, host: &str, port: u16) -> MySqlConnectOptions {
    let user = config.username.as_deref().unwrap_or("root");
    let pass = config.password.as_deref().unwrap_or_default();
    let db = config.database.trim();

    let mut opts = MySqlConnectOptions::new()
        .host(host)
        .port(port)
        .username(user);

    if !pass.is_empty() {
        opts = opts.password(pass);
    }
    if !db.is_empty() {
        opts = opts.database(db);
    }
    opts
}

pub fn build_redis_url(config: &DbConfig, host: &str, port: u16) -> String {
    let db_suffix = {
        let trimmed = config.database.trim();
        if trimmed.is_empty() {
            String::new()
        } else {
            format!("/{}", percent_encode_credential(trimmed))
        }
    };

    if let Some(pass) = config.password.as_deref().filter(|p| !p.is_empty()) {
        let encoded_pass = percent_encode_credential(pass);
        if let Some(user) = config
            .username
            .as_deref()
            .filter(|u| !u.is_empty() && *u != "default")
        {
            let encoded_user = percent_encode_credential(user);
            format!(
                "redis://{}:{}@{}:{}{}",
                encoded_user, encoded_pass, host, port, db_suffix
            )
        } else {
            format!("redis://:{}@{}:{}{}", encoded_pass, host, port, db_suffix)
        }
    } else {
        format!("redis://{}:{}{}", host, port, db_suffix)
    }
}

pub async fn get_or_create_pg_pool(config: &DbConfig) -> Result<PgPool, String> {
    let (host, port) = resolve_endpoint(config).await?;
    let key = cache_key(config, &host, port);

    {
        let read_guard = registry().pg_pools.read().await;
        if let Some(pool) = read_guard.get(&key) {
            if !pool.is_closed() {
                return Ok(pool.clone());
            }
        }
    }

    let opts = build_pg_options(config, &host, port);
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(8))
        .connect_with(opts)
        .await
        .map_err(|e| format!("PostgreSQL connection failed: {}", e))?;

    let mut write_guard = registry().pg_pools.write().await;
    write_guard.insert(key, pool.clone());
    Ok(pool)
}

pub async fn get_or_create_mysql_pool(config: &DbConfig) -> Result<MySqlPool, String> {
    let (host, port) = resolve_endpoint(config).await?;
    let key = cache_key(config, &host, port);

    {
        let read_guard = registry().mysql_pools.read().await;
        if let Some(pool) = read_guard.get(&key) {
            if !pool.is_closed() {
                return Ok(pool.clone());
            }
        }
    }

    let opts = build_mysql_options(config, &host, port);
    let pool = MySqlPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(8))
        .connect_with(opts)
        .await
        .map_err(|e| format!("MySQL connection failed: {}", e))?;

    let mut write_guard = registry().mysql_pools.write().await;
    write_guard.insert(key, pool.clone());
    Ok(pool)
}

pub async fn get_or_create_redis_connection(
    config: &DbConfig,
) -> Result<redis::aio::MultiplexedConnection, String> {
    let (host, port) = resolve_endpoint(config).await?;
    let key = cache_key(config, &host, port);

    let client = {
        let read_guard = registry().redis_clients.read().await;
        read_guard.get(&key).cloned()
    };

    let client = match client {
        Some(c) => c,
        None => {
            let url = build_redis_url(config, &host, port);
            let created =
                redis::Client::open(url).map_err(|e| format!("Invalid Redis URL: {}", e))?;
            let mut write_guard = registry().redis_clients.write().await;
            write_guard.insert(key, created.clone());
            created
        }
    };

    client
        .get_multiplexed_tokio_connection()
        .await
        .map_err(|e| format!("Redis connection failed: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_percent_encode_special_chars() {
        assert_eq!(
            percent_encode_credential("p@ss:w/rd?#100%"),
            "p%40ss%3Aw%2Frd%3F%23100%25"
        );
        assert_eq!(percent_encode_credential("dev_user-1.0"), "dev_user-1.0");
    }

    #[test]
    fn test_build_redis_url_encodes_credentials() {
        let cfg = DbConfig {
            engine: "redis".into(),
            host: "localhost".into(),
            port: 6379,
            database: "0".into(),
            username: Some("default".into()),
            password: Some("my@secret:pass#1".into()),
            use_ssh: None,
            ssh_host: None,
            ssh_user: None,
            ssh_port: None,
            ssh_password: None,
            use_ssh_key: None,
            ssh_key_path: None,
            ssh_passphrase: None,
        };
        let url = build_redis_url(&cfg, "localhost", 6379);
        assert_eq!(url, "redis://:my%40secret%3Apass%231@localhost:6379/0");
    }
}
