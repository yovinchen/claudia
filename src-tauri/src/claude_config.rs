use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use dirs::home_dir;
use crate::commands::relay_stations::RelayStation;

/// Claude 配置文件结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeConfig {
    #[serde(default)]
    pub env: ClaudeEnv,
    #[serde(default)]
    pub permissions: Option<ClaudePermissions>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(rename = "apiKeyHelper")]
    pub api_key_helper: Option<String>,
    #[serde(flatten)]
    pub other: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ClaudeEnv {
    #[serde(rename = "ANTHROPIC_AUTH_TOKEN")]
    pub anthropic_auth_token: Option<String>,
    #[serde(rename = "ANTHROPIC_BASE_URL")]
    pub anthropic_base_url: Option<String>,
    #[serde(rename = "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC")]
    pub disable_nonessential_traffic: Option<String>,
    #[serde(flatten)]
    pub other: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ClaudePermissions {
    #[serde(default)]
    pub allow: Vec<String>,
    #[serde(default)]
    pub deny: Vec<String>,
}

/// 获取 Claude 配置文件路径
pub fn get_claude_config_path() -> Result<PathBuf, String> {
    let home = home_dir().ok_or_else(|| "无法获取主目录".to_string())?;
    Ok(home.join(".claude").join("settings.json"))
}

/// 获取配置备份文件路径
pub fn get_config_backup_path() -> Result<PathBuf, String> {
    let home = home_dir().ok_or_else(|| "无法获取主目录".to_string())?;
    Ok(home.join(".claude").join("settings.backup.json"))
}

/// 读取 Claude 配置文件
pub fn read_claude_config() -> Result<ClaudeConfig, String> {
    let config_path = get_claude_config_path()?;
    
    if !config_path.exists() {
        // 如果配置文件不存在，创建默认配置
        return Ok(ClaudeConfig {
            env: ClaudeEnv::default(),
            permissions: Some(ClaudePermissions::default()),
            model: None,
            api_key_helper: None,
            other: json!({}),
        });
    }
    
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;
    
    serde_json::from_str(&content)
        .map_err(|e| format!("解析配置文件失败: {}", e))
}

/// 写入 Claude 配置文件
pub fn write_claude_config(config: &ClaudeConfig) -> Result<(), String> {
    let config_path = get_claude_config_path()?;
    
    // 确保目录存在
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建配置目录失败: {}", e))?;
    }
    
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    
    fs::write(&config_path, content)
        .map_err(|e| format!("写入配置文件失败: {}", e))
}

/// 备份当前配置
pub fn backup_claude_config() -> Result<(), String> {
    let config_path = get_claude_config_path()?;
    let backup_path = get_config_backup_path()?;
    
    if config_path.exists() {
        fs::copy(&config_path, &backup_path)
            .map_err(|e| format!("备份配置文件失败: {}", e))?;
    }
    
    Ok(())
}

/// 恢复配置备份
pub fn restore_claude_config() -> Result<(), String> {
    let config_path = get_claude_config_path()?;
    let backup_path = get_config_backup_path()?;
    
    if !backup_path.exists() {
        return Err("备份文件不存在".to_string());
    }
    
    fs::copy(&backup_path, &config_path)
        .map_err(|e| format!("恢复配置文件失败: {}", e))?;
    
    Ok(())
}

/// 根据中转站配置更新 Claude 配置
pub fn apply_relay_station_to_config(station: &RelayStation) -> Result<(), String> {
    // 先备份当前配置
    backup_claude_config()?;
    
    // 读取当前配置
    let mut config = read_claude_config()?;
    
    // 更新 API URL
    config.env.anthropic_base_url = Some(station.api_url.clone());
    
    // 更新 API Token
    config.env.anthropic_auth_token = Some(station.system_token.clone());
    
    // 将中转站的 token 也设置到 apiKeyHelper
    // 格式：echo 'token'
    config.api_key_helper = Some(format!("echo '{}'", station.system_token));
    
    // 如果是自定义适配器，可能需要特殊处理
    match station.adapter.as_str() {
        "newapi" | "oneapi" => {
            // NewAPI 和 OneAPI 兼容 OpenAI 格式，不需要特殊处理
        }
        "yourapi" => {
            // YourAPI 可能需要特殊的路径格式
            if !station.api_url.ends_with("/v1") {
                config.env.anthropic_base_url = Some(format!("{}/v1", station.api_url));
            }
        }
        "custom" => {
            // 自定义适配器，使用原始配置
        }
        _ => {}
    }
    
    // 写入更新后的配置
    write_claude_config(&config)?;
    
    log::info!("已将中转站 {} 的配置应用到 Claude 配置文件", station.name);
    Ok(())
}

/// 清除中转站配置（恢复默认）
pub fn clear_relay_station_from_config() -> Result<(), String> {
    // 尝试从备份恢复原始的配置
    let backup_config = if let Ok(backup_path) = get_config_backup_path() {
        if backup_path.exists() {
            let content = fs::read_to_string(&backup_path).ok();
            content.and_then(|c| serde_json::from_str::<ClaudeConfig>(&c).ok())
        } else {
            None
        }
    } else {
        None
    };
    
    // 读取当前配置
    let mut config = read_claude_config()?;
    
    // 清除 API URL 和 Token
    config.env.anthropic_base_url = None;
    config.env.anthropic_auth_token = None;
    
    // 恢复原始的 apiKeyHelper（如果有备份的话）
    if let Some(backup) = backup_config {
        config.api_key_helper = backup.api_key_helper;
        // 如果备份中有 ANTHROPIC_AUTH_TOKEN，也恢复它
        if backup.env.anthropic_auth_token.is_some() {
            config.env.anthropic_auth_token = backup.env.anthropic_auth_token;
        }
    } else {
        // 如果没有备份，清除 apiKeyHelper
        config.api_key_helper = None;
    }
    
    // 写入更新后的配置
    write_claude_config(&config)?;
    
    log::info!("已清除 Claude 配置文件中的中转站设置");
    Ok(())
}

/// 获取当前配置中的 API URL
pub fn get_current_api_url() -> Result<Option<String>, String> {
    let config = read_claude_config()?;
    Ok(config.env.anthropic_base_url)
}

/// 获取当前配置中的 API Token
pub fn get_current_api_token() -> Result<Option<String>, String> {
    let config = read_claude_config()?;
    Ok(config.env.anthropic_auth_token)
}