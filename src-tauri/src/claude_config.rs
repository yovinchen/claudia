use crate::commands::relay_stations::RelayStation;
use dirs::home_dir;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Claude 配置文件结构
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
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

/// 根据中转站配置更新 Claude 配置（先恢复源文件，再应用配置）
pub fn apply_relay_station_to_config(station: &RelayStation) -> Result<(), String> {
    log::info!("[CLAUDE_CONFIG] Applying relay station: {}", station.name);

    // 第一步：确保源文件备份存在（如果不存在则创建）
    let backup_path = get_config_backup_path()?;
    let config_path = get_claude_config_path()?;

    if !backup_path.exists() {
        if config_path.exists() {
            log::info!("[CLAUDE_CONFIG] Creating source backup on first use");
            init_source_backup()?;
        } else {
            log::warn!("[CLAUDE_CONFIG] No source config found, will create default");
        }
    }

    // 第二步：恢复源文件备份（确保使用干净的基准配置）
    if backup_path.exists() {
        log::info!("[CLAUDE_CONFIG] Restoring source config from backup");
        fs::copy(&backup_path, &config_path).map_err(|e| {
            log::error!("[CLAUDE_CONFIG] Failed to restore source config: {}", e);
            format!("恢复源配置文件失败: {}", e)
        })?;
    }

    // 第三步：读取恢复后的配置（现在是源文件或默认配置）
    let mut config = read_claude_config()?;

    // 第四步：仅更新中转站相关字段，保留其他所有配置
    // 1. ANTHROPIC_BASE_URL
    config.env.anthropic_base_url = Some(station.api_url.clone());
    log::info!("[CLAUDE_CONFIG] Set ANTHROPIC_BASE_URL: {}", station.api_url);

    // 2. ANTHROPIC_AUTH_TOKEN
    config.env.anthropic_auth_token = Some(station.system_token.clone());
    log::info!("[CLAUDE_CONFIG] Set ANTHROPIC_AUTH_TOKEN");

    // 3. apiKeyHelper - 设置为 echo 格式
    config.api_key_helper = Some(format!("echo '{}'", station.system_token));
    log::info!("[CLAUDE_CONFIG] Set apiKeyHelper");

    // 第五步：处理 adapter_config 中的自定义字段（合并而非覆盖）
    if let Some(ref adapter_config) = station.adapter_config {
        log::info!("[CLAUDE_CONFIG] Merging adapter_config: {:?}", adapter_config);

        // 遍历 adapter_config 中的所有字段
        for (key, value) in adapter_config {
            match key.as_str() {
                // 已知的字段直接写入对应位置
                "model" => {
                    if let Some(model_value) = value.as_str() {
                        config.model = Some(model_value.to_string());
                        log::info!("[CLAUDE_CONFIG] Set model: {}", model_value);
                    }
                }
                // 其他字段写入到 extra_fields 中
                _ => {
                    config.extra_fields.insert(key.clone(), value.clone());
                    log::info!("[CLAUDE_CONFIG] Set extra field {}: {:?}", key, value);
                }
            }
        }
    }

    // 第六步：写入更新后的配置
    write_claude_config(&config)?;

    log::info!("[CLAUDE_CONFIG] Successfully applied station config (merged with source config)");
    Ok(())
}

/// 清除中转站配置（恢复源文件备份）
pub fn clear_relay_station_from_config() -> Result<(), String> {
    log::info!("[CLAUDE_CONFIG] Clearing relay station config");

    // 恢复源文件备份
    let backup_path = get_config_backup_path()?;
    let config_path = get_claude_config_path()?;

    if backup_path.exists() {
        log::info!("[CLAUDE_CONFIG] Restoring from source backup");
        fs::copy(&backup_path, &config_path).map_err(|e| {
            log::error!("[CLAUDE_CONFIG] Failed to restore: {}", e);
            format!("恢复源配置文件失败: {}", e)
        })?;
        log::info!("[CLAUDE_CONFIG] Successfully restored source config");
    } else {
        log::warn!("[CLAUDE_CONFIG] No source backup found, creating empty config");
        // 如果没有备份，创建一个最小配置
        let empty_config = ClaudeConfig::default();
        write_claude_config(&empty_config)?;
    }

    Ok(())
}

/// 初始化源文件备份（仅在首次启用中转站时调用）
pub fn init_source_backup() -> Result<(), String> {
    let config_path = get_claude_config_path()?;
    let backup_path = get_config_backup_path()?;

    if !backup_path.exists() && config_path.exists() {
        log::info!("[CLAUDE_CONFIG] Creating initial source backup");
        fs::copy(&config_path, &backup_path).map_err(|e| {
            log::error!("[CLAUDE_CONFIG] Failed to create source backup: {}", e);
            format!("创建源文件备份失败: {}", e)
        })?;
        log::info!("[CLAUDE_CONFIG] Source backup created at: {:?}", backup_path);
    }

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
