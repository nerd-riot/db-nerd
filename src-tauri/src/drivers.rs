use crate::{DbConfig, QueryResult, TableSummary, TestConnectionResult};
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Column, Row, SqlitePool, TypeInfo};
use std::str::FromStr;
use std::time::Instant;

/// Normalizes engine identifiers to supported native backend driver families.
pub fn normalize_engine(engine: &str) -> &str {
    match engine.trim().to_ascii_lowercase().as_str() {
        "postgres" | "postgresql" | "cockroach" | "redshift" | "greenplum" | "vertica" => {
            "postgres"
        }
        "mysql" | "mariadb" => "mysql",
        "sqlite" | "libsql" | "duckdb" | "cloudflare_d1" => "sqlite",
        "redis" => "redis",
        _ => engine,
    }
}

/// Determines whether a SQL statement returns a result set (including `RETURNING`, `PRAGMA`, `VALUES`, `TABLE`).
pub fn query_returns_rows(query: &str) -> bool {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return false;
    }
    let upper = trimmed.to_ascii_uppercase();
    let first_word = upper.split_whitespace().next().unwrap_or("");
    if matches!(
        first_word,
        "SELECT" | "SHOW" | "EXPLAIN" | "WITH" | "DESC" | "DESCRIBE" | "PRAGMA" | "VALUES" | "TABLE"
    ) {
        return true;
    }

    // Check for RETURNING clause on INSERT / UPDATE / DELETE statements
    if matches!(first_word, "INSERT" | "UPDATE" | "DELETE") {
        return upper
            .split(|c: char| !c.is_ascii_alphanumeric() && c != '_')
            .any(|tok| tok == "RETURNING");
    }

    false
}

/// Parses a Redis command string into arguments while preserving quoted strings and escaped characters.
pub fn parse_redis_command(input: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_single = false;
    let mut in_double = false;
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if in_single {
            if ch == '\'' {
                in_single = false;
            } else {
                current.push(ch);
            }
        } else if in_double {
            if ch == '\\' {
                if let Some(next) = chars.next() {
                    current.push(next);
                }
            } else if ch == '"' {
                in_double = false;
            } else {
                current.push(ch);
            }
        } else {
            match ch {
                '\'' => in_single = true,
                '"' => in_double = true,
                c if c.is_whitespace() => {
                    if !current.is_empty() {
                        args.push(std::mem::take(&mut current));
                    }
                }
                _ => current.push(ch),
            }
        }
    }

    if !current.is_empty() {
        args.push(current);
    }
    args
}

/// Extracts `redis_version` from Redis `INFO server` output.
pub fn extract_redis_version(info: &str) -> Option<String> {
    for line in info.lines() {
        if let Some(ver) = line.strip_prefix("redis_version:") {
            let trimmed = ver.trim();
            if !trimmed.is_empty() {
                return Some(format!("Redis {}", trimmed));
            }
        }
    }
    None
}

fn build_sqlite_options(config: &DbConfig) -> Result<SqliteConnectOptions, String> {
    let db = config.database.trim();
    if db.is_empty() || db == ":memory:" {
        SqliteConnectOptions::from_str("sqlite::memory:")
            .map_err(|e| format!("Invalid SQLite options: {}", e))
    } else {
        let url = if db.starts_with("sqlite:") {
            db.to_string()
        } else {
            format!("sqlite://{}", db)
        };
        SqliteConnectOptions::from_str(&url)
            .map(|opts| opts.create_if_missing(true))
            .map_err(|e| format!("Invalid SQLite path '{}': {}", db, e))
    }
}

pub async fn test_sqlite(config: &DbConfig, start: Instant) -> Result<TestConnectionResult, String> {
    let opts = match build_sqlite_options(config) {
        Ok(o) => o,
        Err(e) => {
            return Ok(TestConnectionResult {
                success: false,
                message: e,
                latency_ms: start.elapsed().as_secs_f64() * 1000.0,
                version: None,
            })
        }
    };

    match SqlitePool::connect_with(opts).await {
        Ok(pool) => {
            let version_row: Result<(String,), _> =
                sqlx::query_as("SELECT sqlite_version()").fetch_one(&pool).await;
            let version = version_row.map(|r| format!("SQLite {}", r.0)).ok();
            let latency = start.elapsed().as_secs_f64() * 1000.0;
            Ok(TestConnectionResult {
                success: true,
                message: "Successfully connected to SQLite!".into(),
                latency_ms: (latency * 10.0).round() / 10.0,
                version,
            })
        }
        Err(e) => Ok(TestConnectionResult {
            success: false,
            message: format!("SQLite connection failed: {}", e),
            latency_ms: start.elapsed().as_secs_f64() * 1000.0,
            version: None,
        }),
    }
}

pub async fn execute_sqlite_query(
    config: &DbConfig,
    query: &str,
    start: Instant,
) -> Result<QueryResult, String> {
    let opts = build_sqlite_options(config)?;
    let pool = SqlitePool::connect_with(opts)
        .await
        .map_err(|e| format!("SQLite connection error: {}", e))?;

    if query_returns_rows(query) {
        let rows = sqlx::query(query)
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
                let val: serde_json::Value = if type_name.contains("INT") {
                    if let Ok(n) = row.try_get::<i64, _>(i) {
                        serde_json::Value::Number(n.into())
                    } else {
                        serde_json::Value::Null
                    }
                } else if type_name.contains("REAL") || type_name.contains("FLOA") || type_name.contains("DOUB") {
                    if let Ok(f) = row.try_get::<f64, _>(i) {
                        serde_json::Number::from_f64(f)
                            .map(serde_json::Value::Number)
                            .unwrap_or(serde_json::Value::Null)
                    } else {
                        serde_json::Value::Null
                    }
                } else if type_name.contains("BOOL") {
                    if let Ok(b) = row.try_get::<bool, _>(i) {
                        serde_json::Value::Bool(b)
                    } else {
                        serde_json::Value::Null
                    }
                } else if let Ok(s) = row.try_get::<String, _>(i) {
                    serde_json::Value::String(s)
                } else if let Ok(n) = row.try_get::<i64, _>(i) {
                    serde_json::Value::Number(n.into())
                } else if let Ok(f) = row.try_get::<f64, _>(i) {
                    serde_json::Number::from_f64(f)
                        .map(serde_json::Value::Number)
                        .unwrap_or(serde_json::Value::Null)
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
        let res = sqlx::query(query)
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

pub async fn get_sqlite_tables(config: DbConfig) -> Result<Vec<TableSummary>, String> {
    let res = execute_sqlite_query(
        &config,
        "SELECT name AS table_name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name ASC;",
        Instant::now(),
    )
    .await?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_query_returns_rows_detects_returning_and_pragma() {
        assert!(query_returns_rows("SELECT * FROM users"));
        assert!(query_returns_rows("PRAGMA table_info(users)"));
        assert!(query_returns_rows(
            "INSERT INTO users (email) VALUES ('a@b.com') RETURNING id, email;"
        ));
        assert!(query_returns_rows(
            "UPDATE users SET status = 'active' WHERE id = 1 returning *"
        ));
        assert!(!query_returns_rows(
            "UPDATE users SET status = 'active' WHERE id = 1"
        ));
    }

    #[test]
    fn test_parse_redis_command_handles_quotes() {
        assert_eq!(
            parse_redis_command("SET user:1:greeting \"hello world from redis\""),
            vec!["SET", "user:1:greeting", "hello world from redis"]
        );
        assert_eq!(
            parse_redis_command("HSET profile name 'Khoa Nguyen'"),
            vec!["HSET", "profile", "name", "Khoa Nguyen"]
        );
    }
}
