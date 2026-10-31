use crate::ssh::{close_ssh_tunnel, resolve_endpoint};
use crate::DbConfig;
use sqlx::mysql::{MySqlConnectOptions, MySqlPoolOptions};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{MySqlPool, PgPool};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::OnceLock;
use std::time::Duration;
use tokio::sync::RwLock;

const MAX_CACHED_POOLS: usize = 16;

struct PoolRegistry {
    pg_pools: RwLock<HashMap<String, PgPool>>,
    mysql_pools: RwLock<HashMap<String, MySqlPool>>,
    redis_clients: RwLock<HashMap<String, redis::Client>>,
    snowflake_sessions: RwLock<HashMap<String, std::sync::Arc<snowflake_connector_rs::Session>>>,
}

static POOL_REGISTRY: OnceLock<PoolRegistry> = OnceLock::new();

fn registry() -> &'static PoolRegistry {
    POOL_REGISTRY.get_or_init(|| PoolRegistry {
        pg_pools: RwLock::new(HashMap::new()),
        mysql_pools: RwLock::new(HashMap::new()),
        redis_clients: RwLock::new(HashMap::new()),
        snowflake_sessions: RwLock::new(HashMap::new()),
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

pub fn normalize_engine_str(engine: &str) -> &'static str {
    let lower = engine.trim().to_lowercase();
    if lower.starts_with("postgres") || lower.contains("pg") || lower == "cockroachdb" {
        "postgres"
    } else if lower.starts_with("mysql") || lower.contains("maria") || lower == "tidb" {
        "mysql"
    } else if lower.starts_with("redis") || lower == "valkey" || lower == "dragonfly" {
        "redis"
    } else if lower.starts_with("snowflake") {
        "snowflake"
    } else {
        "postgres"
    }
}

fn cache_key(config: &DbConfig, target_host: &str, target_port: u16) -> String {
    let mut hasher = DefaultHasher::new();
    config.password.as_deref().unwrap_or_default().hash(&mut hasher);
    config.use_ssh.unwrap_or(false).hash(&mut hasher);
    config.ssh_host.as_deref().unwrap_or_default().hash(&mut hasher);
    config.ssh_user.as_deref().unwrap_or_default().hash(&mut hasher);
    config.ssh_port.unwrap_or(22).hash(&mut hasher);
    let cred_hash = hasher.finish();
    let engine = normalize_engine_str(&config.engine);

    format!(
        "{}://{}@{}:{}/{}?h={:016x}",
        engine,
        config.username.as_deref().unwrap_or_default(),
        target_host,
        target_port,
        config.database.trim(),
        cred_hash
    )
}

pub fn build_pg_options(config: &DbConfig, host: &str, port: u16) -> PgConnectOptions {
    let user = config
        .username
        .as_deref()
        .filter(|u| !u.trim().is_empty())
        .unwrap_or("postgres");
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
    let user = config
        .username
        .as_deref()
        .filter(|u| !u.trim().is_empty())
        .unwrap_or("root");
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

    let cached_pool = {
        let read_guard = registry().pg_pools.read().await;
        read_guard.get(&key).cloned()
    };

    if let Some(pool) = cached_pool {
        if !pool.is_closed() {
            return Ok(pool);
        }
    }

    let opts = build_pg_options(config, &host, port);
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .min_connections(0)
        .acquire_timeout(Duration::from_secs(8))
        .idle_timeout(Duration::from_secs(120))
        .max_lifetime(Duration::from_secs(1800))
        .test_before_acquire(true)
        .connect_with(opts)
        .await
        .map_err(|e| format!("PostgreSQL connection failed: {}", e))?;

    let mut write_guard = registry().pg_pools.write().await;
    write_guard.retain(|_, p| !p.is_closed());
    if write_guard.len() >= MAX_CACHED_POOLS {
        if let Some(evict_key) = write_guard.keys().next().cloned() {
            if let Some(evicted) = write_guard.remove(&evict_key) {
                tokio::spawn(async move { evicted.close().await });
            }
        }
    }
    write_guard.insert(key, pool.clone());
    Ok(pool)
}

pub async fn get_or_create_mysql_pool(config: &DbConfig) -> Result<MySqlPool, String> {
    let (host, port) = resolve_endpoint(config).await?;
    let key = cache_key(config, &host, port);

    let cached_pool = {
        let read_guard = registry().mysql_pools.read().await;
        read_guard.get(&key).cloned()
    };

    if let Some(pool) = cached_pool {
        if !pool.is_closed() {
            return Ok(pool);
        }
    }

    let opts = build_mysql_options(config, &host, port);
    let pool = MySqlPoolOptions::new()
        .max_connections(5)
        .min_connections(0)
        .acquire_timeout(Duration::from_secs(8))
        .idle_timeout(Duration::from_secs(120))
        .max_lifetime(Duration::from_secs(1800))
        .test_before_acquire(true)
        .connect_with(opts)
        .await
        .map_err(|e| format!("MySQL connection failed: {}", e))?;

    let mut write_guard = registry().mysql_pools.write().await;
    write_guard.retain(|_, p| !p.is_closed());
    if write_guard.len() >= MAX_CACHED_POOLS {
        if let Some(evict_key) = write_guard.keys().next().cloned() {
            if let Some(evicted) = write_guard.remove(&evict_key) {
                tokio::spawn(async move { evicted.close().await });
            }
        }
    }
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
            if write_guard.len() >= MAX_CACHED_POOLS {
                if let Some(evict_key) = write_guard.keys().next().cloned() {
                    write_guard.remove(&evict_key);
                }
            }
            write_guard.insert(key, created.clone());
            created
        }
    };

    client
        .get_multiplexed_tokio_connection()
        .await
        .map_err(|e| format!("Redis connection failed: {}", e))
}

pub fn normalize_snowflake_account(raw: &str) -> String {
    let mut s = raw.trim();
    if let Some(stripped) = s.strip_prefix("https://") {
        s = stripped;
    } else if let Some(stripped) = s.strip_prefix("http://") {
        s = stripped;
    }
    if let Some(idx) = s.find('/') {
        s = &s[..idx];
    }
    if let Some(idx) = s.find('?') {
        s = &s[..idx];
    }
    if let Some(idx) = s.rfind(':') {
        s = &s[..idx];
    }
    let s = s.trim();
    let lower = s.to_lowercase();
    const SUFFIX: &str = ".snowflakecomputing.com";
    if lower.ends_with(SUFFIX) {
        let trimmed_len = s.len() - SUFFIX.len();
        &s[..trimmed_len]
    } else {
        s
    }
    .trim()
    .to_string()
}

pub async fn get_or_create_snowflake_session(
    config: &DbConfig,
) -> Result<std::sync::Arc<snowflake_connector_rs::Session>, String> {
    let raw_account = config
        .snowflake_account
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            let h = config.host.trim();
            if !h.is_empty() && h != "localhost" && h != "127.0.0.1" {
                Some(h)
            } else {
                None
            }
        })
        .ok_or_else(|| "Snowflake Account is required (e.g. 'xy12345.us-east-1' or 'myorg-myaccount')".to_string())?;

    let account = normalize_snowflake_account(raw_account);
    if account.is_empty() {
        return Err("Snowflake Account is required (e.g. 'xy12345.us-east-1' or 'myorg-myaccount')".to_string());
    }

    let username = config
        .username
        .as_deref()
        .filter(|u| !u.trim().is_empty())
        .ok_or_else(|| "Snowflake Username / SSO Email is required".to_string())?;

    let auth_method = config
        .snowflake_auth_method
        .as_deref()
        .unwrap_or("externalbrowser")
        .to_lowercase();

    let auth = match auth_method.as_str() {
        "externalbrowser" | "external_browser" | "sso" => {
            snowflake_connector_rs::AuthConfig::external_browser(
                snowflake_connector_rs::ExternalBrowserConfig::default(),
            )
        }
        "password" => {
            let pass = config.password.as_deref().unwrap_or_default();
            snowflake_connector_rs::AuthConfig::password(pass)
        }
        "keypair" | "key_pair" => {
            let pkey = config.snowflake_private_key.as_deref().unwrap_or_default();
            let keypair_cfg = if let Some(passphrase) = config.snowflake_passphrase.as_deref().filter(|p| !p.is_empty()) {
                snowflake_connector_rs::KeyPairConfig::from_encrypted_pem(pkey, passphrase.as_bytes())
            } else {
                snowflake_connector_rs::KeyPairConfig::from_pem(pkey)
            };
            snowflake_connector_rs::AuthConfig::key_pair(keypair_cfg)
        }
        other => return Err(format!("Unsupported Snowflake authentication method: '{}'. Supported: 'externalbrowser', 'password', 'keypair'", other)),
    };

    let mut session_config = snowflake_connector_rs::SessionConfig::new();
    if let Some(wh) = config.snowflake_warehouse.as_deref().filter(|s| !s.trim().is_empty()) {
        session_config = session_config.with_warehouse(wh);
    }
    if !config.database.trim().is_empty() {
        session_config = session_config.with_database(config.database.trim());
    }
    if let Some(schema) = config.snowflake_schema.as_deref().filter(|s| !s.trim().is_empty()) {
        session_config = session_config.with_schema(schema);
    }
    if let Some(role) = config.snowflake_role.as_deref().filter(|s| !s.trim().is_empty()) {
        session_config = session_config.with_role(role);
    }

    let client_config = snowflake_connector_rs::ClientConfig::new(username, &account, auth)
        .with_session(session_config);

    let schema_str = config.snowflake_schema.as_deref().unwrap_or_default();
    let key = format!(
        "snowflake://{}@{}:{}/{}/{}?auth={}&wh={}&role={}&h={:016x}",
        username,
        account,
        config.port,
        config.database.trim(),
        schema_str,
        auth_method,
        config.snowflake_warehouse.as_deref().unwrap_or_default(),
        config.snowflake_role.as_deref().unwrap_or_default(),
        {
            let mut hasher = DefaultHasher::new();
            config.password.as_deref().unwrap_or_default().hash(&mut hasher);
            config.snowflake_private_key.as_deref().unwrap_or_default().hash(&mut hasher);
            hasher.finish()
        }
    );

    // Fast read check
    {
        let read_guard = registry().snowflake_sessions.read().await;
        if let Some(session) = read_guard.get(&key) {
            return Ok(session.clone());
        }
    }

    let client = snowflake_connector_rs::Client::new(client_config)
        .map_err(|e| format!("Failed to create Snowflake client: {}", e))?;

    let session = client
        .create_session()
        .await
        .map_err(|e| format!("Snowflake session creation failed: {}", e))?;

    // Activate all secondary roles so privileges across any role granted to the user are active.
    // This resolves: "SQL compilation error: Object does not exist or not authorized.
    // Your primary role ... or one of your secondary roles must have at least one privilege granted"
    let _ = session.query("USE SECONDARY ROLES ALL;").await;

    // Explicitly set database and schema context on session initialization
    if !config.database.trim().is_empty() {
        let db = config.database.trim();
        if let Some(schema) = config.snowflake_schema.as_deref().filter(|s| !s.trim().is_empty()) {
            let _ = session.query(format!("USE SCHEMA \"{}\".\"{}\";", db, schema)).await;
        } else {
            let _ = session.query(format!("USE DATABASE \"{}\";", db)).await;
        }
    }

    let arc_session = std::sync::Arc::new(session);

    let mut write_guard = registry().snowflake_sessions.write().await;
    if write_guard.len() >= MAX_CACHED_POOLS {
        if let Some(evict_key) = write_guard.keys().next().cloned() {
            write_guard.remove(&evict_key);
        }
    }
    write_guard.insert(key, arc_session.clone());

    Ok(arc_session)
}

/// Closes cached connection pools and SSH tunnels matching the given configuration.
pub async fn close_pool(config: &DbConfig) {
    let engine = normalize_engine_str(&config.engine);
    let db_trimmed = config.database.trim();
    let user = config.username.as_deref().unwrap_or_default();

    let target_prefix = match resolve_endpoint(config).await {
        Ok((host, port)) => format!("{}://{}@{}:{}/{}?h=", engine, user, host, port, db_trimmed),
        Err(_) => format!("{}://{}@{}:{}/{}?h=", engine, user, config.host.trim(), config.port, db_trimmed),
    };

    match engine {
        "postgres" => {
            let mut write_guard = registry().pg_pools.write().await;
            let keys_to_remove: Vec<String> = write_guard
                .keys()
                .filter(|k| k.starts_with(&target_prefix))
                .cloned()
                .collect();
            for k in keys_to_remove {
                if let Some(pool) = write_guard.remove(&k) {
                    pool.close().await;
                }
            }
        }
        "mysql" => {
            let mut write_guard = registry().mysql_pools.write().await;
            let keys_to_remove: Vec<String> = write_guard
                .keys()
                .filter(|k| k.starts_with(&target_prefix))
                .cloned()
                .collect();
            for k in keys_to_remove {
                if let Some(pool) = write_guard.remove(&k) {
                    pool.close().await;
                }
            }
        }
        "redis" => {
            let mut write_guard = registry().redis_clients.write().await;
            let keys_to_remove: Vec<String> = write_guard
                .keys()
                .filter(|k| k.starts_with(&target_prefix))
                .cloned()
                .collect();
            for k in keys_to_remove {
                write_guard.remove(&k);
            }
        }
        "snowflake" => {
            let acc = config
                .snowflake_account
                .as_deref()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or(config.host.as_str());
            let norm_acc = normalize_snowflake_account(acc);
            let sf_prefix = format!("snowflake://{}@{}:", user, norm_acc);
            let mut write_guard = registry().snowflake_sessions.write().await;
            let keys_to_remove: Vec<String> = write_guard
                .keys()
                .filter(|k| k.starts_with(&sf_prefix))
                .cloned()
                .collect();
            for k in keys_to_remove {
                write_guard.remove(&k);
            }
        }
        _ => {}
    }

    close_ssh_tunnel(config).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_snowflake_account() {
        assert_eq!(
            normalize_snowflake_account("swa87046-ct57250.snowflakecomputing.com"),
            "swa87046-ct57250"
        );
        assert_eq!(
            normalize_snowflake_account("https://swa87046-ct57250.snowflakecomputing.com/"),
            "swa87046-ct57250"
        );
        assert_eq!(
            normalize_snowflake_account("http://swa87046-ct57250.snowflakecomputing.com:443/console?test=1"),
            "swa87046-ct57250"
        );
        assert_eq!(
            normalize_snowflake_account("swa87046-ct57250"),
            "swa87046-ct57250"
        );
        assert_eq!(
            normalize_snowflake_account("xy12345.us-east-1"),
            "xy12345.us-east-1"
        );
        assert_eq!(
            normalize_snowflake_account("xy12345.us-east-1.snowflakecomputing.com"),
            "xy12345.us-east-1"
        );
        assert_eq!(
            normalize_snowflake_account("SWA87046-CT57250.SNOWFLAKECOMPUTING.COM"),
            "SWA87046-CT57250"
        );
        assert_eq!(
            normalize_snowflake_account("   swa87046-ct57250.snowflakecomputing.com   "),
            "swa87046-ct57250"
        );
    }

    #[test]
    fn test_percent_encode_special_chars() {
        assert_eq!(
            percent_encode_credential("p@ss:w/rd?#100%"),
            "p%40ss%3Aw%2Frd%3F%23100%25"
        );
        assert_eq!(percent_encode_credential("dev_user-1.0"), "dev_user-1.0");
    }

    #[test]
    fn test_normalize_engine_str() {
        assert_eq!(normalize_engine_str("PostgreSQL"), "postgres");
        assert_eq!(normalize_engine_str("postgres"), "postgres");
        assert_eq!(normalize_engine_str("MariaDB"), "mysql");
        assert_eq!(normalize_engine_str("MySQL"), "mysql");
        assert_eq!(normalize_engine_str("Redis"), "redis");
        assert_eq!(normalize_engine_str("valkey"), "redis");
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
            ..Default::default()
        };
        let url = build_redis_url(&cfg, "localhost", 6379);
        assert_eq!(url, "redis://:my%40secret%3Apass%231@localhost:6379/0");

        let cfg_acl = DbConfig {
            engine: "redis".into(),
            host: "10.0.0.5".into(),
            port: 6380,
            database: "2".into(),
            username: Some("acl_user".into()),
            password: Some("sec/ret".into()),
            ..Default::default()
        };
        assert_eq!(
            build_redis_url(&cfg_acl, "10.0.0.5", 6380),
            "redis://acl_user:sec%2Fret@10.0.0.5:6380/2"
        );
    }

    #[test]
    fn test_cache_key_differentiates_databases_and_credentials() {
        let cfg1 = DbConfig {
            engine: "PostgreSQL".into(),
            host: "db.internal".into(),
            port: 5432,
            database: "db_a".into(),
            username: Some("postgres".into()),
            password: Some("pass1".into()),
            ..Default::default()
        };
        let cfg2 = DbConfig {
            database: "db_b".into(),
            ..cfg1.clone()
        };
        let cfg3 = DbConfig {
            password: Some("pass2".into()),
            ..cfg1.clone()
        };
        assert_ne!(cache_key(&cfg1, "db.internal", 5432), cache_key(&cfg2, "db.internal", 5432));
        assert_ne!(cache_key(&cfg1, "db.internal", 5432), cache_key(&cfg3, "db.internal", 5432));
        assert!(cache_key(&cfg1, "db.internal", 5432).starts_with("postgres://"));
    }

    #[test]
    fn test_normalize_engine_snowflake() {
        assert_eq!(normalize_engine_str("Snowflake"), "snowflake");
        assert_eq!(normalize_engine_str("SNOWFLAKE"), "snowflake");
        assert_eq!(normalize_engine_str("snowflake_dw"), "snowflake");
    }

    #[tokio::test]
    async fn test_snowflake_pool_close_isolation() {
        let sf_cfg = DbConfig {
            engine: "snowflake".into(),
            host: "xy12345.us-east-1.snowflakecomputing.com".into(),
            port: 443,
            database: "SALES_PROD".into(),
            username: Some("analyst".into()),
            snowflake_account: Some("xy12345.us-east-1".into()),
            snowflake_warehouse: Some("COMPUTE_WH".into()),
            ..Default::default()
        };

        // Closing snowflake pool should execute cleanly without affecting or locking any other engine
        close_pool(&sf_cfg).await;
    }
}

