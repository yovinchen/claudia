use crate::commands::relay_stations::RelayStation;
use dirs::home_dir;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Claude 配置文件结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeConfig {
    #[serde(default)]
    pub env: ClaudeEnv,
    #[serde(default)]
    pub permissions: Option<ClaudePermissions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(rename = "apiKeyHelper", skip_serializing_if = "Option::is_none")]
    pub api_key_helper: Option<String>,
    #[serde(rename = "statusLine", skip_serializing_if = "Option::is_none")]
    pub status_line: Option<StatusLineConfig>,
    // 使用 flatten 来支持任何其他未知字段
    #[serde(flatten)]
    pub extra_fields: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusLineConfig {
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub config_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub padding: Option<i32>,
    // 支持其他可能的 statusLine 字段
    #[serde(flatten)]
    pub extra_fields: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeEnv {
    #[serde(
        rename = "ANTHROPIC_AUTH_TOKEN",
        skip_serializing_if = "Option::is_none"
    )]
    pub anthropic_auth_token: Option<String>,
    #[serde(rename = "ANTHROPIC_BASE_URL", skip_serializing_if = "Option::is_none")]
    pub anthropic_base_url: Option<String>,
    #[serde(
        rename = "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
        skip_serializing_if = "Option::is_none"
    )]
    pub disable_nonessential_traffic: Option<String>,
    // 使用 flatten 来支持任何其他环境变量
    #[serde(flatten)]
    pub extra_fields: std::collections::HashMap<String, serde_json::Value>,
}

impl Default for ClaudeEnv {
    fn default() -> Self {
        Self {
            anthropic_auth_token: None,
            anthropic_base_url: None,
            disable_nonessential_traffic: None,
            extra_fields: HashMap::new(),
        }
    }
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
            status_line: None,
            extra_fields: HashMap::new(),
        });
    }

    let content =
        fs::read_to_string(&config_path).map_err(|e| format!("读取配置文件失败: {}", e))?;

    // 首先尝试解析为 JSON Value，以便处理可能的格式问题
    let mut json_value: Value =
        serde_json::from_str(&content).map_err(|e| format!("解析配置文件失败: {}", e))?;

    // 如果JSON解析成功，再转换为ClaudeConfig
    if let Some(obj) = json_value.as_object_mut() {
        // 确保必要的字段存在
        if !obj.contains_key("env") {
            obj.insert("env".to_string(), json!({}));
        }
    }

    serde_json::from_value(json_value).map_err(|e| format!("转换配置结构失败: {}", e))
}

/// 写入 Claude 配置文件
pub fn write_claude_config(config: &ClaudeConfig) -> Result<(), String> {
    let config_path = get_claude_config_path()?;

    log::info!("尝试写入配置文件到: {:?}", config_path);

    // 确保目录存在
    if let Some(parent) = config_path.parent() {
        log::info!("确保目录存在: {:?}", parent);
        fs::create_dir_all(parent).map_err(|e| {
            let error_msg = format!("创建配置目录失败: {}", e);
            log::error!("{}", error_msg);
            error_msg
        })?;
    }

    let content = serde_json::to_string_pretty(config).map_err(|e| {
        let error_msg = format!("序列化配置失败: {}", e);
        log::error!("{}", error_msg);
        error_msg
    })?;

    log::info!("准备写入内容:\n{}", content);

    fs::write(&config_path, &content).map_err(|e| {
        let error_msg = format!("写入配置文件失败: {} (路径: {:?})", e, config_path);
        log::error!("{}", error_msg);
        error_msg
    })?;

    log::info!("配置文件写入成功: {:?}", config_path);
    Ok(())
}

/// 备份当前配置
pub fn backup_claude_config() -> Result<(), String> {
    let config_path = get_claude_config_path()?;
    let backup_path = get_config_backup_path()?;

    if config_path.exists() {
        fs::copy(&config_path, &backup_path).map_err(|e| format!("备份配置文件失败: {}", e))?;
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

    fs::copy(&backup_path, &config_path).map_err(|e| format!("恢复配置文件失败: {}", e))?;

    Ok(())
}

/// 根据中转站配置更新 Claude 配置（仅更新 API 相关字段）
pub fn apply_relay_station_to_config(station: &RelayStation) -> Result<(), String> {
    // 先备份当前配置
    backup_claude_config()?;

    // 读取当前配置
    let mut config = read_claude_config()?;

    // 仅更新这三个关键字段，保留其他所有配置不变：
    // 1. ANTHROPIC_BASE_URL
    config.env.anthropic_base_url = Some(station.api_url.clone());

    // 2. ANTHROPIC_AUTH_TOKEN
    config.env.anthropic_auth_token = Some(station.system_token.clone());

    // 3. apiKeyHelper - 设置为 echo 格式
    config.api_key_helper = Some(format!("echo '{}'", station.system_token));

    // 如果是特定适配器，可能需要特殊处理 URL 格式
    match station.adapter.as_str() {
        "packycode" => {
            // PackyCode 使用原始配置，不做特殊处理
        }
        "custom" => {
            // 自定义适配器，使用原始配置
        }
        _ => {}
    }

    // 写入更新后的配置
    write_claude_config(&config)?;

    log::info!("已将中转站 {} 的 API 配置（apiKeyHelper, ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN）应用到 Claude 配置文件", station.name);
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
