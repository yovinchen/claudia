use anyhow::Result;
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Duration;
use tauri::{command, State};

use crate::commands::agents::AgentDb;
use crate::commands::relay_stations::{RelayStation, RelayStationAdapter};
use crate::i18n;

// 创建HTTP客户端的辅助函数
fn create_http_client() -> Client {
    Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .expect("Failed to create HTTP client")
}

/// 中转站信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StationInfo {
    pub name: String,
    pub announcement: Option<String>,
    pub api_url: String,
    pub version: Option<String>,
    pub metadata: Option<HashMap<String, Value>>,
    pub quota_per_unit: Option<i64>,
}

/// 用户信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub quota: i64,
    pub used_quota: i64,
    pub request_count: i64,
    pub group: String,
    pub status: String,
}

/// 连接测试结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub response_time: u64, // 响应时间（毫秒）
    pub message: String,
    pub details: Option<String>,
}

/// Token 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenInfo {
    pub id: String,
    pub name: String,
    pub key: String,
    pub quota: i64,
    pub used_quota: i64,
    pub unlimited_quota: bool,
    pub request_count: i64,
    pub status: String,
    pub created_at: u64,
    pub accessed_at: Option<u64>,
}

/// 分页信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginationInfo {
    pub current_page: usize,
    pub total_pages: usize,
    pub has_next: bool,
    pub total_items: usize,
}

/// Token 分页响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenPaginationResponse {
    pub tokens: Vec<TokenInfo>,
    pub pagination: PaginationInfo,
}

/// 中转站适配器 trait
#[async_trait]
pub trait StationAdapter: Send + Sync {
    /// 获取中转站信息
    async fn get_station_info(&self, station: &RelayStation) -> Result<StationInfo>;

    /// 获取用户信息
    async fn get_user_info(&self, station: &RelayStation, user_id: &str) -> Result<UserInfo>;

    /// 测试连接
    async fn test_connection(&self, station: &RelayStation) -> Result<ConnectionTestResult>;

    /// 获取使用日志
    async fn get_usage_logs(
        &self,
        station: &RelayStation,
        user_id: &str,
        page: Option<usize>,
        size: Option<usize>,
    ) -> Result<Value>;

    /// 列出 Tokens
    async fn list_tokens(
        &self,
        station: &RelayStation,
        page: Option<usize>,
        size: Option<usize>,
    ) -> Result<TokenPaginationResponse>;

    /// 创建 Token
    async fn create_token(
        &self,
        station: &RelayStation,
        name: &str,
        quota: Option<i64>,
    ) -> Result<TokenInfo>;

    /// 更新 Token
    async fn update_token(
        &self,
        station: &RelayStation,
        token_id: &str,
        name: Option<&str>,
        quota: Option<i64>,
    ) -> Result<TokenInfo>;

    /// 删除 Token
    async fn delete_token(&self, station: &RelayStation, token_id: &str) -> Result<String>;
}

/// PackyCode 适配器（默认使用 API Key 认证）
pub struct PackycodeAdapter;

#[async_trait]
impl StationAdapter for PackycodeAdapter {
    async fn get_station_info(&self, station: &RelayStation) -> Result<StationInfo> {
        // PackyCode 使用简单的健康检查端点
        let url = format!("{}/health", station.api_url.trim_end_matches('/'));

        let client = create_http_client();
        let response = client
            .get(&url)
            .header("X-API-Key", &station.system_token)
            .send()
            .await?;

        if response.status().is_success() {
            Ok(StationInfo {
                name: station.name.clone(),
                announcement: Some("PackyCode 服务运行正常".to_string()),
                api_url: station.api_url.clone(),
                version: Some("PackyCode v1.0".to_string()),
                metadata: Some({
                    let mut map = HashMap::new();
                    map.insert("adapter_type".to_string(), json!("packycode"));
                    map.insert(
                        "support_features".to_string(),
                        json!(["quota_query", "usage_stats"]),
                    );
                    map
                }),
                quota_per_unit: Some(1),
            })
        } else {
            Err(anyhow::anyhow!("PackyCode service unavailable"))
        }
    }

    async fn get_user_info(&self, station: &RelayStation, _user_id: &str) -> Result<UserInfo> {
        // PackyCode 用户信息获取
        let url = format!("{}/user/info", station.api_url.trim_end_matches('/'));

        let client = create_http_client();
        let response = client
            .get(&url)
            .header("X-API-Key", &station.system_token)
            .send()
            .await?;

        let data: Value = response.json().await?;

        Ok(UserInfo {
            id: "packycode_user".to_string(),
            username: data
                .get("username")
                .and_then(|v| v.as_str())
                .unwrap_or("PackyCode用户")
                .to_string(),
            display_name: Some("PackyCode用户".to_string()),
            email: data
                .get("email")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            quota: data.get("quota").and_then(|v| v.as_i64()).unwrap_or(0),
            used_quota: data.get("used_quota").and_then(|v| v.as_i64()).unwrap_or(0),
            request_count: data
                .get("request_count")
                .and_then(|v| v.as_i64())
                .unwrap_or(0),
            group: "default".to_string(),
            status: "active".to_string(),
        })
    }

    async fn test_connection(&self, station: &RelayStation) -> Result<ConnectionTestResult> {
        let start_time = std::time::Instant::now();

        match self.get_station_info(station).await {
            Ok(info) => {
                let response_time = start_time.elapsed().as_millis() as u64;
                Ok(ConnectionTestResult {
                    success: true,
                    response_time,
                    message: format!("{} - 连接成功", info.name),
                    details: Some(format!(
                        "服务版本: {}",
                        info.version.unwrap_or_else(|| "Unknown".to_string())
                    )),
                })
            }
            Err(e) => {
                let response_time = start_time.elapsed().as_millis() as u64;
                Ok(ConnectionTestResult {
                    success: false,
                    response_time,
                    message: format!("连接失败: {}", e),
                    details: None,
                })
            }
        }
    }

    async fn get_usage_logs(
        &self,
        _station: &RelayStation,
        _user_id: &str,
        _page: Option<usize>,
        _size: Option<usize>,
    ) -> Result<Value> {
        // PackyCode 暂不支持详细使用日志
        Ok(json!({
            "logs": [],
            "message": "PackyCode 暂不支持详细使用日志查询"
        }))
    }

    async fn list_tokens(
        &self,
        _station: &RelayStation,
        _page: Option<usize>,
        _size: Option<usize>,
    ) -> Result<TokenPaginationResponse> {
        // PackyCode 使用单一 Token，不支持多 Token 管理
        Err(anyhow::anyhow!(i18n::t(
            "relay_adapter.packycode_single_token"
        )))
    }

    async fn create_token(
        &self,
        _station: &RelayStation,
        _name: &str,
        _quota: Option<i64>,
    ) -> Result<TokenInfo> {
        Err(anyhow::anyhow!(i18n::t(
            "relay_adapter.packycode_single_token"
        )))
    }

    async fn update_token(
        &self,
        _station: &RelayStation,
        _token_id: &str,
        _name: Option<&str>,
        _quota: Option<i64>,
    ) -> Result<TokenInfo> {
        Err(anyhow::anyhow!(i18n::t(
            "relay_adapter.packycode_single_token"
        )))
    }

    async fn delete_token(&self, _station: &RelayStation, _token_id: &str) -> Result<String> {
        Err(anyhow::anyhow!(i18n::t(
            "relay_adapter.packycode_single_token"
        )))
    }
}

/// Custom 适配器（简化版本，仅提供基本信息）
pub struct CustomAdapter;

#[async_trait]
impl StationAdapter for CustomAdapter {
    async fn get_station_info(&self, station: &RelayStation) -> Result<StationInfo> {
        Ok(StationInfo {
            name: station.name.clone(),
            announcement: None,
            api_url: station.api_url.clone(),
            version: Some("Custom".to_string()),
            metadata: Some({
                let mut map = HashMap::new();
                map.insert("adapter_type".to_string(), json!("custom"));
                map
            }),
            quota_per_unit: None,
        })
    }

    async fn get_user_info(&self, _station: &RelayStation, user_id: &str) -> Result<UserInfo> {
        Ok(UserInfo {
            id: user_id.to_string(),
            username: "自定义用户".to_string(),
            display_name: Some("自定义适配器用户".to_string()),
            email: None,
            quota: 0,
            used_quota: 0,
            request_count: 0,
            group: "custom".to_string(),
            status: "active".to_string(),
        })
    }

    async fn test_connection(&self, station: &RelayStation) -> Result<ConnectionTestResult> {
        let start_time = std::time::Instant::now();

        // 尝试简单的 GET 请求测试连接
        let client = create_http_client();
        let response = client
            .get(&station.api_url)
            .header("Authorization", format!("Bearer {}", station.system_token))
            .timeout(Duration::from_secs(5))
            .send()
            .await;

        let response_time = start_time.elapsed().as_millis() as u64;

        match response {
            Ok(resp) => Ok(ConnectionTestResult {
                success: resp.status().is_success(),
                response_time,
                message: if resp.status().is_success() {
                    format!("{} - 连接成功", station.name)
                } else {
                    format!("HTTP {}: 服务器响应错误", resp.status())
                },
                details: Some(format!("响应状态: {}", resp.status())),
            }),
            Err(e) => Ok(ConnectionTestResult {
                success: false,
                response_time,
                message: format!("连接失败: {}", e),
                details: None,
            }),
        }
    }

    async fn get_usage_logs(
        &self,
        _station: &RelayStation,
        _user_id: &str,
        _page: Option<usize>,
        _size: Option<usize>,
    ) -> Result<Value> {
        Ok(json!({
            "logs": [],
            "message": "自定义适配器暂不支持使用日志查询"
        }))
    }

    async fn list_tokens(
        &self,
        _station: &RelayStation,
        _page: Option<usize>,
        _size: Option<usize>,
    ) -> Result<TokenPaginationResponse> {
        Err(anyhow::anyhow!(i18n::t(
            "relay_adapter.token_management_not_available"
        )))
    }

    async fn create_token(
        &self,
        _station: &RelayStation,
        _name: &str,
        _quota: Option<i64>,
    ) -> Result<TokenInfo> {
        Err(anyhow::anyhow!(i18n::t(
            "relay_adapter.token_management_not_available"
        )))
    }

    async fn update_token(
        &self,
        _station: &RelayStation,
        _token_id: &str,
        _name: Option<&str>,
        _quota: Option<i64>,
    ) -> Result<TokenInfo> {
        Err(anyhow::anyhow!(i18n::t(
            "relay_adapter.token_management_not_available"
        )))
    }

    async fn delete_token(&self, _station: &RelayStation, _token_id: &str) -> Result<String> {
        Err(anyhow::anyhow!(i18n::t(
            "relay_adapter.token_management_not_available"
        )))
    }
}

/// 适配器工厂函数
pub fn create_adapter(adapter_type: &RelayStationAdapter) -> Box<dyn StationAdapter> {
    match adapter_type {
        RelayStationAdapter::Packycode => Box::new(PackycodeAdapter),
        // DeepSeek、GLM、Qwen、Kimi 都使用简单的自定义适配器
        RelayStationAdapter::Deepseek => Box::new(CustomAdapter),
        RelayStationAdapter::Glm => Box::new(CustomAdapter),
        RelayStationAdapter::Qwen => Box::new(CustomAdapter),
        RelayStationAdapter::Kimi => Box::new(CustomAdapter),
        RelayStationAdapter::Custom => Box::new(CustomAdapter),
    }
}

/// 获取中转站信息
#[command]
pub async fn relay_station_get_info(
    station_id: String,
    db: State<'_, AgentDb>,
) -> Result<StationInfo, String> {
    // 获取中转站配置
    let station = crate::commands::relay_stations::relay_station_get(station_id, db).await?;

    // 创建适配器
    let adapter = create_adapter(&station.adapter);

    // 获取站点信息
    adapter.get_station_info(&station).await.map_err(|e| {
        log::error!("Failed to get station info: {}", e);
        i18n::t("relay_adapter.get_info_failed")
    })
}

/// 获取用户信息
#[command]
pub async fn relay_station_get_user_info(
    station_id: String,
    user_id: String,
    db: State<'_, AgentDb>,
) -> Result<UserInfo, String> {
    let station = crate::commands::relay_stations::relay_station_get(station_id, db).await?;
    let adapter = create_adapter(&station.adapter);

    adapter
        .get_user_info(&station, &user_id)
        .await
        .map_err(|e| {
            log::error!("Failed to get user info: {}", e);
            i18n::t("relay_adapter.get_user_info_failed")
        })
}

/// 测试中转站连接
#[command]
pub async fn relay_station_test_connection(
    station_id: String,
    db: State<'_, AgentDb>,
) -> Result<ConnectionTestResult, String> {
    let station = crate::commands::relay_stations::relay_station_get(station_id, db).await?;
    let adapter = create_adapter(&station.adapter);

    adapter.test_connection(&station).await.map_err(|e| {
        log::error!("Connection test failed: {}", e);
        i18n::t("relay_adapter.connection_test_failed")
    })
}

/// 获取使用日志
#[command]
pub async fn relay_station_get_usage_logs(
    station_id: String,
    user_id: String,
    page: Option<usize>,
    size: Option<usize>,
    db: State<'_, AgentDb>,
) -> Result<Value, String> {
    let station = crate::commands::relay_stations::relay_station_get(station_id, db).await?;
    let adapter = create_adapter(&station.adapter);

    adapter
        .get_usage_logs(&station, &user_id, page, size)
        .await
        .map_err(|e| {
            log::error!("Failed to get usage logs: {}", e);
            i18n::t("relay_adapter.get_usage_logs_failed")
        })
}

/// 列出 Token
#[command]
pub async fn relay_station_list_tokens(
    station_id: String,
    page: Option<usize>,
    size: Option<usize>,
    db: State<'_, AgentDb>,
) -> Result<TokenPaginationResponse, String> {
    let station = crate::commands::relay_stations::relay_station_get(station_id, db).await?;
    let adapter = create_adapter(&station.adapter);

    adapter
        .list_tokens(&station, page, size)
        .await
        .map_err(|e| {
            log::error!("Failed to list tokens: {}", e);
            i18n::t("relay_adapter.list_tokens_failed")
        })
}

/// 创建 Token
#[command]
pub async fn relay_station_create_token(
    station_id: String,
    name: String,
    quota: Option<i64>,
    db: State<'_, AgentDb>,
) -> Result<TokenInfo, String> {
    let station = crate::commands::relay_stations::relay_station_get(station_id, db).await?;
    let adapter = create_adapter(&station.adapter);

    adapter
        .create_token(&station, &name, quota)
        .await
        .map_err(|e| {
            log::error!("Failed to create token: {}", e);
            i18n::t("relay_adapter.create_token_failed")
        })
}

/// 更新 Token
#[command]
pub async fn relay_station_update_token(
    station_id: String,
    token_id: String,
    name: Option<String>,
    quota: Option<i64>,
    db: State<'_, AgentDb>,
) -> Result<TokenInfo, String> {
    let station = crate::commands::relay_stations::relay_station_get(station_id, db).await?;
    let adapter = create_adapter(&station.adapter);

    adapter
        .update_token(&station, &token_id, name.as_deref(), quota)
        .await
        .map_err(|e| {
            log::error!("Failed to update token: {}", e);
            i18n::t("relay_adapter.update_token_failed")
        })
}

/// 删除 Token
#[command]
pub async fn relay_station_delete_token(
    station_id: String,
    token_id: String,
    db: State<'_, AgentDb>,
) -> Result<String, String> {
    let station = crate::commands::relay_stations::relay_station_get(station_id, db).await?;
    let adapter = create_adapter(&station.adapter);

    adapter
        .delete_token(&station, &token_id)
        .await
        .map_err(|e| {
            log::error!("Failed to delete token: {}", e);
            i18n::t("relay_adapter.delete_token_failed")
        })
}

/// PackyCode 用户额度信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackycodeUserQuota {
    pub daily_budget_usd: f64,           // 日预算（美元）
    pub daily_spent_usd: f64,            // 日已使用（美元）
    pub monthly_budget_usd: f64,         // 月预算（美元）
    pub monthly_spent_usd: f64,          // 月已使用（美元）
    pub balance_usd: f64,                // 账户余额（美元）
    pub total_spent_usd: f64,            // 总消费（美元）
    pub plan_type: String,               // 计划类型 (pro, basic, etc.)
    pub plan_expires_at: Option<String>, // 计划过期时间
    pub username: Option<String>,        // 用户名
    pub email: Option<String>,           // 邮箱
    pub opus_enabled: Option<bool>,      // 是否启用Opus模型
}

/// 获取 PackyCode 用户额度（专用）
#[command]
pub async fn packycode_get_user_quota(
    station_id: String,
    db: State<'_, AgentDb>,
) -> Result<PackycodeUserQuota, String> {
    let station = crate::commands::relay_stations::relay_station_get(station_id, db)
        .await
        .map_err(|e| format!("Failed to get station: {}", e))?;

    if station.adapter.as_str() != "packycode" {
        return Err("此功能仅支持 PackyCode 中转站".to_string());
    }

    // 根据服务类型构建不同的 URL
    let url =
        if station.api_url.contains("share-api") || station.api_url.contains("share.packycode") {
            // 滴滴车服务
            "https://share.packycode.com/api/backend/users/info"
        } else {
            // 公交车服务
            "https://www.packycode.com/api/backend/users/info"
        };

    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .no_proxy() // 禁用所有代理
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    log::info!("正在请求 PackyCode 用户信息: {}", url);

    let response = client
        .get(url)
        .header("Authorization", format!("Bearer {}", station.system_token))
        .header("User-Agent", "Claudia")
        .header("Accept", "*/*")
        .send()
        .await
        .map_err(|e| {
            log::error!("请求 PackyCode API 失败: {}", e);
            if e.is_connect() {
                format!("网络连接失败: {}", e)
            } else if e.is_timeout() {
                format!("请求超时: {}", e)
            } else {
                format!("请求失败: {}", e)
            }
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(match status.as_u16() {
            401 => "Token 无效或已过期".to_string(),
            403 => "权限不足".to_string(),
            400 => format!("请求参数错误: {}", error_text),
            _ => format!("请求失败 ({}): {}", status, error_text),
        });
    }

    let data: Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    // 辅助函数：将值转换为 f64
    let to_f64 = |v: &Value| -> f64 {
        if v.is_null() {
            0.0
        } else if v.is_string() {
            v.as_str()
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0)
        } else if v.is_f64() {
            v.as_f64().unwrap_or(0.0)
        } else if v.is_i64() {
            v.as_i64().map(|i| i as f64).unwrap_or(0.0)
        } else {
            0.0
        }
    };

    Ok(PackycodeUserQuota {
        daily_budget_usd: to_f64(data.get("daily_budget_usd").unwrap_or(&Value::Null)),
        daily_spent_usd: to_f64(data.get("daily_spent_usd").unwrap_or(&Value::Null)),
        monthly_budget_usd: to_f64(data.get("monthly_budget_usd").unwrap_or(&Value::Null)),
        monthly_spent_usd: to_f64(data.get("monthly_spent_usd").unwrap_or(&Value::Null)),
        balance_usd: to_f64(data.get("balance_usd").unwrap_or(&Value::Null)),
        total_spent_usd: to_f64(data.get("total_spent_usd").unwrap_or(&Value::Null)),
        plan_type: data
            .get("plan_type")
            .and_then(|v| v.as_str())
            .unwrap_or("basic")
            .to_string(),
        plan_expires_at: data
            .get("plan_expires_at")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        username: data
            .get("username")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        email: data
            .get("email")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        opus_enabled: data.get("opus_enabled").and_then(|v| v.as_bool()),
    })
}
