use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{command, State};
use anyhow::Result;
use chrono::Utc;
use rusqlite::{params, Connection, Row, OptionalExtension};
use uuid::Uuid;

use crate::commands::agents::AgentDb;
use crate::i18n;
use crate::claude_config;

/// 中转站适配器类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RelayStationAdapter {
    Packycode, // PackyCode 平台（放在第一位）
    Deepseek,  // DeepSeek v3.1
    Glm,       // 智谱GLM
    Qwen,      // 千问Qwen
    Kimi,      // Kimi k2
    Custom,    // 自定义简单配置
}

impl RelayStationAdapter {
    pub fn as_str(&self) -> &str {
        match self {
            RelayStationAdapter::Packycode => "packycode",
            RelayStationAdapter::Deepseek => "deepseek",
            RelayStationAdapter::Glm => "glm",
            RelayStationAdapter::Qwen => "qwen",
            RelayStationAdapter::Kimi => "kimi",
            RelayStationAdapter::Custom => "custom",
        }
    }
}

/// 认证方式
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    BearerToken,  // Bearer Token 认证（推荐）
    ApiKey,       // API Key 认证
    Custom,       // 自定义认证方式
}

/// 中转站配置（完整版本）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayStation {
    pub id: String,                    // 唯一标识符
    pub name: String,                  // 显示名称
    pub description: Option<String>,   // 描述信息
    pub api_url: String,              // API 基础 URL
    pub adapter: RelayStationAdapter, // 适配器类型
    pub auth_method: AuthMethod,      // 认证方式
    pub system_token: String,         // 系统令牌
    pub user_id: Option<String>,      // 用户 ID（可选）
    pub adapter_config: Option<HashMap<String, serde_json::Value>>, // 适配器特定配置
    pub enabled: bool,                // 启用状态
    pub display_order: i32,          // 显示顺序
    pub created_at: i64,             // 创建时间
    pub updated_at: i64,             // 更新时间
}

/// 创建中转站请求（无自动生成字段）
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateRelayStationRequest {
    pub name: String,
    pub description: Option<String>,
    pub api_url: String,
    pub adapter: RelayStationAdapter,
    pub auth_method: AuthMethod,
    pub system_token: String,
    pub user_id: Option<String>,
    pub adapter_config: Option<HashMap<String, serde_json::Value>>,
    pub enabled: bool,
}

/// 更新中转站请求
#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateRelayStationRequest {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub api_url: String,
    pub adapter: RelayStationAdapter,
    pub auth_method: AuthMethod,
    pub system_token: String,
    pub user_id: Option<String>,
    pub adapter_config: Option<HashMap<String, serde_json::Value>>,
    pub enabled: bool,
}

/// 站点信息（统一格式）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StationInfo {
    pub name: String,                                              // 站点名称
    pub announcement: Option<String>,                              // 公告信息
    pub api_url: String,                                          // API 地址
    pub version: Option<String>,                                  // 版本信息
    pub metadata: Option<HashMap<String, serde_json::Value>>,     // 扩展元数据
    pub quota_per_unit: Option<i64>,                             // 单位配额（用于价格转换）
}

/// 用户信息（统一格式）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub user_id: String,                                          // 用户 ID
    pub username: Option<String>,                                 // 用户名
    pub email: Option<String>,                                    // 邮箱
    pub balance_remaining: Option<f64>,                          // 剩余余额（美元）
    pub amount_used: Option<f64>,                                // 已用金额（美元）
    pub request_count: Option<i64>,                              // 请求次数
    pub status: Option<String>,                                   // 账户状态
    pub metadata: Option<HashMap<String, serde_json::Value>>,     // 原始数据
}

/// 连接测试结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionTestResult {
    pub success: bool,                // 连接是否成功
    pub response_time: Option<u64>,   // 响应时间（毫秒）
    pub message: String,              // 结果消息
    pub error: Option<String>,        // 错误信息
}

/// Token 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenInfo {
    pub id: String,
    pub name: String,
    pub token: String,
    pub quota: Option<i64>,
    pub used_quota: Option<i64>,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Token 分页响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenPaginationResponse {
    pub tokens: Vec<TokenInfo>,
    pub total: i64,
    pub page: usize,
    pub size: usize,
    pub has_more: bool,
}

impl RelayStation {
    pub fn from_row(row: &Row) -> Result<Self, rusqlite::Error> {
        let adapter_str: String = row.get("adapter")?;
        let auth_method_str: String = row.get("auth_method")?;
        let adapter_config_str: Option<String> = row.get("adapter_config")?;

        let adapter = serde_json::from_str(&format!("\"{}\"", adapter_str))
            .map_err(|_| rusqlite::Error::InvalidColumnType(0, "adapter".to_string(), rusqlite::types::Type::Text))?;
        
        let auth_method = serde_json::from_str(&format!("\"{}\"", auth_method_str))
            .map_err(|_| rusqlite::Error::InvalidColumnType(0, "auth_method".to_string(), rusqlite::types::Type::Text))?;
        
        let adapter_config = if let Some(config_str) = adapter_config_str {
            if config_str.trim().is_empty() {
                None
            } else {
                Some(serde_json::from_str(&config_str)
                    .map_err(|_| rusqlite::Error::InvalidColumnType(0, "adapter_config".to_string(), rusqlite::types::Type::Text))?)
            }
        } else {
            None
        };

        Ok(RelayStation {
            id: row.get("id")?,
            name: row.get("name")?,
            description: row.get("description")?,
            api_url: row.get("api_url")?,
            adapter,
            auth_method,
            system_token: row.get("system_token")?,
            user_id: row.get("user_id")?,
            adapter_config,
            enabled: row.get::<_, i32>("enabled")? == 1,
            display_order: row.get::<_, i32>("display_order").unwrap_or(0),
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

/// 初始化中转站数据库表
pub fn init_relay_stations_tables(conn: &Connection) -> Result<()> {
    // 中转站表
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS relay_stations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            api_url TEXT NOT NULL,
            adapter TEXT NOT NULL,
            auth_method TEXT NOT NULL,
            system_token TEXT NOT NULL,
            user_id TEXT,
            adapter_config TEXT,
            enabled INTEGER NOT NULL DEFAULT 1,
            display_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
        [],
    )?;

    // 中转站使用日志表
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS relay_station_usage_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            station_id TEXT NOT NULL,
            request_type TEXT NOT NULL,
            response_time INTEGER,
            success INTEGER NOT NULL,
            error_message TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (station_id) REFERENCES relay_stations (id) ON DELETE CASCADE
        )
        "#,
        [],
    )?;

    log::info!("Relay stations database tables initialized");
    Ok(())
}

/// 获取所有中转站
#[command]
pub async fn relay_stations_list(db: State<'_, AgentDb>) -> Result<Vec<RelayStation>, String> {
    let conn = db.0.lock().map_err(|e| {
        log::error!("Failed to acquire database lock: {}", e);
        i18n::t("database.lock_failed")
    })?;

    // 确保表存在
    init_relay_stations_tables(&conn).map_err(|e| {
        log::error!("Failed to initialize relay stations tables: {}", e);
        i18n::t("database.init_failed")
    })?;

    // 添加 display_order 列（如果不存在）
    let _ = conn.execute(
        "ALTER TABLE relay_stations ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0",
        [],
    );

    let mut stmt = conn.prepare("SELECT * FROM relay_stations ORDER BY display_order ASC, created_at DESC")
        .map_err(|e| {
            log::error!("Failed to prepare statement: {}", e);
            i18n::t("database.query_failed")
        })?;

    let stations = stmt.query_map([], |row| RelayStation::from_row(row))
        .map_err(|e| {
            log::error!("Failed to query relay stations: {}", e);
            i18n::t("database.query_failed")
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| {
            log::error!("Failed to collect relay stations: {}", e);
            i18n::t("database.query_failed")
        })?;

    log::info!("Retrieved {} relay stations", stations.len());
    Ok(stations)
}

/// 获取单个中转站
#[command]
pub async fn relay_station_get(
    id: String,
    db: State<'_, AgentDb>
) -> Result<RelayStation, String> {
    let conn = db.0.lock().map_err(|e| {
        log::error!("Failed to acquire database lock: {}", e);
        i18n::t("database.lock_failed")
    })?;

    let mut stmt = conn.prepare("SELECT * FROM relay_stations WHERE id = ?1")
        .map_err(|e| {
            log::error!("Failed to prepare statement: {}", e);
            i18n::t("database.query_failed")
        })?;

    let station = stmt.query_row(params![id], |row| RelayStation::from_row(row))
        .map_err(|e| {
            log::error!("Failed to get relay station {}: {}", id, e);
            i18n::t("relay_station.not_found")
        })?;

    log::info!("Retrieved relay station: {}", id);
    Ok(station)
}

/// 创建中转站
#[command]
pub async fn relay_station_create(
    request: CreateRelayStationRequest,
    db: State<'_, AgentDb>
) -> Result<RelayStation, String> {
    let conn = db.0.lock().map_err(|e| {
        log::error!("Failed to acquire database lock: {}", e);
        i18n::t("database.lock_failed")
    })?;

    // 确保表存在
    init_relay_stations_tables(&conn).map_err(|e| {
        log::error!("Failed to initialize relay stations tables: {}", e);
        i18n::t("database.init_failed")
    })?;

    // 验证输入
    validate_relay_station_request(&request.name, &request.api_url, &request.system_token)?;

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().timestamp();

    let adapter_str = serde_json::to_string(&request.adapter)
        .map_err(|_| i18n::t("relay_station.invalid_adapter"))?
        .trim_matches('"').to_string();

    let auth_method_str = serde_json::to_string(&request.auth_method)
        .map_err(|_| i18n::t("relay_station.invalid_auth_method"))?
        .trim_matches('"').to_string();

    let adapter_config_str = request.adapter_config.as_ref()
        .map(|config| serde_json::to_string(config))
        .transpose()
        .map_err(|_| i18n::t("relay_station.invalid_config"))?;

    // 如果要启用这个新中转站，先禁用所有其他中转站
    if request.enabled {
        conn.execute(
            "UPDATE relay_stations SET enabled = 0",
            [],
        ).map_err(|e| {
            log::error!("Failed to disable other relay stations: {}", e);
            i18n::t("relay_station.create_failed")
        })?;
    }

    conn.execute(
        r#"
        INSERT INTO relay_stations 
        (id, name, description, api_url, adapter, auth_method, system_token, user_id, adapter_config, enabled, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        "#,
        params![
            id,
            request.name,
            request.description,
            request.api_url,
            adapter_str,
            auth_method_str,
            request.system_token,
            request.user_id,
            adapter_config_str,
            if request.enabled { 1 } else { 0 },
            now,
            now
        ],
    ).map_err(|e| {
        log::error!("Failed to create relay station: {}", e);
        i18n::t("relay_station.create_failed")
    })?;

    let station = RelayStation {
        id: id.clone(),
        name: request.name,
        description: request.description,
        api_url: request.api_url,
        adapter: request.adapter,
        auth_method: request.auth_method,
        system_token: request.system_token,
        user_id: request.user_id,
        adapter_config: request.adapter_config,
        enabled: request.enabled,
        display_order: 0,
        created_at: now,
        updated_at: now,
    };

    log::info!("Created relay station: {} ({})", station.name, id);
    Ok(station)
}

/// 更新中转站
#[command]
pub async fn relay_station_update(
    request: UpdateRelayStationRequest,
    db: State<'_, AgentDb>
) -> Result<RelayStation, String> {
    let conn = db.0.lock().map_err(|e| {
        log::error!("Failed to acquire database lock: {}", e);
        i18n::t("database.lock_failed")
    })?;

    // 验证输入
    validate_relay_station_request(&request.name, &request.api_url, &request.system_token)?;

    let now = Utc::now().timestamp();

    let adapter_str = serde_json::to_string(&request.adapter)
        .map_err(|_| i18n::t("relay_station.invalid_adapter"))?
        .trim_matches('"').to_string();

    let auth_method_str = serde_json::to_string(&request.auth_method)
        .map_err(|_| i18n::t("relay_station.invalid_auth_method"))?
        .trim_matches('"').to_string();

    let adapter_config_str = request.adapter_config.as_ref()
        .map(|config| serde_json::to_string(config))
        .transpose()
        .map_err(|_| i18n::t("relay_station.invalid_config"))?;

    // 如果要启用这个中转站，先禁用所有其他中转站
    if request.enabled {
        conn.execute(
            "UPDATE relay_stations SET enabled = 0 WHERE id != ?1",
            params![request.id],
        ).map_err(|e| {
            log::error!("Failed to disable other relay stations: {}", e);
            i18n::t("relay_station.update_failed")
        })?;
    }

    let rows_affected = conn.execute(
        r#"
        UPDATE relay_stations 
        SET name = ?2, description = ?3, api_url = ?4, adapter = ?5, auth_method = ?6, 
            system_token = ?7, user_id = ?8, adapter_config = ?9, enabled = ?10, updated_at = ?11
        WHERE id = ?1
        "#,
        params![
            request.id,
            request.name,
            request.description,
            request.api_url,
            adapter_str,
            auth_method_str,
            request.system_token,
            request.user_id,
            adapter_config_str,
            if request.enabled { 1 } else { 0 },
            now
        ],
    ).map_err(|e| {
        log::error!("Failed to update relay station: {}", e);
        i18n::t("relay_station.update_failed")
    })?;

    if rows_affected == 0 {
        return Err(i18n::t("relay_station.not_found"));
    }

    let station = RelayStation {
        id: request.id.clone(),
        name: request.name,
        description: request.description,
        api_url: request.api_url,
        adapter: request.adapter,
        auth_method: request.auth_method,
        system_token: request.system_token,
        user_id: request.user_id,
        adapter_config: request.adapter_config,
        enabled: request.enabled,
        display_order: 0, // 保持原有顺序
        created_at: 0, // 不重要，前端可以重新获取
        updated_at: now,
    };

    log::info!("Updated relay station: {} ({})", station.name, request.id);
    Ok(station)
}

/// 删除中转站
#[command]
pub async fn relay_station_delete(
    id: String,
    db: State<'_, AgentDb>
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| {
        log::error!("Failed to acquire database lock: {}", e);
        i18n::t("database.lock_failed")
    })?;

    let rows_affected = conn.execute("DELETE FROM relay_stations WHERE id = ?1", params![id])
        .map_err(|e| {
            log::error!("Failed to delete relay station: {}", e);
            i18n::t("relay_station.delete_failed")
        })?;

    if rows_affected == 0 {
        return Err(i18n::t("relay_station.not_found"));
    }

    log::info!("Deleted relay station: {}", id);
    Ok(i18n::t("relay_station.delete_success"))
}

/// 切换中转站启用状态（确保只有一个中转站启用）
#[command]
pub async fn relay_station_toggle_enable(
    id: String,
    enabled: bool,
    db: State<'_, AgentDb>
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| {
        log::error!("Failed to acquire database lock: {}", e);
        i18n::t("database.lock_failed")
    })?;

    let now = Utc::now().timestamp();

    // 如果要启用这个中转站，先禁用所有其他中转站
    if enabled {
        conn.execute(
            "UPDATE relay_stations SET enabled = 0, updated_at = ?1 WHERE id != ?2",
            params![now, id],
        ).map_err(|e| {
            log::error!("Failed to disable other relay stations: {}", e);
            i18n::t("relay_station.update_failed")
        })?;
        
        // 获取要启用的中转站信息
        let station = relay_station_get_internal(&conn, &id)?;
        
        // 将中转站配置应用到 Claude 配置文件
        claude_config::apply_relay_station_to_config(&station).map_err(|e| {
            log::error!("Failed to apply relay station config: {}", e);
            format!("配置文件写入失败: {}", e)
        })?;
    } else {
        // 如果禁用中转站，清除 Claude 配置中的相关设置
        if let Err(e) = claude_config::clear_relay_station_from_config() {
            log::error!("Failed to clear relay station config: {}", e);
        } else {
            log::info!("Cleared relay station config from Claude settings");
        }
    }

    // 更新目标中转站的启用状态
    let rows_affected = conn.execute(
        "UPDATE relay_stations SET enabled = ?1, updated_at = ?2 WHERE id = ?3",
        params![if enabled { 1 } else { 0 }, now, id],
    ).map_err(|e| {
        log::error!("Failed to toggle relay station enable status: {}", e);
        i18n::t("relay_station.update_failed")
    })?;

    if rows_affected == 0 {
        return Err(i18n::t("relay_station.not_found"));
    }

    log::info!("Toggled relay station enable status: {} -> {}", id, enabled);
    Ok(if enabled {
        i18n::t("relay_station.enabled_success")
    } else {
        i18n::t("relay_station.disabled_success")
    })
}

/// 内部方法：获取单个中转站
fn relay_station_get_internal(conn: &Connection, id: &str) -> Result<RelayStation, String> {
    let mut stmt = conn.prepare(
        "SELECT * FROM relay_stations WHERE id = ?1"
    ).map_err(|e| {
        log::error!("Failed to prepare statement: {}", e);
        i18n::t("database.query_failed")
    })?;

    let station = stmt.query_row(params![id], |row| {
        RelayStation::from_row(row)
    }).map_err(|e| {
        log::error!("Failed to get relay station: {}", e);
        i18n::t("relay_station.not_found")
    })?;

    Ok(station)
}

/// 输入验证
fn validate_relay_station_request(name: &str, api_url: &str, system_token: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err(i18n::t("relay_station.name_required"));
    }

    if api_url.trim().is_empty() {
        return Err(i18n::t("relay_station.api_url_required"));
    }

    // 验证 URL 格式
    let parsed_url = url::Url::parse(api_url)
        .map_err(|_| i18n::t("relay_station.invalid_url"))?;
    
    // 允许本地开发环境使用 HTTP
    let is_localhost = parsed_url.host_str()
        .map(|host| host == "localhost" || host == "127.0.0.1" || host == "::1" || host.starts_with("192.168.") || host.starts_with("10."))
        .unwrap_or(false);
    
    // 非本地环境必须使用 HTTPS
    if !is_localhost && !api_url.starts_with("https://") {
        return Err(i18n::t("relay_station.https_required"));
    }

    if system_token.trim().is_empty() {
        return Err(i18n::t("relay_station.token_required"));
    }

    if system_token.len() < 10 {
        return Err(i18n::t("relay_station.token_too_short"));
    }

    // 检查 Token 是否包含特殊字符
    if system_token.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err(i18n::t("relay_station.token_invalid_chars"));
    }

    Ok(())
}

/// Token 脱敏显示
#[allow(dead_code)]
pub fn mask_token(token: &str) -> String {
    if token.len() <= 8 {
        "*".repeat(token.len())
    } else {
        format!("{}...{}", &token[..4], &token[token.len()-4..])
    }
}

/// 手动同步中转站配置到 Claude 配置文件
#[command]
pub async fn relay_station_sync_config(
    db: State<'_, AgentDb>
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| {
        log::error!("Failed to acquire database lock: {}", e);
        i18n::t("database.lock_failed")
    })?;

    // 查找当前启用的中转站
    let mut stmt = conn.prepare(
        "SELECT * FROM relay_stations WHERE enabled = 1 LIMIT 1"
    ).map_err(|e| {
        log::error!("Failed to prepare statement: {}", e);
        i18n::t("database.query_failed")
    })?;

    let station_opt = stmt.query_row([], |row| {
        RelayStation::from_row(row)
    }).optional().map_err(|e| {
        log::error!("Failed to query enabled relay station: {}", e);
        i18n::t("database.query_failed")
    })?;

    if let Some(station) = station_opt {
        // 应用中转站配置
        claude_config::apply_relay_station_to_config(&station)
            .map_err(|e| format!("配置同步失败: {}", e))?;
        
        log::info!("Synced relay station {} config to Claude settings", station.name);
        Ok(format!("已同步中转站 {} 的配置到 Claude 设置", station.name))
    } else {
        // 没有启用的中转站，清除配置
        claude_config::clear_relay_station_from_config()
            .map_err(|e| format!("清除配置失败: {}", e))?;
        
        log::info!("Cleared relay station config from Claude settings");
        Ok("已清除 Claude 设置中的中转站配置".to_string())
    }
}

/// 恢复 Claude 配置备份
#[command]
pub async fn relay_station_restore_config() -> Result<String, String> {
    claude_config::restore_claude_config()
        .map_err(|e| format!("恢复配置失败: {}", e))?;
    
    log::info!("Restored Claude config from backup");
    Ok("已从备份恢复 Claude 配置".to_string())
}

/// 获取当前 Claude 配置中的 API 信息
#[command]
pub async fn relay_station_get_current_config() -> Result<HashMap<String, Option<String>>, String> {
    let mut config = HashMap::new();
    
    config.insert(
        "api_url".to_string(),
        claude_config::get_current_api_url().unwrap_or(None)
    );
    
    config.insert(
        "api_token".to_string(),
        claude_config::get_current_api_token().unwrap_or(None)
            .map(|token: String| {
                // 脱敏显示 token
                mask_token(&token)
            })
    );
    
    Ok(config)
}

/// 导出所有中转站配置
#[command]
pub async fn relay_stations_export(db: State<'_, AgentDb>) -> Result<Vec<RelayStation>, String> {
    let conn = db.0.lock().map_err(|e| {
        log::error!("Failed to acquire database lock: {}", e);
        i18n::t("database.lock_failed")
    })?;

    // 确保表存在
    init_relay_stations_tables(&conn).map_err(|e| {
        log::error!("Failed to initialize relay stations tables: {}", e);
        i18n::t("database.init_failed")
    })?;

    let mut stmt = conn.prepare("SELECT * FROM relay_stations ORDER BY created_at DESC")
        .map_err(|e| {
            log::error!("Failed to prepare statement: {}", e);
            i18n::t("database.query_failed")
        })?;

    let stations = stmt.query_map([], |row| RelayStation::from_row(row))
        .map_err(|e| {
            log::error!("Failed to query relay stations: {}", e);
            i18n::t("database.query_failed")
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| {
            log::error!("Failed to collect relay stations: {}", e);
            i18n::t("database.query_failed")
        })?;

    log::info!("Exported {} relay stations", stations.len());
    Ok(stations)
}

/// 导入结果统计
#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub total: usize,         // 总数
    pub imported: usize,      // 成功导入数
    pub skipped: usize,       // 跳过数（重复）
    pub failed: usize,        // 失败数
    pub message: String,      // 结果消息
}

/// 导入中转站配置
#[derive(Debug, Serialize, Deserialize)]
pub struct ImportRelayStationsRequest {
    pub stations: Vec<CreateRelayStationRequest>,
    pub clear_existing: bool,  // 是否清除现有配置
}

#[command]
pub async fn relay_stations_import(
    request: ImportRelayStationsRequest,
    db: State<'_, AgentDb>
) -> Result<ImportResult, String> {
    let mut conn = db.0.lock().map_err(|e| {
        log::error!("Failed to acquire database lock: {}", e);
        i18n::t("database.lock_failed")
    })?;

    // 确保表存在
    init_relay_stations_tables(&conn).map_err(|e| {
        log::error!("Failed to initialize relay stations tables: {}", e);
        i18n::t("database.init_failed")
    })?;

    // 开始事务
    let tx = conn.transaction().map_err(|e| {
        log::error!("Failed to start transaction: {}", e);
        i18n::t("database.transaction_failed")
    })?;

    // 如果需要清除现有配置
    if request.clear_existing {
        tx.execute("DELETE FROM relay_stations", [])
            .map_err(|e| {
                log::error!("Failed to clear existing relay stations: {}", e);
                i18n::t("relay_station.clear_failed")
            })?;
        log::info!("Cleared existing relay stations");
    }

    // 获取现有的中转站列表（用于重复检查）
    let existing_stations: Vec<(String, String)> = if !request.clear_existing {
        let mut stmt = tx.prepare("SELECT api_url, system_token FROM relay_stations")
            .map_err(|e| {
                log::error!("Failed to prepare statement: {}", e);
                i18n::t("database.query_failed")
            })?;
        
        let stations_iter = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| {
            log::error!("Failed to query existing stations: {}", e);
            i18n::t("database.query_failed")
        })?;
        
        // 立即收集结果，避免生命周期问题
        let mut existing = Vec::new();
        for station_result in stations_iter {
            match station_result {
                Ok(station) => existing.push(station),
                Err(e) => {
                    log::error!("Failed to read existing station: {}", e);
                    return Err(i18n::t("database.query_failed"));
                }
            }
        }
        existing
    } else {
        Vec::new()
    };

    // 导入新的中转站
    let total = request.stations.len();
    let mut imported_count = 0;
    let mut skipped_count = 0;
    let mut failed_count = 0;
    let now = Utc::now().timestamp();

    for station_request in request.stations {
        // 验证输入
        if let Err(e) = validate_relay_station_request(&station_request.name, &station_request.api_url, &station_request.system_token) {
            log::warn!("Skipping invalid station {}: {}", station_request.name, e);
            failed_count += 1;
            continue;
        }

        // 检查是否重复（同时匹配 api_url 和 system_token）
        let is_duplicate = existing_stations.iter().any(|(url, token)| {
            url == &station_request.api_url && token == &station_request.system_token
        });

        if is_duplicate {
            log::info!("Skipping duplicate station: {} ({})", station_request.name, station_request.api_url);
            skipped_count += 1;
            continue;
        }

        let id = Uuid::new_v4().to_string();
        
        let adapter_str = serde_json::to_string(&station_request.adapter)
            .map_err(|_| i18n::t("relay_station.invalid_adapter"))?
            .trim_matches('"').to_string();

        let auth_method_str = serde_json::to_string(&station_request.auth_method)
            .map_err(|_| i18n::t("relay_station.invalid_auth_method"))?
            .trim_matches('"').to_string();

        let adapter_config_str = station_request.adapter_config.as_ref()
            .map(|config| serde_json::to_string(config))
            .transpose()
            .map_err(|_| i18n::t("relay_station.invalid_config"))?;

        match tx.execute(
            r#"
            INSERT INTO relay_stations 
            (id, name, description, api_url, adapter, auth_method, system_token, user_id, adapter_config, enabled, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            "#,
            params![
                id,
                station_request.name,
                station_request.description,
                station_request.api_url,
                adapter_str,
                auth_method_str,
                station_request.system_token,
                station_request.user_id,
                adapter_config_str,
                if station_request.enabled { 1 } else { 0 },
                now,
                now
            ],
        ) {
            Ok(_) => imported_count += 1,
            Err(e) => {
                log::error!("Failed to import relay station: {}", e);
                failed_count += 1;
            }
        }
    }

    // 提交事务
    tx.commit().map_err(|e| {
        log::error!("Failed to commit transaction: {}", e);
        i18n::t("database.transaction_failed")
    })?;

    let message = format!(
        "导入完成：总计 {} 个，成功 {} 个，跳过 {} 个（重复），失败 {} 个",
        total, imported_count, skipped_count, failed_count
    );
    
    log::info!("{}", message);
    
    Ok(ImportResult {
        total,
        imported: imported_count,
        skipped: skipped_count,
        failed: failed_count,
        message,
    })
}

/// 更新中转站排序
/// @author yovinchen
#[command]
pub async fn relay_station_update_order(
    station_ids: Vec<String>,
    db: State<'_, AgentDb>
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| {
        log::error!("Failed to acquire database lock: {}", e);
        i18n::t("database.lock_failed")
    })?;

    // 开始事务
    let tx = conn.unchecked_transaction().map_err(|e| {
        log::error!("Failed to start transaction: {}", e);
        i18n::t("database.transaction_failed")
    })?;

    // 更新每个中转站的排序
    for (index, station_id) in station_ids.iter().enumerate() {
        tx.execute(
            "UPDATE relay_stations SET display_order = ?1, updated_at = ?2 WHERE id = ?3",
            params![index as i32, Utc::now().timestamp(), station_id],
        ).map_err(|e| {
            log::error!("Failed to update station order: {}", e);
            i18n::t("database.update_failed")
        })?;
    }

    // 提交事务
    tx.commit().map_err(|e| {
        log::error!("Failed to commit transaction: {}", e);
        i18n::t("database.transaction_failed")
    })?;

    log::info!("Updated display order for {} relay stations", station_ids.len());
    Ok(())
}