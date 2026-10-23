pub mod drivers;

use serde::{Deserialize, Serialize};
use std::time::Instant;

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct DbConfig {
    pub engine: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: Option<String>,
    pub password: Option<String>,
    #[serde(default)]
    pub use_ssh: Option<bool>,
    #[serde(default)]
    pub ssh_host: Option<String>,
    #[serde(default)]
    pub ssh_user: Option<String>,
    #[serde(default)]
    pub ssh_port: Option<u16>,
    #[serde(default)]
    pub ssh_password: Option<String>,
    #[serde(default)]
    pub use_ssh_key: Option<bool>,
    #[serde(default)]
    pub ssh_key_path: Option<String>,
    #[serde(default)]
    pub ssh_passphrase: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct TestConnectionResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: f64,
    pub version: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct QueryResult {
    pub success: bool,
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
    pub duration_ms: f64,
    pub rows_affected: u64,
    pub error: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct TableSummary {
    pub name: String,
    pub count: String,
}

#[tauri::command]
async fn test_connection(config: DbConfig) -> Result<TestConnectionResult, String> {
    let start = Instant::now();
    match drivers::normalize_engine(&config.engine) {
        "postgres" => {
            let user = config.username.unwrap_or_else(|| "postgres".to_string());
            let pass = config.password.unwrap_or_default();
            let url = format!(
                "postgres://{}:{}@{}:{}/{}",
                user, pass, config.host, config.port, config.database
            );
            match sqlx::PgPool::connect(&url).await {
                Ok(pool) => {
                    let version_row: Result<(String,), _> =
                        sqlx::query_as("SELECT version()").fetch_one(&pool).await;
                    let version = version_row.map(|r| r.0).ok();
                    let latency = start.elapsed().as_secs_f64() * 1000.0;
                    Ok(TestConnectionResult {
                        success: true,
                        message: "Successfully connected to PostgreSQL!".into(),
                        latency_ms: (latency * 10.0).round() / 10.0,
                        version,
                    })
                }
                Err(e) => Ok(TestConnectionResult {
                    success: false,
                    message: format!("PostgreSQL connection failed: {}", e),
                    latency_ms: start.elapsed().as_secs_f64() * 1000.0,
                    version: None,
                }),
            }
        }
        "mysql" => {
            let user = config.username.unwrap_or_else(|| "root".to_string());
            let pass = config.password.unwrap_or_default();
            let url = format!(
                "mysql://{}:{}@{}:{}/{}",
                user, pass, config.host, config.port, config.database
            );
            match sqlx::MySqlPool::connect(&url).await {
                Ok(pool) => {
                    let version_row: Result<(String,), _> =
                        sqlx::query_as("SELECT VERSION()").fetch_one(&pool).await;
                    let version = version_row.map(|r| r.0).ok();
                    let latency = start.elapsed().as_secs_f64() * 1000.0;
                    Ok(TestConnectionResult {
                        success: true,
                        message: "Successfully connected to MySQL!".into(),
                        latency_ms: (latency * 10.0).round() / 10.0,
                        version,
                    })
                }
                Err(e) => Ok(TestConnectionResult {
                    success: false,
                    message: format!("MySQL connection failed: {}", e),
                    latency_ms: start.elapsed().as_secs_f64() * 1000.0,
                    version: None,
                }),
            }
        }
        "redis" => {
            let url = if let Some(pass) = config.password.filter(|p| !p.is_empty()) {
                format!("redis://:{}@{}:{}", pass, config.host, config.port)
            } else {
                format!("redis://{}:{}", config.host, config.port)
            };
            match redis::Client::open(url) {
                Ok(client) => match client.get_multiplexed_tokio_connection().await {
                    Ok(mut con) => {
                        let pong: Result<String, _> = redis::cmd("PING").query_async(&mut con).await;
                        let info: Result<String, _> =
                            redis::cmd("INFO").arg("server").query_async(&mut con).await;
                        let version = info
                            .ok()
                            .and_then(|s| drivers::extract_redis_version(&s))
                            .or_else(|| Some("Redis".into()));
                        let latency = start.elapsed().as_secs_f64() * 1000.0;
                        match pong {
                            Ok(_) => Ok(TestConnectionResult {
                                success: true,
                                message: "Successfully connected to Redis!".into(),
                                latency_ms: (latency * 10.0).round() / 10.0,
                                version,
                            }),
                            Err(e) => Ok(TestConnectionResult {
                                success: false,
                                message: format!("Redis ping failed: {}", e),
                                latency_ms: latency,
                                version: None,
                            }),
                        }
                    }
                    Err(e) => Ok(TestConnectionResult {
                        success: false,
                        message: format!("Redis connection failed: {}", e),
                        latency_ms: start.elapsed().as_secs_f64() * 1000.0,
                        version: None,
                    }),
                },
                Err(e) => Ok(TestConnectionResult {
                    success: false,
                    message: format!("Invalid Redis URL: {}", e),
                    latency_ms: start.elapsed().as_secs_f64() * 1000.0,
                    version: None,
                }),
            }
        }
        "sqlite" => drivers::test_sqlite(&config, start).await,
        _ => Err(format!("Unsupported database engine: {}", config.engine)),
    }
}

#[tauri::command]
async fn execute_query(config: DbConfig, query: String) -> Result<QueryResult, String> {
    let start = Instant::now();
    let q_trimmed = query.trim();

    match drivers::normalize_engine(&config.engine) {
        "postgres" => {
            let user = config.username.unwrap_or_else(|| "postgres".to_string());
            let pass = config.password.unwrap_or_default();
            let url = format!(
                "postgres://{}:{}@{}:{}/{}",
                user, pass, config.host, config.port, config.database
            );

            let pool = sqlx::PgPool::connect(&url)
                .await
                .map_err(|e| format!("Connection error: {}", e))?;

            // Check if query produces rows (including RETURNING, PRAGMA, VALUES, TABLE)
            if drivers::query_returns_rows(q_trimmed) {
                use sqlx::{Column, Row, TypeInfo};
                let rows = sqlx::query(&query)
                    .fetch_all(&pool)
                    .await
                    .map_err(|e| format!("Query error: {}", e))?;

                let mut columns = Vec::new();
                if let Some(first) = rows.first() {
                    for col in first.columns() {
                        columns.push(col.name().to_string());
                    }
                }

                let mut json_rows = Vec::new();
                for row in rows {
                    let mut map = serde_json::Map::new();
                    for (i, col) in row.columns().iter().enumerate() {
                        let col_name = col.name().to_string();
                        let type_name = col.type_info().name().to_uppercase();

                        let val: serde_json::Value = if type_name.contains("INT") || type_name.contains("SERIAL") {
                            if let Ok(n) = row.try_get::<i64, _>(i) {
                                serde_json::Value::Number(n.into())
                            } else if let Ok(n) = row.try_get::<i32, _>(i) {
                                serde_json::Value::Number(n.into())
                            } else {
                                serde_json::Value::Null
                            }
                        } else if type_name.contains("FLOAT") || type_name.contains("DOUBLE") {
                            if let Ok(f) = row.try_get::<f64, _>(i) {
                                serde_json::Number::from_f64(f)
                                    .map(serde_json::Value::Number)
                                    .unwrap_or(serde_json::Value::Null)
                            } else {
                                serde_json::Value::Null
                            }
                        } else if type_name.contains("NUMERIC") || type_name.contains("DECIMAL") {
                            if let Ok(d) = row.try_get::<rust_decimal::Decimal, _>(i) {
                                if let Some(n) = serde_json::Number::from_f64(d.to_string().parse::<f64>().unwrap_or(0.0)) {
                                    serde_json::Value::Number(n)
                                } else {
                                    serde_json::Value::String(d.to_string())
                                }
                            } else if let Ok(f) = row.try_get::<f64, _>(i) {
                                serde_json::Number::from_f64(f)
                                    .map(serde_json::Value::Number)
                                    .unwrap_or(serde_json::Value::Null)
                            } else {
                                serde_json::Value::Null
                            }
                        } else if type_name == "BOOL" || type_name == "BOOLEAN" {
                            if let Ok(b) = row.try_get::<bool, _>(i) {
                                serde_json::Value::Bool(b)
                            } else {
                                serde_json::Value::Null
                            }
                        } else if type_name == "JSON" || type_name == "JSONB" {
                            row.try_get::<serde_json::Value, _>(i)
                                .unwrap_or(serde_json::Value::Null)
                        } else if type_name.contains("TIME") || type_name.contains("DATE") {
                            if let Ok(dt) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(i) {
                                serde_json::Value::String(dt.format("%Y-%m-%d %H:%M:%S").to_string())
                            } else if let Ok(dt) = row.try_get::<chrono::NaiveDateTime, _>(i) {
                                serde_json::Value::String(dt.format("%Y-%m-%d %H:%M:%S").to_string())
                            } else if let Ok(d) = row.try_get::<chrono::NaiveDate, _>(i) {
                                serde_json::Value::String(d.to_string())
                            } else if let Ok(s) = row.try_get::<String, _>(i) {
                                serde_json::Value::String(s)
                            } else {
                                serde_json::Value::Null
                            }
                        } else if type_name.contains("UUID") {
                            if let Ok(u) = row.try_get::<sqlx::types::Uuid, _>(i) {
                                serde_json::Value::String(u.to_string())
                            } else if let Ok(s) = row.try_get::<String, _>(i) {
                                serde_json::Value::String(s)
                            } else {
                                serde_json::Value::Null
                            }
                        } else {
                            if let Ok(s) = row.try_get::<String, _>(i) {
                                serde_json::Value::String(s)
                            } else if let Ok(n) = row.try_get::<i64, _>(i) {
                                serde_json::Value::Number(n.into())
                            } else {
                                serde_json::Value::Null
                            }
                        };

                        map.insert(col_name, val);
                    }
                    json_rows.push(serde_json::Value::Object(map));
                }

                let duration = start.elapsed().as_secs_f64() * 1000.0;
                Ok(QueryResult {
                    success: true,
                    columns,
                    rows: json_rows,
                    duration_ms: (duration * 10.0).round() / 10.0,
                    rows_affected: 0,
                    error: None,
                })
            } else {
                let res = sqlx::query(&query)
                    .execute(&pool)
                    .await
                    .map_err(|e| format!("Execution error: {}", e))?;
                let duration = start.elapsed().as_secs_f64() * 1000.0;
                Ok(QueryResult {
                    success: true,
                    columns: vec!["status".into(), "rows_affected".into()],
                    rows: vec![serde_json::json!({
                        "status": "SUCCESS",
                        "rows_affected": res.rows_affected()
                    })],
                    duration_ms: (duration * 10.0).round() / 10.0,
                    rows_affected: res.rows_affected(),
                    error: None,
                })
            }
        }
        "mysql" => {
            let user = config.username.unwrap_or_else(|| "root".to_string());
            let pass = config.password.unwrap_or_default();
            let url = format!(
                "mysql://{}:{}@{}:{}/{}",
                user, pass, config.host, config.port, config.database
            );

            let pool = sqlx::MySqlPool::connect(&url)
                .await
                .map_err(|e| format!("MySQL connection error: {}", e))?;

            if drivers::query_returns_rows(q_trimmed) {
                use sqlx::{Column, Row};
                let rows = sqlx::query(&query)
                    .fetch_all(&pool)
                    .await
                    .map_err(|e| format!("Query error: {}", e))?;

                let mut columns = Vec::new();
                if let Some(first) = rows.first() {
                    for col in first.columns() {
                        columns.push(col.name().to_string());
                    }
                }

                let mut json_rows = Vec::new();
                for row in rows {
                    let mut map = serde_json::Map::new();
                    for (i, col) in row.columns().iter().enumerate() {
                        let col_name = col.name().to_string();
                        let val: serde_json::Value = if let Ok(s) = row.try_get::<String, _>(i) {
                            serde_json::Value::String(s)
                        } else if let Ok(bytes) = row.try_get::<Vec<u8>, _>(i) {
                            serde_json::Value::String(String::from_utf8_lossy(&bytes).to_string())
                        } else if let Ok(n) = row.try_get::<i64, _>(i) {
                            serde_json::Value::Number(n.into())
                        } else if let Ok(f) = row.try_get::<f64, _>(i) {
                            serde_json::Number::from_f64(f)
                                .map(serde_json::Value::Number)
                                .unwrap_or(serde_json::Value::Null)
                        } else if let Ok(d) = row.try_get::<rust_decimal::Decimal, _>(i) {
                            if let Some(n) = serde_json::Number::from_f64(d.to_string().parse::<f64>().unwrap_or(0.0)) {
                                serde_json::Value::Number(n)
                            } else {
                                serde_json::Value::String(d.to_string())
                            }
                        } else if let Ok(dt) = row.try_get::<chrono::NaiveDateTime, _>(i) {
                            serde_json::Value::String(dt.format("%Y-%m-%d %H:%M:%S").to_string())
                        } else if let Ok(d) = row.try_get::<chrono::NaiveDate, _>(i) {
                            serde_json::Value::String(d.to_string())
                        } else if let Ok(b) = row.try_get::<bool, _>(i) {
                            serde_json::Value::Bool(b)
                        } else {
                            serde_json::Value::Null
                        };
                        map.insert(col_name, val);
                    }
                    json_rows.push(serde_json::Value::Object(map));
                }

                let duration = start.elapsed().as_secs_f64() * 1000.0;
                Ok(QueryResult {
                    success: true,
                    columns,
                    rows: json_rows,
                    duration_ms: (duration * 10.0).round() / 10.0,
                    rows_affected: 0,
                    error: None,
                })
            } else {
                let res = sqlx::query(&query)
                    .execute(&pool)
                    .await
                    .map_err(|e| format!("Execution error: {}", e))?;
                let duration = start.elapsed().as_secs_f64() * 1000.0;
                Ok(QueryResult {
                    success: true,
                    columns: vec!["status".into(), "rows_affected".into()],
                    rows: vec![serde_json::json!({
                        "status": "SUCCESS",
                        "rows_affected": res.rows_affected()
                    })],
                    duration_ms: (duration * 10.0).round() / 10.0,
                    rows_affected: res.rows_affected(),
                    error: None,
                })
            }
        }
        "redis" => {
            let url = if let Some(pass) = config.password.filter(|p| !p.is_empty()) {
                format!("redis://:{}@{}:{}", pass, config.host, config.port)
            } else {
                format!("redis://{}:{}", config.host, config.port)
            };

            let client = redis::Client::open(url).map_err(|e| format!("Redis URL error: {}", e))?;
            let mut con = client
                .get_multiplexed_tokio_connection()
                .await
                .map_err(|e| format!("Redis connection error: {}", e))?;

            let parts = drivers::parse_redis_command(q_trimmed);
            if parts.is_empty() {
                return Err("Empty Redis command".into());
            }

            let cmd_name = parts[0].to_uppercase();
            let mut cmd = redis::cmd(&cmd_name);
            for arg in &parts[1..] {
                cmd.arg(arg);
            }

            let val: redis::Value = cmd
                .query_async(&mut con)
                .await
                .map_err(|e| format!("Redis error: {}", e))?;

            let duration = start.elapsed().as_secs_f64() * 1000.0;

            match val {
                redis::Value::Array(items) => {
                    let mut rows = Vec::new();
                    for (idx, item) in items.iter().enumerate() {
                        let text = match item {
                            redis::Value::BulkString(bytes) => {
                                String::from_utf8_lossy(bytes).to_string()
                            }
                            redis::Value::Int(n) => n.to_string(),
                            _ => format!("{:?}", item),
                        };
                        rows.push(serde_json::json!({
                            "index": idx + 1,
                            "value": text
                        }));
                    }
                    Ok(QueryResult {
                        success: true,
                        columns: vec!["index".into(), "value".into()],
                        rows,
                        duration_ms: (duration * 10.0).round() / 10.0,
                        rows_affected: 0,
                        error: None,
                    })
                }
                redis::Value::BulkString(bytes) => {
                    let text = String::from_utf8_lossy(&bytes).to_string();
                    Ok(QueryResult {
                        success: true,
                        columns: vec!["result".into()],
                        rows: vec![serde_json::json!({ "result": text })],
                        duration_ms: (duration * 10.0).round() / 10.0,
                        rows_affected: 0,
                        error: None,
                    })
                }
                redis::Value::Int(n) => Ok(QueryResult {
                    success: true,
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({ "result": n })],
                    duration_ms: (duration * 10.0).round() / 10.0,
                    rows_affected: 0,
                    error: None,
                }),
                redis::Value::Okay => Ok(QueryResult {
                    success: true,
                    columns: vec!["status".into()],
                    rows: vec![serde_json::json!({ "status": "OK" })],
                    duration_ms: (duration * 10.0).round() / 10.0,
                    rows_affected: 0,
                    error: None,
                }),
                redis::Value::Nil => Ok(QueryResult {
                    success: true,
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({ "result": null })],
                    duration_ms: (duration * 10.0).round() / 10.0,
                    rows_affected: 0,
                    error: None,
                }),
                _ => Ok(QueryResult {
                    success: true,
                    columns: vec!["result".into()],
                    rows: vec![serde_json::json!({ "result": format!("{:?}", val) })],
                    duration_ms: (duration * 10.0).round() / 10.0,
                    rows_affected: 0,
                    error: None,
                }),
            }
        }
        "sqlite" => drivers::execute_sqlite_query(&config, q_trimmed, start).await,
        _ => Err(format!("Unsupported database engine: {}", config.engine)),
    }
}

#[tauri::command]
async fn get_tables(config: DbConfig) -> Result<Vec<TableSummary>, String> {
    match drivers::normalize_engine(&config.engine) {
        "postgres" => {
            let res = execute_query(
                config,
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name ASC;".into(),
            ).await?;
            let mut tables = Vec::new();
            for r in res.rows {
                if let Some(name) = r.get("table_name").and_then(|v| v.as_str()) {
                    tables.push(TableSummary {
                        name: name.to_string(),
                        count: "live".into(),
                    });
                }
            }
            Ok(tables)
        }
        "mysql" => {
            let res = execute_query(
                config,
                "SELECT TABLE_NAME as table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name ASC;".into()
            ).await?;
            let mut tables = Vec::new();
            for r in res.rows {
                if let Some(obj) = r.as_object() {
                    if let Some((_, val)) = obj.iter().next() {
                        if let Some(name) = val.as_str() {
                            tables.push(TableSummary {
                                name: name.to_string(),
                                count: "live".into(),
                            });
                        }
                    }
                }
            }
            Ok(tables)
        }
        "redis" => {
            let url = if let Some(pass) = config.password.filter(|p| !p.is_empty()) {
                format!("redis://:{}@{}:{}", pass, config.host, config.port)
            } else {
                format!("redis://{}:{}", config.host, config.port)
            };
            let client = redis::Client::open(url).map_err(|e| format!("Redis URL error: {}", e))?;
            let mut con = client
                .get_multiplexed_tokio_connection()
                .await
                .map_err(|e| format!("Redis connection error: {}", e))?;

            let scan_res: Result<(u64, Vec<String>), _> = redis::cmd("SCAN")
                .arg(0)
                .arg("MATCH")
                .arg("*")
                .arg("COUNT")
                .arg(100)
                .query_async(&mut con)
                .await;

            let mut tables = Vec::new();
            if let Ok((_, mut keys)) = scan_res {
                keys.sort();
                for k in keys {
                    tables.push(TableSummary {
                        name: k,
                        count: "key".into(),
                    });
                }
            }
            Ok(tables)
        }
        "sqlite" => drivers::get_sqlite_tables(config).await,
        _ => Ok(Vec::new()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            test_connection,
            execute_query,
            get_tables
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_postgres_live() {
        let config = DbConfig {
            engine: "postgres".into(),
            host: "localhost".into(),
            port: 5432,
            database: "ecom_prod_db".into(),
            username: Some("dev_user".into()),
            password: Some("dev_password".into()),
        };

        let conn_res = test_connection(config.clone()).await.unwrap();
        println!("PG Test Conn: {:?}", conn_res);
        assert!(conn_res.success);

        let q_res = execute_query(config.clone(), "SELECT * FROM users ORDER BY id ASC".into()).await.unwrap();
        println!("PG Query users: rows={:?}", q_res.rows.len());
        assert!(q_res.success);
        assert!(!q_res.rows.is_empty());

        let orders_res = execute_query(config.clone(), "SELECT * FROM user_orders ORDER BY id ASC".into()).await.unwrap();
        println!("PG Query user_orders: rows={:?}, row 0: {:?}", orders_res.rows.len(), orders_res.rows.get(0));
        assert!(orders_res.success);
        assert!(!orders_res.rows.is_empty());

        let tables = get_tables(config).await.unwrap();
        println!("PG Tables: {:?}", tables);
        assert!(tables.iter().any(|t| t.name == "users"));
    }

    #[tokio::test]
    async fn test_mysql_live() {
        let config = DbConfig {
            engine: "mysql".into(),
            host: "localhost".into(),
            port: 3306,
            database: "analytics_staging".into(),
            username: Some("dev_user".into()),
            password: Some("dev_password".into()),
        };

        let conn_res = test_connection(config.clone()).await.unwrap();
        println!("MySQL Test Conn: {:?}", conn_res);
        assert!(conn_res.success);

        let q_res = execute_query(config.clone(), "SELECT * FROM app_users ORDER BY id ASC".into()).await.unwrap();
        println!("MySQL Query app_users: rows={:?}", q_res.rows.len());
        assert!(q_res.success);
        assert!(!q_res.rows.is_empty());

        let tables = get_tables(config).await.unwrap();
        println!("MySQL Tables: {:?}", tables);
        assert!(tables.iter().any(|t| t.name == "app_users"));
    }

    #[tokio::test]
    async fn test_redis_live() {
        let config = DbConfig {
            engine: "redis".into(),
            host: "localhost".into(),
            port: 6379,
            database: "0".into(),
            username: Some("default".into()),
            password: None,
        };

        let conn_res = test_connection(config.clone()).await.unwrap();
        println!("Redis Test Conn: {:?}", conn_res);
        assert!(conn_res.success);

        let q_res = execute_query(config.clone(), "KEYS *".into()).await.unwrap();
        println!("Redis Query keys: rows={:?}", q_res.rows.len());
        assert!(q_res.success);
        assert!(!q_res.rows.is_empty());

        let tables = get_tables(config).await.unwrap();
        println!("Redis Keys as tables: {:?}", tables);
        assert!(!tables.is_empty());
    }
}

