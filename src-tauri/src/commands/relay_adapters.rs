use async_trait::async_trait;
use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tauri::{command, State};

use crate::commands::agents::AgentDb;
use crate::commands::relay_stations::{
    RelayStation, StationInfo, UserInfo, ConnectionTestResult, 
    TokenInfo, TokenPaginationResponse, RelayStationAdapter
};
use crate::i18n;

/// HTTP 客户端单例
static HTTP_CLIENT: once_cell::sync::Lazy<Client> = once_cell::sync::Lazy::new(|| {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .pool_max_idle_per_host(10)
        .pool_idle_timeout(Duration::from_secs(90))
        .build()
        .unwrap()
});

/// 中转站适配器 trait
#[async_trait]
pub trait StationAdapter: Send + Sync {
    /// 获取站点信息
    async fn get_station_info(&self, station: &RelayStation) -> Result<StationInfo>;
    
    /// 获取用户信息
    async fn get_user_info(&self, station: &RelayStation, user_id: &str) -> Result<UserInfo>;
    
    /// 测试连接
    async fn test_connection(&self, station: &RelayStation) -> Result<ConnectionTestResult>;
    
    /// 获取用户使用日志
    async fn get_usage_logs(&self, station: &RelayStation, user_id: &str, page: Option<usize>, size: Option<usize>) -> Result<Value>;
    
    /// 列出用户 Token
    async fn list_tokens(&self, station: &RelayStation, page: Option<usize>, size: Option<usize>) -> Result<TokenPaginationResponse>;
    
    /// 创建 Token
    async fn create_token(&self, station: &RelayStation, name: &str, quota: Option<i64>) -> Result<TokenInfo>;
    
    /// 更新 Token
    async fn update_token(&self, station: &RelayStation, token_id: &str, name: Option<&str>, quota: Option<i64>) -> Result<TokenInfo>;
    
    /// 删除 Token
    async fn delete_token(&self, station: &RelayStation, token_id: &str) -> Result<String>;
}

/// NewAPI 适配器（支持 NewAPI 和 OneAPI）
pub struct NewApiAdapter;

#[async_trait]
impl StationAdapter for NewApiAdapter {
    async fn get_station_info(&self, station: &RelayStation) -> Result<StationInfo> {
        let url = format!("{}/api/status", station.api_url.trim_end_matches('/'));
        
        let response = HTTP_CLIENT
            .get(&url)
            .header("Authorization", format!("Bearer {}", station.system_token))
            .send()
            .await?;

        let data: Value = response.json().await?;
        
        if !data.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            return Err(anyhow::anyhow!("API Error: {}", 
                data.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown error")));
        }

        let default_data = json!({});
        let data = data.get("data").unwrap_or(&default_data);
        
        Ok(StationInfo {
            name: data.get("system_name")
                .and_then(|v| v.as_str())
                .unwrap_or(&station.name)
                .to_string(),
            announcement: data.get("announcement")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            api_url: station.api_url.clone(),
            version: data.get("version")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            metadata: Some({
                let mut map = HashMap::new();
                map.insert("adapter_type".to_string(), json!("newapi"));
                if let Some(quota_per_unit) = data.get("quota_per_unit").and_then(|v| v.as_i64()) {
                    map.insert("quota_per_unit".to_string(), json!(quota_per_unit));
                }
                map
            }),
            quota_per_unit: data.get("quota_per_unit").and_then(|v| v.as_i64()),
        })
    }

    async fn get_user_info(&self, station: &RelayStation, user_id: &str) -> Result<UserInfo> {
        let url = format!("{}/api/user/self", station.api_url.trim_end_matches('/'));
        
        let response = HTTP_CLIENT
            .get(&url)
            .header("Authorization", format!("Bearer {}", station.system_token))
            .header("New-API-User", user_id)
            .send()
            .await?;

        let data: Value = response.json().await?;
        
        if !data.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            return Err(anyhow::anyhow!("API Error: {}", 
                data.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown error")));
        }

        let user_data = data.get("data").ok_or_else(|| anyhow!("No user data returned"))?;
        
        Ok(UserInfo {
            user_id: user_data.get("id")
                .and_then(|v| v.as_i64())
                .map(|id| id.to_string())
                .unwrap_or_else(|| user_id.to_string()),
            username: user_data.get("username")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            email: user_data.get("email")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            balance_remaining: user_data.get("quota")
                .and_then(|v| v.as_i64())
                .map(|q| q as f64 / 500000.0), // 转换为美元
            amount_used: user_data.get("used_quota")
                .and_then(|v| v.as_i64())
                .map(|q| q as f64 / 500000.0),
            request_count: user_data.get("request_count")
                .and_then(|v| v.as_i64()),
            status: match user_data.get("status").and_then(|v| v.as_i64()) {
                Some(1) => Some("active".to_string()),
                Some(0) => Some("disabled".to_string()),
                _ => Some("unknown".to_string()),
            },
            metadata: Some({
                let mut map = HashMap::new();
                map.insert("raw_data".to_string(), user_data.clone());
                map
            }),
        })
    }

    async fn test_connection(&self, station: &RelayStation) -> Result<ConnectionTestResult> {
        let start_time = Instant::now();
        let url = format!("{}/api/status", station.api_url.trim_end_matches('/'));
        
        match HTTP_CLIENT
            .get(&url)
            .header("Authorization", format!("Bearer {}", station.system_token))
            .timeout(Duration::from_secs(10))
            .send()
            .await
        {
            Ok(response) => {
                let response_time = start_time.elapsed().as_millis() as u64;
                
                if response.status().is_success() {
                    match response.json::<Value>().await {
                        Ok(data) => {
                            let success = data.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
                            if success {
                                Ok(ConnectionTestResult {
                                    success: true,
                                    response_time: Some(response_time),
                                    message: i18n::t("relay_adapter.connection_success"),
                                    error: None,
                                })
                            } else {
                                let error_msg = data.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown error");
                                Ok(ConnectionTestResult {
                                    success: false,
                                    response_time: Some(response_time),
                                    message: i18n::t("relay_adapter.api_error"),
                                    error: Some(error_msg.to_string()),
                                })
                            }
                        }
                        Err(e) => Ok(ConnectionTestResult {
                            success: false,
                            response_time: Some(response_time),
                            message: i18n::t("relay_adapter.parse_error"),
                            error: Some(e.to_string()),
                        })
                    }
                } else {
                    Ok(ConnectionTestResult {
                        success: false,
                        response_time: Some(response_time),
                        message: i18n::t("relay_adapter.http_error"),
                        error: Some(format!("HTTP {}", response.status())),
                    })
                }
            }
            Err(e) => {
                let response_time = start_time.elapsed().as_millis() as u64;
                Ok(ConnectionTestResult {
                    success: false,
                    response_time: Some(response_time),
                    message: i18n::t("relay_adapter.network_error"),
                    error: Some(e.to_string()),
                })
            }
        }
    }

    async fn get_usage_logs(&self, station: &RelayStation, user_id: &str, page: Option<usize>, size: Option<usize>) -> Result<Value> {
        let page = page.unwrap_or(1);
        let size = size.unwrap_or(10);
        let url = format!("{}/api/log/self?page={}&size={}", 
            station.api_url.trim_end_matches('/'), page, size);
        
        let response = HTTP_CLIENT
            .get(&url)
            .header("Authorization", format!("Bearer {}", station.system_token))
            .header("New-API-User", user_id)
            .send()
            .await?;

        let data: Value = response.json().await?;
        
        if !data.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            return Err(anyhow::anyhow!("API Error: {}", 
                data.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown error")));
        }

        Ok(data.get("data").cloned().unwrap_or(json!([])))
    }

    async fn list_tokens(&self, station: &RelayStation, page: Option<usize>, size: Option<usize>) -> Result<TokenPaginationResponse> {
        let page = page.unwrap_or(1);
        let size = size.unwrap_or(10);
        let url = format!("{}/api/token?page={}&size={}", 
            station.api_url.trim_end_matches('/'), page, size);
        
        let response = HTTP_CLIENT
            .get(&url)
            .header("Authorization", format!("Bearer {}", station.system_token))
            .send()
            .await?;

        let data: Value = response.json().await?;
        
        if !data.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            return Err(anyhow::anyhow!("API Error: {}", 
                data.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown error")));
        }

        let data = data.get("data").ok_or_else(|| anyhow!("No data returned"))?;
        let tokens_data = data.get("data").and_then(|v| v.as_array())
            .ok_or_else(|| anyhow!("Invalid response format: data is not an array"))?;

        let tokens: Result<Vec<TokenInfo>, _> = tokens_data.iter()
            .map(|token| {
                Ok::<TokenInfo, anyhow::Error>(TokenInfo {
                    id: token.get("id")
                        .and_then(|v| v.as_i64())
                        .map(|id| id.to_string())
                        .ok_or_else(|| anyhow::anyhow!("Missing token id"))?,
                    name: token.get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unnamed Token")
                        .to_string(),
                    token: token.get("key")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    quota: token.get("remain_quota")
                        .and_then(|v| v.as_i64()),
                    used_quota: token.get("used_quota")
                        .and_then(|v| v.as_i64()),
                    status: match token.get("status").and_then(|v| v.as_i64()) {
                        Some(1) => "active".to_string(),
                        Some(0) => "disabled".to_string(),
                        _ => "unknown".to_string(),
                    },
                    created_at: token.get("created_time")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0),
                    updated_at: token.get("updated_time")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0),
                })
            })
            .collect();

        let tokens = tokens?;
        let total = data.get("total").and_then(|v| v.as_i64()).unwrap_or(0);
        let has_more = (page * size) < total as usize;

        Ok(TokenPaginationResponse {
            tokens,
            total,
            page,
            size,
            has_more,
        })
    }

    async fn create_token(&self, station: &RelayStation, name: &str, quota: Option<i64>) -> Result<TokenInfo> {
        let url = format!("{}/api/token", station.api_url.trim_end_matches('/'));
        
        let mut body = json!({
            "name": name,
            "unlimited_quota": quota.is_none(),
        });
        
        if let Some(q) = quota {
            body["remain_quota"] = json!(q);
        }
        
        let response = HTTP_CLIENT
            .post(&url)
            .header("Authorization", format!("Bearer {}", station.system_token))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        let data: Value = response.json().await?;
        
        if !data.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            return Err(anyhow::anyhow!("API Error: {}", 
                data.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown error")));
        }

        let token_data = data.get("data").ok_or_else(|| anyhow!("No token data returned"))?;
        
        Ok(TokenInfo {
            id: token_data.get("id")
                .and_then(|v| v.as_i64())
                .map(|id| id.to_string())
                .ok_or_else(|| anyhow!("Missing token id"))?,
            name: name.to_string(),
            token: token_data.get("key")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            quota,
            used_quota: Some(0),
            status: "active".to_string(),
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
        })
    }

    async fn update_token(&self, station: &RelayStation, token_id: &str, name: Option<&str>, quota: Option<i64>) -> Result<TokenInfo> {
        let url = format!("{}/api/token", station.api_url.trim_end_matches('/'));
        
        let mut body = json!({
            "id": token_id.parse::<i64>()
                .map_err(|_| anyhow!("Invalid token ID format"))?,
        });
        
        if let Some(n) = name {
            body["name"] = json!(n);
        }
        
        if let Some(q) = quota {
            body["remain_quota"] = json!(q);
            body["unlimited_quota"] = json!(false);
        }
        
        let response = HTTP_CLIENT
            .put(&url)
            .header("Authorization", format!("Bearer {}", station.system_token))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        let data: Value = response.json().await?;
        
        if !data.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            return Err(anyhow::anyhow!("API Error: {}", 
                data.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown error")));
        }

        Ok(TokenInfo {
            id: token_id.to_string(),
            name: name.unwrap_or("Updated Token").to_string(),
            token: "".to_string(), // 更新后不返回完整token
            quota,
            used_quota: None,
            status: "active".to_string(),
            created_at: 0,
            updated_at: chrono::Utc::now().timestamp(),
        })
    }

    async fn delete_token(&self, station: &RelayStation, token_id: &str) -> Result<String> {
        let url = format!("{}/api/token/{}", station.api_url.trim_end_matches('/'), token_id);
        
        let response = HTTP_CLIENT
            .delete(&url)
            .header("Authorization", format!("Bearer {}", station.system_token))
            .send()
            .await?;

        let data: Value = response.json().await?;
        
        if !data.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            return Err(anyhow::anyhow!("API Error: {}", 
                data.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown error")));
        }

        Ok(i18n::t("relay_adapter.token_deleted"))
    }
}

/// YourAPI 适配器（基于 NewAPI 的优化版本）
pub struct YourApiAdapter {
    newapi: NewApiAdapter,
}

impl YourApiAdapter {
    pub fn new() -> Self {
        Self {
            newapi: NewApiAdapter,
        }
    }
}

#[async_trait]
impl StationAdapter for YourApiAdapter {
    async fn get_station_info(&self, station: &RelayStation) -> Result<StationInfo> {
        // 复用 NewAPI 的实现，但修改适配器类型
        let mut info = self.newapi.get_station_info(station).await?;
        if let Some(ref mut metadata) = info.metadata {
            metadata.insert("adapter_type".to_string(), json!("yourapi"));
        }
        Ok(info)
    }

    async fn get_user_info(&self, station: &RelayStation, user_id: &str) -> Result<UserInfo> {
        self.newapi.get_user_info(station, user_id).await
    }

    async fn test_connection(&self, station: &RelayStation) -> Result<ConnectionTestResult> {
        self.newapi.test_connection(station).await
    }

    async fn get_usage_logs(&self, station: &RelayStation, user_id: &str, page: Option<usize>, size: Option<usize>) -> Result<Value> {
        self.newapi.get_usage_logs(station, user_id, page, size).await
    }

    async fn list_tokens(&self, station: &RelayStation, page: Option<usize>, size: Option<usize>) -> Result<TokenPaginationResponse> {
        // YourAPI 特定的 Token 列表实现
        let page = page.unwrap_or(1);
        let size = size.unwrap_or(10);
        let url = format!("{}/api/token?page={}&size={}", 
            station.api_url.trim_end_matches('/'), page, size);
        
        let response = HTTP_CLIENT
            .get(&url)
            .header("Authorization", format!("Bearer {}", station.system_token))
            .send()
            .await?;

        let data: Value = response.json().await?;
        
        if !data.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
            return Err(anyhow::anyhow!("API Error: {}", 
                data.get("message").and_then(|v| v.as_str()).unwrap_or("Unknown error")));
        }

        // YourAPI 返回直接数组而非嵌套对象
        let tokens_data = data["data"].as_array()
            .ok_or_else(|| anyhow!("Invalid response format: data is not an array"))?;

        let tokens: Result<Vec<TokenInfo>, _> = tokens_data.iter()
            .map(|token| {
                Ok::<TokenInfo, anyhow::Error>(TokenInfo {
                    id: token.get("id")
                        .and_then(|v| v.as_i64())
                        .map(|id| id.to_string())
                        .ok_or_else(|| anyhow::anyhow!("Missing token id"))?,
                    name: token.get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unnamed Token")
                        .to_string(),
                    token: token.get("key")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    quota: token.get("remain_quota")
                        .and_then(|v| v.as_i64()),
                    used_quota: token.get("used_quota")
                        .and_then(|v| v.as_i64()),
                    status: match token.get("status").and_then(|v| v.as_i64()) {
                        Some(1) => "active".to_string(),
                        Some(0) => "disabled".to_string(),
                        _ => "unknown".to_string(),
                    },
                    created_at: token.get("created_time")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0),
                    updated_at: token.get("updated_time")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0),
                })
            })
            .collect();

        let tokens = tokens?;
        let items_len = tokens.len();
        
        // YourAPI 的智能分页估算
        let has_more_pages = items_len == size;
        let estimated_total = if page == 1 && !has_more_pages {
            items_len as i64
        } else if has_more_pages {
            (page * size + 1) as i64  // 保守估计
        } else {
            ((page - 1) * size + items_len) as i64
        };

        Ok(TokenPaginationResponse {
            tokens,
            total: estimated_total,
            page,
            size,
            has_more: has_more_pages,
        })
    }

    async fn create_token(&self, station: &RelayStation, name: &str, quota: Option<i64>) -> Result<TokenInfo> {
        self.newapi.create_token(station, name, quota).await
    }

    async fn update_token(&self, station: &RelayStation, token_id: &str, name: Option<&str>, quota: Option<i64>) -> Result<TokenInfo> {
        self.newapi.update_token(station, token_id, name, quota).await
    }

    async fn delete_token(&self, station: &RelayStation, token_id: &str) -> Result<String> {
        self.newapi.delete_token(station, token_id).await
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
                map.insert("note".to_string(), json!("This is a custom configuration that only provides URL and API key."));
                map
            }),
            quota_per_unit: None,
        })
    }

    async fn get_user_info(&self, _station: &RelayStation, _user_id: &str) -> Result<UserInfo> {
        Err(anyhow::anyhow!(i18n::t("relay_adapter.user_info_not_available")))
    }

    async fn test_connection(&self, _station: &RelayStation) -> Result<ConnectionTestResult> {
        // Custom 适配器跳过连接测试，直接返回成功
        Ok(ConnectionTestResult {
            success: true,
            response_time: Some(0),
            message: i18n::t("relay_adapter.custom_no_test"),
            error: None,
        })
    }

    async fn get_usage_logs(&self, _station: &RelayStation, _user_id: &str, _page: Option<usize>, _size: Option<usize>) -> Result<Value> {
        Err(anyhow::anyhow!(i18n::t("relay_adapter.usage_logs_not_available")))
    }

    async fn list_tokens(&self, _station: &RelayStation, _page: Option<usize>, _size: Option<usize>) -> Result<TokenPaginationResponse> {
        Err(anyhow::anyhow!(i18n::t("relay_adapter.token_management_not_available")))
    }

    async fn create_token(&self, _station: &RelayStation, _name: &str, _quota: Option<i64>) -> Result<TokenInfo> {
        Err(anyhow::anyhow!(i18n::t("relay_adapter.token_management_not_available")))
    }

    async fn update_token(&self, _station: &RelayStation, _token_id: &str, _name: Option<&str>, _quota: Option<i64>) -> Result<TokenInfo> {
        Err(anyhow::anyhow!(i18n::t("relay_adapter.token_management_not_available")))
    }

    async fn delete_token(&self, _station: &RelayStation, _token_id: &str) -> Result<String> {
        Err(anyhow::anyhow!(i18n::t("relay_adapter.token_management_not_available")))
    }
}

/// 适配器工厂函数
pub fn create_adapter(adapter_type: &RelayStationAdapter) -> Box<dyn StationAdapter> {
    match adapter_type {
        RelayStationAdapter::Newapi => Box::new(NewApiAdapter),
        RelayStationAdapter::Oneapi => Box::new(NewApiAdapter), // OneAPI 兼容 NewAPI
        RelayStationAdapter::Yourapi => Box::new(YourApiAdapter::new()),
        RelayStationAdapter::Custom => Box::new(CustomAdapter),
    }
}

/// 获取中转站信息
#[command]
pub async fn relay_station_get_info(
    station_id: String,
    db: State<'_, AgentDb>
) -> Result<StationInfo, String> {
    // 获取中转站配置
    let station = crate::commands::relay_stations::relay_station_get(station_id, db).await?;
    
    // 创建适配器
    let adapter = create_adapter(&station.adapter);
    
    // 获取站点信息
    adapter.get_station_info(&station).await
        .map_err(|e| {
            log::error!("Failed to get station info: {}", e);
            i18n::t("relay_adapter.get_info_failed")
        })
}

/// 获取用户信息
#[command]
pub async fn relay_station_get_user_info(
    station_id: String,
    user_id: String,
    db: State<'_, AgentDb>
) -> Result<UserInfo, String> {
    let station = crate::commands::relay_stations::relay_station_get(station_id, db).await?;
    let adapter = create_adapter(&station.adapter);
    
    adapter.get_user_info(&station, &user_id).await
        .map_err(|e| {
            log::error!("Failed to get user info: {}", e);
            i18n::t("relay_adapter.get_user_info_failed")
        })
}

/// 测试中转站连接
#[command]
pub async fn relay_station_test_connection(
    station_id: String,
    db: State<'_, AgentDb>
) -> Result<ConnectionTestResult, String> {
    let station = crate::commands::relay_stations::relay_station_get(station_id, db).await?;
    let adapter = create_adapter(&station.adapter);
    
    adapter.test_connection(&station).await
        .map_err(|e| {
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
    db: State<'_, AgentDb>
) -> Result<Value, String> {
    let station = crate::commands::relay_stations::relay_station_get(station_id, db).await?;
    let adapter = create_adapter(&station.adapter);
    
    adapter.get_usage_logs(&station, &user_id, page, size).await
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
    db: State<'_, AgentDb>
) -> Result<TokenPaginationResponse, String> {
    let station = crate::commands::relay_stations::relay_station_get(station_id, db).await?;
    let adapter = create_adapter(&station.adapter);
    
    adapter.list_tokens(&station, page, size).await
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
    db: State<'_, AgentDb>
) -> Result<TokenInfo, String> {
    let station = crate::commands::relay_stations::relay_station_get(station_id, db).await?;
    let adapter = create_adapter(&station.adapter);
    
    adapter.create_token(&station, &name, quota).await
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
    db: State<'_, AgentDb>
) -> Result<TokenInfo, String> {
    let station = crate::commands::relay_stations::relay_station_get(station_id, db).await?;
    let adapter = create_adapter(&station.adapter);
    
    adapter.update_token(&station, &token_id, name.as_deref(), quota).await
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
    db: State<'_, AgentDb>
) -> Result<String, String> {
    let station = crate::commands::relay_stations::relay_station_get(station_id, db).await?;
    let adapter = create_adapter(&station.adapter);
    
    adapter.delete_token(&station, &token_id).await
        .map_err(|e| {
            log::error!("Failed to delete token: {}", e);
            i18n::t("relay_adapter.delete_token_failed")
        })
}