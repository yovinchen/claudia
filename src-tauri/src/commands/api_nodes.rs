use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

/// API 节点数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiNode {
    pub id: String,
    pub name: String,
    pub url: String,
    pub adapter: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// 创建节点请求
#[derive(Debug, Deserialize)]
pub struct CreateApiNodeRequest {
    pub name: String,
    pub url: String,
    pub adapter: String,
    pub description: Option<String>,
}

/// 更新节点请求
#[derive(Debug, Deserialize)]
pub struct UpdateApiNodeRequest {
    pub name: Option<String>,
    pub url: Option<String>,
    pub description: Option<String>,
    pub enabled: Option<bool>,
}

/// 节点测试结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeTestResult {
    pub node_id: String,
    pub url: String,
    pub name: String,
    pub response_time: Option<u64>,
    pub status: String,
    pub error: Option<String>,
}

/// 获取数据库连接
fn get_connection() -> Result<Connection> {
    let db_path = get_nodes_db_path()?;
    let conn = Connection::open(&db_path)
        .context(format!("Failed to open database at {:?}", db_path))?;
    Ok(conn)
}

/// 获取节点数据库路径
fn get_nodes_db_path() -> Result<PathBuf> {
    let home = dirs::home_dir().context("Could not find home directory")?;
    let db_dir = home.join(".claudia");
    std::fs::create_dir_all(&db_dir).context("Failed to create database directory")?;
    Ok(db_dir.join("api_nodes.db"))
}

/// 初始化数据库表
pub fn init_nodes_db() -> Result<()> {
    let conn = get_connection()?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS api_nodes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            url TEXT NOT NULL UNIQUE,
            adapter TEXT NOT NULL,
            description TEXT,
            enabled INTEGER DEFAULT 1,
            is_default INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    // 创建索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_api_nodes_adapter ON api_nodes(adapter)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_api_nodes_enabled ON api_nodes(enabled)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_api_nodes_is_default ON api_nodes(is_default)",
        [],
    )?;

    Ok(())
}

/// 预设节点配置
const DEFAULT_NODES: &[(&str, &str, &str, &str)] = &[
    // PackyCode
    ("🚌 默认节点", "https://www.packyapi.com", "packycode", "PackyCode 默认节点"),
    ("⚖️ 负载均衡", "https://api-slb.packyapi.com", "packycode", "PackyCode 负载均衡节点"),

    // DeepSeek
    ("默认节点", "https://api.deepseek.com/anthropic", "deepseek", "DeepSeek 官方节点"),

    // GLM
    ("默认节点", "https://open.bigmodel.cn/api/anthropic", "glm", "智谱 GLM 官方节点"),

    // Qwen
    ("默认节点", "https://dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy", "qwen", "通义千问官方节点"),

    // Kimi
    ("默认节点", "https://api.moonshot.cn/anthropic", "kimi", "Moonshot Kimi 官方节点"),

    // MiniMax
    ("默认节点", "https://api.minimaxi.com/anthropic", "minimax", "MiniMax 官方节点"),
    ("备用节点", "https://api.minimaxi.io/anthropic", "minimax", "MiniMax 备用节点"),
];

/// 初始化预设节点
#[tauri::command]
pub async fn init_default_nodes() -> Result<(), String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    for (name, url, adapter, description) in DEFAULT_NODES {
        // 检查是否已存在
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM api_nodes WHERE url = ?1",
                params![url],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        if !exists {
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO api_nodes (id, name, url, adapter, description, enabled, is_default, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 1, 1, ?6, ?7)",
                params![id, name, url, adapter, description, now, now],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

/// 获取节点列表
#[tauri::command]
pub async fn list_api_nodes(
    adapter: Option<String>,
    enabled_only: Option<bool>,
) -> Result<Vec<ApiNode>, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;

    let mut sql = "SELECT id, name, url, adapter, description, enabled, is_default, created_at, updated_at FROM api_nodes WHERE 1=1".to_string();

    if let Some(adapter_filter) = &adapter {
        sql.push_str(&format!(" AND adapter = '{}'", adapter_filter));
    }

    if enabled_only.unwrap_or(false) {
        sql.push_str(" AND enabled = 1");
    }

    sql.push_str(" ORDER BY is_default DESC, created_at ASC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let nodes = stmt
        .query_map([], |row| {
            Ok(ApiNode {
                id: row.get(0)?,
                name: row.get(1)?,
                url: row.get(2)?,
                adapter: row.get(3)?,
                description: row.get(4)?,
                enabled: row.get::<_, i32>(5)? != 0,
                is_default: row.get::<_, i32>(6)? != 0,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    Ok(nodes)
}

/// 创建节点
#[tauri::command]
pub async fn create_api_node(request: CreateApiNodeRequest) -> Result<ApiNode, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    // 检查 URL 是否已存在
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM api_nodes WHERE url = ?1",
            params![&request.url],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if exists {
        return Err("节点 URL 已存在".to_string());
    }

    conn.execute(
        "INSERT INTO api_nodes (id, name, url, adapter, description, enabled, is_default, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, 0, ?6, ?7)",
        params![
            &id,
            &request.name,
            &request.url,
            &request.adapter,
            &request.description,
            &now,
            &now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(ApiNode {
        id,
        name: request.name,
        url: request.url,
        adapter: request.adapter,
        description: request.description,
        enabled: true,
        is_default: false,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// 更新节点
#[tauri::command]
pub async fn update_api_node(id: String, request: UpdateApiNodeRequest) -> Result<ApiNode, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();

    // 检查节点是否存在
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM api_nodes WHERE id = ?1",
            params![&id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if !exists {
        return Err("节点不存在".to_string());
    }

    // 构建动态 SQL
    let mut updates = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(name) = &request.name {
        updates.push("name = ?");
        params_vec.push(Box::new(name.clone()));
    }
    if let Some(url) = &request.url {
        updates.push("url = ?");
        params_vec.push(Box::new(url.clone()));
    }
    if let Some(description) = &request.description {
        updates.push("description = ?");
        params_vec.push(Box::new(description.clone()));
    }
    if let Some(enabled) = request.enabled {
        updates.push("enabled = ?");
        params_vec.push(Box::new(if enabled { 1 } else { 0 }));
    }

    updates.push("updated_at = ?");
    params_vec.push(Box::new(now.clone()));
    params_vec.push(Box::new(id.clone()));

    let sql = format!(
        "UPDATE api_nodes SET {} WHERE id = ?",
        updates.join(", ")
    );

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, params_refs.as_slice())
        .map_err(|e| e.to_string())?;

    // 获取更新后的节点
    let node = conn
        .query_row(
            "SELECT id, name, url, adapter, description, enabled, is_default, created_at, updated_at FROM api_nodes WHERE id = ?1",
            params![&id],
            |row| {
                Ok(ApiNode {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    url: row.get(2)?,
                    adapter: row.get(3)?,
                    description: row.get(4)?,
                    enabled: row.get::<_, i32>(5)? != 0,
                    is_default: row.get::<_, i32>(6)? != 0,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(node)
}

/// 删除节点
#[tauri::command]
pub async fn delete_api_node(id: String) -> Result<(), String> {
    let conn = get_connection().map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM api_nodes WHERE id = ?1", params![&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 测试单个节点
#[tauri::command]
pub async fn test_api_node(url: String, timeout_ms: Option<u64>) -> Result<NodeTestResult, String> {
    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(5000));
    let start = std::time::Instant::now();

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| e.to_string())?;

    // 使用 HEAD 请求测试连通性，更轻量且不会触发 API 调用
    match client.head(&url).send().await {
        Ok(response) => {
            let response_time = start.elapsed().as_millis() as u64;
            // 允许 2xx, 3xx, 4xx 状态码，说明服务器在线（5xx 视为失败）
            let status_code = response.status();
            let status = if status_code.is_success()
                || status_code.is_redirection()
                || status_code.is_client_error() {
                "success"
            } else {
                "failed"
            };

            Ok(NodeTestResult {
                node_id: String::new(),
                url: url.clone(),
                name: String::new(),
                response_time: Some(response_time),
                status: status.to_string(),
                error: if status == "failed" {
                    Some(format!("HTTP {}", status_code))
                } else {
                    None
                },
            })
        }
        Err(e) => Ok(NodeTestResult {
            node_id: String::new(),
            url: url.clone(),
            name: String::new(),
            response_time: None,
            status: "failed".to_string(),
            error: Some(e.to_string()),
        }),
    }
}

/// 批量测试节点
#[tauri::command]
pub async fn test_all_api_nodes(
    adapter: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<Vec<NodeTestResult>, String> {
    let nodes = list_api_nodes(adapter, Some(true)).await?;
    let mut results = Vec::new();

    for node in nodes {
        let result = test_api_node(node.url.clone(), timeout_ms).await?;
        results.push(NodeTestResult {
            node_id: node.id.clone(),
            name: node.name.clone(),
            ..result
        });
    }

    Ok(results)
}
