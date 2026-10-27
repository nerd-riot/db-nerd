pub mod pool;
pub mod ssh;

use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use std::time::Instant;

/// Maximum number of rows returned to the frontend per query to prevent unbounded RAM allocation.
pub const MAX_RESULT_ROWS: usize = 5_000;
/// Maximum byte length of a single text/blob cell serialized over IPC.
pub const MAX_CELL_BYTES: usize = 32_768;

fn truncate_cell_string(mut s: String) -> String {
    if s.len() > MAX_CELL_BYTES {
        let mut boundary = MAX_CELL_BYTES;
        while boundary > 0 && !s.is_char_boundary(boundary) {
            boundary -= 1;
        }
        s.truncate(boundary);
        s.push_str("… [truncated]");
    }
    s
}

/// Strips leading whitespace, `--` single-line comments, and `/* ... */` block comments.
pub fn strip_leading_sql_comments( mut s: &str) -> &str {
    loop {
        s = s.trim_start();
        if s.starts_with("--") {
            if let Some(newline_pos) = s.find('\n') {
                s = &s[newline_pos + 1..];
            } else {
                return "";
            }
        } else if s.starts_with("/*") {
            if let Some(end_pos) = s.find("*/") {
                s = &s[end_pos + 2..];
            } else {
                return "";
            }
        } else {
            return s;
        }
    }
}

/// Determines whether a SQL statement produces a result set of rows.
pub fn is_row_returning_query(sql: &str) -> bool {
    let cleaned = strip_leading_sql_comments(sql);
    if cleaned.is_empty() {
        return false;
    }
    let first_word = cleaned
        .split(|c: char| c.is_whitespace() || c == '(' || c == ';')
        .next()
        .unwrap_or("")
        .to_uppercase();

    if matches!(
        first_word.as_str(),
        "SELECT" | "SHOW" | "EXPLAIN" | "WITH" | "DESC" | "DESCRIBE" | "VALUES" | "TABLE" | "PRAGMA"
    ) {
        return true;
    }

    // Check if single-statement DML contains a RETURNING clause
    let upper = cleaned.to_uppercase();
    if matches!(first_word.as_str(), "INSERT" | "UPDATE" | "DELETE")
        && (upper.contains(" RETURNING ") || upper.contains("\nRETURNING "))
    {
        return true;
    }

    false
}

/// Parses a Redis command string into arguments, respecting single and double quotes.
pub fn parse_redis_args(input: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quote: Option<char> = None;
    let mut escaped = false;

    for ch in input.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }
        if ch == '\\' && in_quote.is_some() {
            escaped = true;
            continue;
        }
        if let Some(q) = in_quote {
            if ch == q {
                in_quote = None;
            } else {
                current.push(ch);
            }
        } else if ch == '"' || ch == '\'' {
            in_quote = Some(ch);
        } else if ch.is_whitespace() {
            if !current.is_empty() {
                args.push(std::mem::take(&mut current));
            }
        } else {
            current.push(ch);
        }
    }
    if !current.is_empty() {
        args.push(current);
    }
    args
}

#[derive(Deserialize, Serialize, Debug, Clone, Default)]
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

#[derive(Serialize, Debug, Clone, Default)]
pub struct TableSummary {
    pub name: String,
    pub count: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_rows: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index_size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_bytes: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_bytes: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub index_bytes: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
}

pub fn format_byte_size(bytes: i64) -> String {
    if bytes <= 0 {
        return "0 bytes".to_string();
    }
    const KB: f64 = 1024.0;
    const MB: f64 = 1024.0 * 1024.0;
    const GB: f64 = 1024.0 * 1024.0 * 1024.0;
    const TB: f64 = 1024.0 * 1024.0 * 1024.0 * 1024.0;

    let b = bytes as f64;
    let raw = if b >= TB {
        let val = b / TB;
        if val >= 10.0 {
            format!("{:.1} TB", val)
        } else {
            format!("{:.2} TB", val)
        }
    } else if b >= GB {
        let val = b / GB;
        if val >= 10.0 {
            format!("{:.1} GB", val)
        } else {
            format!("{:.2} GB", val)
        }
    } else if b >= MB {
        let val = b / MB;
        if val >= 10.0 {
            format!("{:.0} MB", val.round())
        } else if (val.fract() * 10.0).round() == 0.0 {
            format!("{:.0} MB", val)
        } else {
            format!("{:.1} MB", val)
        }
    } else if b >= KB {
        format!("{:.0} KB", (b / KB).round())
    } else {
        format!("{} bytes", bytes)
    };

    if let Some(space_idx) = raw.find(' ') {
        let (num_part, unit_part) = raw.split_at(space_idx);
        let trimmed_num = if num_part.contains('.') {
            num_part.trim_end_matches('0').trim_end_matches('.')
        } else {
            num_part
        };
        format!("{}{}", trimmed_num, unit_part)
    } else {
        raw
    }
}

fn format_compact_table_badge(estimated_rows: i64, total_size: &str) -> String {
    if estimated_rows >= 1_000_000 {
        format!("{:.1}M", estimated_rows as f64 / 1_000_000.0)
    } else if estimated_rows >= 1_000 {
        format!("{:.1}K", estimated_rows as f64 / 1_000.0)
    } else if estimated_rows > 0 {
        estimated_rows.to_string()
    } else if !total_size.is_empty() && total_size != "0 bytes" {
        total_size.replace(" bytes", " B")
    } else {
        "0".to_string()
    }
}

#[tauri::command]
async fn close_connection(config: DbConfig) -> Result<(), String> {
    pool::close_pool(&config).await;
    Ok(())
}

#[tauri::command]
async fn test_connection(config: DbConfig) -> Result<TestConnectionResult, String> {
    let start = Instant::now();
    let engine = pool::normalize_engine_str(&config.engine);
    match engine {
        "postgres" => match pool::get_or_create_pg_pool(&config).await {
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
                message: e,
                latency_ms: start.elapsed().as_secs_f64() * 1000.0,
                version: None,
            }),
        },
        "mysql" => match pool::get_or_create_mysql_pool(&config).await {
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
                message: e,
                latency_ms: start.elapsed().as_secs_f64() * 1000.0,
                version: None,
            }),
        },
        "redis" => match pool::get_or_create_redis_connection(&config).await {
            Ok(mut con) => {
                let pong: Result<String, _> = redis::cmd("PING").query_async(&mut con).await;
                let latency = start.elapsed().as_secs_f64() * 1000.0;
                match pong {
                    Ok(_) => Ok(TestConnectionResult {
                        success: true,
                        message: "Successfully connected to Redis!".into(),
                        latency_ms: (latency * 10.0).round() / 10.0,
                        version: Some("Redis 7.x".into()),
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
                message: e,
                latency_ms: start.elapsed().as_secs_f64() * 1000.0,
                version: None,
            }),
        },
        _ => Err(format!("Unsupported database engine: {}", config.engine)),
    }
}

#[tauri::command]
async fn execute_query(config: DbConfig, query: String) -> Result<QueryResult, String> {
    let start = Instant::now();
    let q_trimmed = query.trim();
    let engine = pool::normalize_engine_str(&config.engine);

    match engine {
        "postgres" => {
            let pool = pool::get_or_create_pg_pool(&config).await?;

            if is_row_returning_query(q_trimmed) {
                use sqlx::{Column, Row, TypeInfo};
                let mut stream = sqlx::query(&query).fetch(&pool);
                let mut columns = Vec::new();
                let mut json_rows = Vec::new();

                while let Some(row) = stream
                    .try_next()
                    .await
                    .map_err(|e| format!("Query error: {}", e))?
                {
                    if columns.is_empty() {
                        for col in row.columns() {
                            columns.push(col.name().to_string());
                        }
                    }

                    let mut map = serde_json::Map::with_capacity(row.columns().len());
                    for (i, col) in row.columns().iter().enumerate() {
                        let col_name = col.name().to_string();
                        let type_name = col.type_info().name().to_uppercase();

                        let val: serde_json::Value = if type_name.contains("INT")
                            || type_name.contains("SERIAL")
                        {
                            if let Ok(n) = row.try_get::<i64, _>(i) {
                                serde_json::Value::Number(n.into())
                            } else if let Ok(n) = row.try_get::<i32, _>(i) {
                                serde_json::Value::Number(n.into())
                            } else if let Ok(n) = row.try_get::<i16, _>(i) {
                                serde_json::Value::Number(n.into())
                            } else {
                                serde_json::Value::Null
                            }
                        } else if type_name.contains("FLOAT") || type_name.contains("DOUBLE") {
                            if let Ok(f) = row.try_get::<f64, _>(i) {
                                serde_json::Number::from_f64(f)
                                    .map(serde_json::Value::Number)
                                    .unwrap_or(serde_json::Value::Null)
                            } else if let Ok(f) = row.try_get::<f32, _>(i) {
                                serde_json::Number::from_f64(f as f64)
                                    .map(serde_json::Value::Number)
                                    .unwrap_or(serde_json::Value::Null)
                            } else {
                                serde_json::Value::Null
                            }
                        } else if type_name.contains("NUMERIC") || type_name.contains("DECIMAL") {
                            if let Ok(d) = row.try_get::<rust_decimal::Decimal, _>(i) {
                                if let Some(n) = serde_json::Number::from_f64(
                                    d.to_string().parse::<f64>().unwrap_or(0.0),
                                ) {
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
                                serde_json::Value::String(truncate_cell_string(s))
                            } else {
                                serde_json::Value::Null
                            }
                        } else if type_name.contains("UUID") {
                            if let Ok(u) = row.try_get::<sqlx::types::Uuid, _>(i) {
                                serde_json::Value::String(u.to_string())
                            } else if let Ok(s) = row.try_get::<String, _>(i) {
                                serde_json::Value::String(truncate_cell_string(s))
                            } else {
                                serde_json::Value::Null
                            }
                        } else if let Ok(s) = row.try_get::<String, _>(i) {
                            serde_json::Value::String(truncate_cell_string(s))
                        } else if let Ok(n) = row.try_get::<i64, _>(i) {
                            serde_json::Value::Number(n.into())
                        } else {
                            serde_json::Value::Null
                        };

                        map.insert(col_name, val);
                    }
                    json_rows.push(serde_json::Value::Object(map));
                    if json_rows.len() >= MAX_RESULT_ROWS {
                        break;
                    }
                }
                drop(stream);

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
                let res = sqlx::raw_sql(&query)
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
            let pool = pool::get_or_create_mysql_pool(&config).await?;

            if is_row_returning_query(q_trimmed) {
                use sqlx::{Column, Row};
                let mut stream = sqlx::query(&query).fetch(&pool);
                let mut columns = Vec::new();
                let mut json_rows = Vec::new();

                while let Some(row) = stream
                    .try_next()
                    .await
                    .map_err(|e| format!("Query error: {}", e))?
                {
                    if columns.is_empty() {
                        for col in row.columns() {
                            columns.push(col.name().to_string());
                        }
                    }

                    let mut map = serde_json::Map::with_capacity(row.columns().len());
                    for (i, col) in row.columns().iter().enumerate() {
                        let col_name = col.name().to_string();
                        let val: serde_json::Value = if let Ok(s) = row.try_get::<String, _>(i) {
                            serde_json::Value::String(truncate_cell_string(s))
                        } else if let Ok(bytes) = row.try_get::<Vec<u8>, _>(i) {
                            serde_json::Value::String(truncate_cell_string(
                                String::from_utf8_lossy(&bytes).to_string(),
                            ))
                        } else if let Ok(n) = row.try_get::<i64, _>(i) {
                            serde_json::Value::Number(n.into())
                        } else if let Ok(f) = row.try_get::<f64, _>(i) {
                            serde_json::Number::from_f64(f)
                                .map(serde_json::Value::Number)
                                .unwrap_or(serde_json::Value::Null)
                        } else if let Ok(d) = row.try_get::<rust_decimal::Decimal, _>(i) {
                            if let Some(n) = serde_json::Number::from_f64(
                                d.to_string().parse::<f64>().unwrap_or(0.0),
                            ) {
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
                    if json_rows.len() >= MAX_RESULT_ROWS {
                        break;
                    }
                }
                drop(stream);

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
                let res = sqlx::raw_sql(&query)
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
            let mut con = pool::get_or_create_redis_connection(&config).await?;

            let parts = parse_redis_args(q_trimmed);
            if parts.is_empty() {
                return Err("Empty Redis command".into());
            }

            let cmd_name = parts[0].to_uppercase();
            let mut cmd = redis::cmd(&cmd_name);
            for arg in &parts[1..] {
                cmd.arg(arg.as_str());
            }

            let val: redis::Value = cmd
                .query_async(&mut con)
                .await
                .map_err(|e| format!("Redis error: {}", e))?;

            let duration = start.elapsed().as_secs_f64() * 1000.0;

            match val {
                redis::Value::Array(items) => {
                    let mut rows = Vec::with_capacity(items.len().min(MAX_RESULT_ROWS));
                    for (idx, item) in items.iter().take(MAX_RESULT_ROWS).enumerate() {
                        let text = match item {
                            redis::Value::BulkString(bytes) => {
                                truncate_cell_string(String::from_utf8_lossy(bytes).to_string())
                            }
                            redis::Value::Int(n) => n.to_string(),
                            _ => truncate_cell_string(format!("{:?}", item)),
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
                    let text = truncate_cell_string(String::from_utf8_lossy(&bytes).to_string());
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
                    rows: vec![serde_json::json!({
                        "result": truncate_cell_string(format!("{:?}", val))
                    })],
                    duration_ms: (duration * 10.0).round() / 10.0,
                    rows_affected: 0,
                    error: None,
                }),
            }
        }
        _ => Err(format!("Unsupported database engine: {}", config.engine)),
    }
}

#[tauri::command]
async fn get_tables(config: DbConfig) -> Result<Vec<TableSummary>, String> {
    let engine = pool::normalize_engine_str(&config.engine);
    match engine {
        "postgres" => {
            let stats_sql = r#"
                SELECT
                    c.relname AS table_name,
                    n.nspname AS schema_name,
                    CASE c.relkind
                        WHEN 'r' THEN 'TABLE'
                        WHEN 'p' THEN 'PARTITIONED'
                        WHEN 'v' THEN 'VIEW'
                        WHEN 'm' THEN 'MAT VIEW'
                        ELSE 'TABLE'
                    END AS kind,
                    CASE
                        WHEN c.reltuples > 0 THEN c.reltuples::bigint
                        WHEN COALESCE(s.n_live_tup, 0) > 0 THEN s.n_live_tup
                        ELSE 0
                    END AS estimated_rows,
                    pg_total_relation_size(c.oid) AS total_bytes,
                    pg_table_size(c.oid) AS data_bytes,
                    pg_indexes_size(c.oid) AS index_bytes,
                    COALESCE(d.description, '') AS comment
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
                LEFT JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = 0
                WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
                ORDER BY c.relname ASC;
            "#;

            let res = execute_query(config.clone(), stats_sql.into()).await;
            if let Ok(res) = res {
                if res.success && !res.rows.is_empty() {
                    let mut tables = Vec::with_capacity(res.rows.len());
                    for r in res.rows {
                        if let Some(name) = r.get("table_name").and_then(|v| v.as_str()) {
                            let est_rows = r
                                .get("estimated_rows")
                                .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse::<i64>().ok()))
                                .unwrap_or(0);
                            let total_bytes = r
                                .get("total_bytes")
                                .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse::<i64>().ok()))
                                .unwrap_or(0);
                            let data_bytes = r
                                .get("data_bytes")
                                .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse::<i64>().ok()))
                                .unwrap_or(0);
                            let index_bytes = r
                                .get("index_bytes")
                                .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse::<i64>().ok()))
                                .unwrap_or(0);

                            let total_size = format_byte_size(total_bytes);
                            let data_size = format_byte_size(data_bytes);
                            let index_size = format_byte_size(index_bytes);

                            let schema = r
                                .get("schema_name")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            let kind = r
                                .get("kind")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            let owner = r
                                .get("owner")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            let comment = r
                                .get("comment")
                                .and_then(|v| v.as_str())
                                .filter(|s| !s.is_empty())
                                .map(|s| s.to_string());

                            tables.push(TableSummary {
                                name: name.to_string(),
                                count: format_compact_table_badge(est_rows, &total_size),
                                schema,
                                kind,
                                owner,
                                estimated_rows: Some(est_rows),
                                total_size: if total_size.is_empty() || total_size == "0 bytes" { None } else { Some(total_size) },
                                data_size: Some(data_size),
                                index_size: Some(index_size),
                                total_bytes: Some(total_bytes),
                                data_bytes: Some(data_bytes),
                                index_bytes: Some(index_bytes),
                                comment,
                            });
                        }
                    }
                    return Ok(tables);
                }
            }

            // Fallback to information_schema if pg_catalog permissions are restricted
            let fallback = execute_query(
                config,
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name ASC;".into(),
            ).await?;
            let mut tables = Vec::new();
            for r in fallback.rows {
                if let Some(name) = r.get("table_name").and_then(|v| v.as_str()) {
                    tables.push(TableSummary {
                        name: name.to_string(),
                        count: "0".into(),
                        schema: Some("public".into()),
                        kind: Some("TABLE".into()),
                        ..Default::default()
                    });
                }
            }
            Ok(tables)
        }
        "mysql" => {
            let stats_sql = r#"
                SELECT
                    TABLE_NAME AS table_name,
                    TABLE_SCHEMA AS schema_name,
                    TABLE_TYPE AS kind,
                    COALESCE(ENGINE, 'InnoDB') AS owner,
                    COALESCE(TABLE_ROWS, 0) AS estimated_rows,
                    (COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0)) AS total_bytes,
                    COALESCE(DATA_LENGTH, 0) AS data_bytes,
                    COALESCE(INDEX_LENGTH, 0) AS index_bytes,
                    COALESCE(TABLE_COMMENT, '') AS comment
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                ORDER BY TABLE_NAME ASC;
            "#;
            let res = execute_query(config, stats_sql.into()).await?;
            let mut tables = Vec::new();
            for r in res.rows {
                let name_opt = r
                    .get("table_name")
                    .or_else(|| r.get("TABLE_NAME"))
                    .and_then(|v| v.as_str());
                if let Some(name) = name_opt {
                    let est_rows = r
                        .get("estimated_rows")
                        .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse::<i64>().ok()))
                        .unwrap_or(0);
                    let total_bytes = r
                        .get("total_bytes")
                        .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse::<i64>().ok()))
                        .unwrap_or(0);
                    let data_bytes = r
                        .get("data_bytes")
                        .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse::<i64>().ok()))
                        .unwrap_or(0);
                    let index_bytes = r
                        .get("index_bytes")
                        .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse::<i64>().ok()))
                        .unwrap_or(0);

                    let total_size = format_byte_size(total_bytes);
                    let data_size = format_byte_size(data_bytes);
                    let index_size = format_byte_size(index_bytes);

                    let schema = r
                        .get("schema_name")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let kind = r
                        .get("kind")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let owner = r
                        .get("owner")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let comment = r
                        .get("comment")
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string());

                    tables.push(TableSummary {
                        name: name.to_string(),
                        count: format_compact_table_badge(est_rows, &total_size),
                        schema,
                        kind,
                        owner,
                        estimated_rows: Some(est_rows),
                        total_size: if total_size.is_empty() || total_size == "0 bytes" { None } else { Some(total_size) },
                        data_size: Some(data_size),
                        index_size: Some(index_size),
                        total_bytes: Some(total_bytes),
                        data_bytes: Some(data_bytes),
                        index_bytes: Some(index_bytes),
                        comment,
                    });
                }
            }
            Ok(tables)
        }
        "redis" => {
            let mut con = pool::get_or_create_redis_connection(&config).await?;
            let mut keys: Vec<String> = Vec::new();
            let mut cursor: u64 = 0;

            for _ in 0..10 {
                let scan_res: Result<(u64, Vec<String>), _> = redis::cmd("SCAN")
                    .arg(cursor)
                    .arg("COUNT")
                    .arg(250)
                    .query_async(&mut con)
                    .await;
                match scan_res {
                    Ok((next_cursor, batch)) => {
                        for k in batch {
                            if !keys.contains(&k) {
                                keys.push(k);
                            }
                            if keys.len() >= 1_000 {
                                break;
                            }
                        }
                        if next_cursor == 0 || keys.len() >= 1_000 {
                            break;
                        }
                        cursor = next_cursor;
                    }
                    Err(_) => {
                        // Fallback if SCAN is restricted
                        if let Ok(res) = execute_query(config, "KEYS *".into()).await {
                            for r in res.rows.into_iter().take(1_000) {
                                if let Some(val) = r.get("value").and_then(|v| v.as_str()) {
                                    keys.push(val.to_string());
                                }
                            }
                        }
                        break;
                    }
                }
            }

            keys.sort();
            Ok(keys
                .into_iter()
                .map(|name| TableSummary {
                    name,
                    count: "key".into(),
                    kind: Some("KEY".into()),
                    ..Default::default()
                })
                .collect())
        }
        _ => Ok(Vec::new()),
    }
}

#[tauri::command]
async fn get_databases(config: DbConfig) -> Result<Vec<String>, String> {
    let engine = pool::normalize_engine_str(&config.engine);
    match engine {
        "postgres" => {
            let sql = "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname ASC;";
            let res = execute_query(config.clone(), sql.into()).await;
            if let Ok(res) = res {
                if res.success && !res.rows.is_empty() {
                    let mut dbs = Vec::new();
                    for r in res.rows {
                        if let Some(name) = r.get("datname").and_then(|v| v.as_str()) {
                            dbs.push(name.to_string());
                        }
                    }
                    if !dbs.is_empty() {
                        return Ok(dbs);
                    }
                }
            }

            // Fallback: try table_catalog if pg_database has restricted permissions
            let fallback_sql = "SELECT DISTINCT table_catalog FROM information_schema.tables ORDER BY table_catalog ASC;";
            if let Ok(res) = execute_query(config.clone(), fallback_sql.into()).await {
                let mut dbs = Vec::new();
                for r in res.rows {
                    if let Some(name) = r.get("table_catalog").and_then(|v| v.as_str()) {
                        dbs.push(name.to_string());
                    }
                }
                if !dbs.is_empty() {
                    return Ok(dbs);
                }
            }

            Ok(vec![config.database])
        }
        "mysql" => {
            let res = execute_query(config.clone(), "SHOW DATABASES;".into()).await;
            if let Ok(res) = res {
                if res.success && !res.rows.is_empty() {
                    let mut dbs = Vec::new();
                    for r in res.rows {
                        let name_opt = r
                            .get("Database")
                            .or_else(|| r.get("SCHEMA_NAME"))
                            .or_else(|| r.as_object().and_then(|m| m.values().next()))
                            .and_then(|v| v.as_str());
                        if let Some(name) = name_opt {
                            dbs.push(name.to_string());
                        }
                    }
                    if !dbs.is_empty() {
                        return Ok(dbs);
                    }
                }
            }
            Ok(vec![config.database])
        }
        "redis" => {
            let list = (0..16).map(|i| i.to_string()).collect();
            Ok(list)
        }
        _ => Ok(vec![config.database]),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            test_connection,
            execute_query,
            get_tables,
            get_databases,
            close_connection
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
            ..Default::default()
        };

        let conn_res = test_connection(config.clone()).await.unwrap();
        if !conn_res.success {
            println!("Skipping live PG test (service not running): {}", conn_res.message);
            return;
        }

        let q_res = execute_query(config.clone(), "SELECT * FROM users ORDER BY id ASC".into()).await.unwrap();
        assert!(q_res.success);
        assert!(!q_res.rows.is_empty());

        let orders_res = execute_query(config.clone(), "SELECT * FROM user_orders ORDER BY id ASC".into()).await.unwrap();
        assert!(orders_res.success);
        assert!(!orders_res.rows.is_empty());

        let tables = get_tables(config).await.unwrap();
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
            ..Default::default()
        };

        let conn_res = test_connection(config.clone()).await.unwrap();
        if !conn_res.success {
            println!("Skipping live MySQL test (service not running): {}", conn_res.message);
            return;
        }

        let q_res = execute_query(config.clone(), "SELECT * FROM app_users ORDER BY id ASC".into()).await.unwrap();
        assert!(q_res.success);
        assert!(!q_res.rows.is_empty());

        let tables = get_tables(config).await.unwrap();
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
            ..Default::default()
        };

        let conn_res = test_connection(config.clone()).await.unwrap();
        if !conn_res.success {
            println!("Skipping live Redis test (service not running): {}", conn_res.message);
            return;
        }

        let q_res = execute_query(config.clone(), "KEYS *".into()).await.unwrap();
        assert!(q_res.success);
        assert!(!q_res.rows.is_empty());

        let tables = get_tables(config).await.unwrap();
        assert!(!tables.is_empty());
    }


    #[test]
    fn test_is_row_returning_query_with_comments_and_returning() {
        assert!(is_row_returning_query(
            "-- Query 1\n/* comment */\nSELECT * FROM users;"
        ));
        assert!(is_row_returning_query("WITH cte AS (SELECT 1) SELECT * FROM cte"));
        assert!(is_row_returning_query(
            "INSERT INTO users (name) VALUES ('Alice') RETURNING id, name"
        ));
        assert!(!is_row_returning_query(
            "BEGIN TRANSACTION;\nUPDATE users SET name = 'Bob' WHERE id = 1;\nCOMMIT;"
        ));
        assert!(!is_row_returning_query("-- only comments\n/* nothing else */"));
    }

    #[test]
    fn test_parse_redis_args_handles_quotes_and_escapes() {
        let parsed = parse_redis_args("SET user:1:name \"Khoa Nguyen\" EX 60");
        assert_eq!(
            parsed,
            vec!["SET", "user:1:name", "Khoa Nguyen", "EX", "60"]
        );

        let escaped = parse_redis_args("HSET profile bio \"He said \\\"Hello\\\"\"");
        assert_eq!(
            escaped,
            vec!["HSET", "profile", "bio", "He said \"Hello\""]
        );
    }

    #[test]
    fn test_truncate_cell_string_bounds_memory_and_utf8() {
        let huge = "a".repeat(MAX_CELL_BYTES + 500);
        let truncated = truncate_cell_string(huge);
        assert!(truncated.len() < MAX_CELL_BYTES + 32);
        assert!(truncated.ends_with("… [truncated]"));

        // Multi-byte UTF-8 safety test (Vietnamese / emoji characters at boundary)
        let utf8_str = "⚡".repeat((MAX_CELL_BYTES / 3) + 10);
        let truncated_utf8 = truncate_cell_string(utf8_str);
        assert!(truncated_utf8.ends_with("… [truncated]"));
    }

    #[test]
    fn test_format_compact_table_badge() {
        assert_eq!(format_compact_table_badge(4_781_585, "1200 MB"), "4.8M");
        assert_eq!(format_compact_table_badge(12_450, "480 KB"), "12.4K");
        assert_eq!(format_compact_table_badge(350, "16 KB"), "350");
        assert_eq!(format_compact_table_badge(0, "8192 bytes"), "8192 B");
        assert_eq!(format_compact_table_badge(0, ""), "0");
    }

    #[test]
    fn test_format_byte_size() {
        assert_eq!(format_byte_size(0), "0 bytes");
        assert_eq!(format_byte_size(512), "512 bytes");
        assert_eq!(format_byte_size(1024), "1 KB");
        assert_eq!(format_byte_size(98304), "96 KB");
        assert_eq!(format_byte_size(8 * 1024 * 1024), "8 MB");
        assert_eq!(format_byte_size(834 * 1024 * 1024), "834 MB");
        assert_eq!(format_byte_size(950 * 1024 * 1024), "950 MB");
        // 5.94 GB = 6_378_041_344 bytes
        assert_eq!(format_byte_size(6_378_041_344), "5.94 GB");
        assert_eq!(format_byte_size(1_116_691_497), "1.04 GB");
    }
}


