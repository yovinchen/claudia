use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use chrono::{DateTime, Utc};
use uuid::Uuid;

/// 智能会话结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartSessionResult {
    /// 会话ID
    pub session_id: String,
    /// 项目路径
    pub project_path: String,
    /// 显示名称
    pub display_name: String,
    /// 创建时间
    pub created_at: DateTime<Utc>,
    /// 会话类型
    pub session_type: String,
}

/// 智能会话配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartSessionConfig {
    /// 是否启用智能会话
    pub enabled: bool,
    /// 基础目录
    pub base_directory: PathBuf,
    /// 命名模式
    pub naming_pattern: String,
    /// 是否启用自动清理
    pub auto_cleanup_enabled: bool,
    /// 自动清理天数
    pub auto_cleanup_days: u32,
    /// 模板文件
    pub template_files: Vec<TemplateFile>,
}

/// 模板文件定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateFile {
    /// 文件路径
    pub path: String,
    /// 文件内容
    pub content: String,
    /// 是否可执行
    pub executable: bool,
}

/// 智能会话记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartSession {
    /// 会话ID
    pub id: String,
    /// 显示名称
    pub display_name: String,
    /// 项目路径
    pub project_path: String,
    /// 创建时间
    pub created_at: DateTime<Utc>,
    /// 最后访问时间
    pub last_accessed: DateTime<Utc>,
    /// 会话类型
    pub session_type: String,
}

impl Default for SmartSessionConfig {
    fn default() -> Self {
        let base_directory = dirs::home_dir()
            .unwrap_or_default()
            .join(".claudia")
            .join("smart-sessions");

        Self {
            enabled: true,
            base_directory,
            naming_pattern: "chat-{timestamp}".to_string(),
            auto_cleanup_enabled: true,
            auto_cleanup_days: 30,
            template_files: vec![
                TemplateFile {
                    path: "CLAUDE.md".to_string(),
                    content: include_str!("../templates/smart_session_claude.md").to_string(),
                    executable: false,
                },
                TemplateFile {
                    path: "README.md".to_string(),
                    content: "# Smart Quick Start Session\n\nThis is an automatically created workspace by Claudia.\n\nCreated at: {created_at}\nSession ID: {session_id}\n".to_string(),
                    executable: false,
                },
                TemplateFile {
                    path: ".gitignore".to_string(),
                    content: "# Claudia Smart Session\n*.log\n.DS_Store\n.env\nnode_modules/\n".to_string(),
                    executable: false,
                },
            ],
        }
    }
}

/// 获取智能会话配置文件路径
fn get_config_path() -> Result<PathBuf> {
    let claudia_dir = dirs::home_dir()
        .context("Failed to get home directory")?
        .join(".claudia");
    
    fs::create_dir_all(&claudia_dir)
        .context("Failed to create .claudia directory")?;
    
    Ok(claudia_dir.join("smart_sessions_config.json"))
}

/// 加载智能会话配置
pub fn load_smart_session_config() -> Result<SmartSessionConfig> {
    let config_path = get_config_path()?;
    
    if !config_path.exists() {
        let default_config = SmartSessionConfig::default();
        save_smart_session_config(&default_config)?;
        return Ok(default_config);
    }
    
    let config_content = fs::read_to_string(&config_path)
        .context("Failed to read smart session config")?;
    
    let config: SmartSessionConfig = serde_json::from_str(&config_content)
        .context("Failed to parse smart session config")?;
    
    Ok(config)
}

/// 保存智能会话配置
pub fn save_smart_session_config(config: &SmartSessionConfig) -> Result<()> {
    let config_path = get_config_path()?;
    
    let config_content = serde_json::to_string_pretty(config)
        .context("Failed to serialize smart session config")?;
    
    fs::write(&config_path, config_content)
        .context("Failed to write smart session config")?;
    
    Ok(())
}

/// 生成智能会话路径
pub fn generate_smart_session_path(
    config: &SmartSessionConfig,
    session_name: Option<String>,
) -> Result<PathBuf> {
    let timestamp = chrono::Utc::now();
    
    let session_name = session_name.unwrap_or_else(|| {
        match config.naming_pattern.as_str() {
            "chat-{timestamp}" => format!("chat-{}", timestamp.format("%Y-%m-%d-%H%M%S")),
            "session-{date}" => format!("session-{}", timestamp.format("%Y-%m-%d")),
            "conversation-{datetime}" => format!("conversation-{}", timestamp.format("%Y%m%d_%H%M%S")),
            _ => format!("chat-{}", timestamp.format("%Y-%m-%d-%H%M%S")),
        }
    });
    
    let session_path = config.base_directory.join(&session_name);
    
    // 确保路径唯一
    if session_path.exists() {
        let uuid = Uuid::new_v4().to_string()[..8].to_string();
        let unique_name = format!("{}-{}", session_name, uuid);
        Ok(config.base_directory.join(unique_name))
    } else {
        Ok(session_path)
    }
}

/// 创建智能会话环境
pub fn create_smart_session_environment(session_path: &PathBuf) -> Result<()> {
    let config = load_smart_session_config()?;
    
    // 创建主目录
    fs::create_dir_all(session_path)
        .context("Failed to create smart session directory")?;
    
    // 创建 .claude 子目录
    let claude_dir = session_path.join(".claude");
    fs::create_dir_all(&claude_dir)
        .context("Failed to create .claude directory")?;
    
    // 创建基础 Claude 设置文件
    let claude_settings = serde_json::json!({
        "smart_session": true,
        "created_by": "claudia",
        "created_at": chrono::Utc::now().to_rfc3339(),
        "session_path": session_path.to_string_lossy()
    });
    
    let settings_path = claude_dir.join("settings.json");
    fs::write(&settings_path, serde_json::to_string_pretty(&claude_settings)?)
        .context("Failed to write Claude settings")?;
    
    // 创建模板文件
    let session_id = Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();
    
    for template in &config.template_files {
        let file_path = session_path.join(&template.path);
        
        // 创建父目录（如果需要）
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent)
                .context("Failed to create template file parent directory")?;
        }
        
        // 替换模板变量
        let content = template.content
            .replace("{session_id}", &session_id)
            .replace("{created_at}", &created_at)
            .replace("{project_path}", &session_path.to_string_lossy());
        
        fs::write(&file_path, content)
            .context(format!("Failed to write template file: {}", template.path))?;
        
        // 设置可执行权限（如果需要）
        #[cfg(unix)]
        if template.executable {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&file_path)?.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(&file_path, perms)?;
        }
    }
    
    log::info!("Created smart session environment at: {}", session_path.display());
    Ok(())
}

/// 获取智能会话历史文件路径
fn get_sessions_history_path() -> Result<PathBuf> {
    let claudia_dir = dirs::home_dir()
        .context("Failed to get home directory")?
        .join(".claudia");
    
    fs::create_dir_all(&claudia_dir)
        .context("Failed to create .claudia directory")?;
    
    Ok(claudia_dir.join("smart_sessions_history.json"))
}

/// 保存智能会话记录
pub fn save_smart_session_record(session_path: &PathBuf) -> Result<String> {
    let session_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now();
    
    let session = SmartSession {
        id: session_id.clone(),
        display_name: session_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Unnamed Session")
            .to_string(),
        project_path: session_path.to_string_lossy().to_string(),
        created_at: now,
        last_accessed: now,
        session_type: "smart".to_string(),
    };
    
    let history_path = get_sessions_history_path()?;
    
    let mut sessions: Vec<SmartSession> = if history_path.exists() {
        let content = fs::read_to_string(&history_path)
            .context("Failed to read sessions history")?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };
    
    sessions.push(session);
    
    let history_content = serde_json::to_string_pretty(&sessions)
        .context("Failed to serialize sessions history")?;
    
    fs::write(&history_path, history_content)
        .context("Failed to write sessions history")?;
    
    Ok(session_id)
}

/// 列出所有智能会话
pub fn list_smart_sessions() -> Result<Vec<SmartSession>> {
    let history_path = get_sessions_history_path()?;
    
    if !history_path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&history_path)
        .context("Failed to read sessions history")?;
    
    let sessions: Vec<SmartSession> = serde_json::from_str(&content)
        .context("Failed to parse sessions history")?;
    
    // 过滤仍然存在的会话
    let existing_sessions: Vec<SmartSession> = sessions
        .into_iter()
        .filter(|session| {
            let path = PathBuf::from(&session.project_path);
            path.exists()
        })
        .collect();
    
    Ok(existing_sessions)
}

/// 清理过期的智能会话
pub fn cleanup_old_smart_sessions(days: u32) -> Result<u32> {
    let config = load_smart_session_config()?;
    if !config.auto_cleanup_enabled {
        return Ok(0);
    }
    
    let cutoff_time = chrono::Utc::now() - chrono::Duration::days(days as i64);
    let sessions = list_smart_sessions()?;
    let mut cleaned_count = 0u32;
    
    let mut remaining_sessions = Vec::new();
    
    for session in sessions {
        if session.last_accessed < cutoff_time {
            // 删除会话目录
            let session_path = PathBuf::from(&session.project_path);
            if session_path.exists() {
                if let Err(e) = fs::remove_dir_all(&session_path) {
                    log::warn!("Failed to remove session directory {}: {}", session_path.display(), e);
                } else {
                    cleaned_count += 1;
                    log::info!("Cleaned up expired session: {}", session.display_name);
                }
            }
        } else {
            remaining_sessions.push(session);
        }
    }
    
    // 更新历史记录
    if cleaned_count > 0 {
        let history_path = get_sessions_history_path()?;
        let history_content = serde_json::to_string_pretty(&remaining_sessions)
            .context("Failed to serialize updated sessions history")?;
        
        fs::write(&history_path, history_content)
            .context("Failed to write updated sessions history")?;
    }
    
    Ok(cleaned_count)
}

// Tauri 命令实现

/// 创建智能快速开始会话
#[tauri::command]
pub async fn create_smart_quick_start_session(
    _app: AppHandle,
    session_name: Option<String>,
) -> Result<SmartSessionResult, String> {
    log::info!("Creating smart quick start session: {:?}", session_name);
    
    let config = load_smart_session_config()
        .map_err(|e| format!("Failed to load config: {}", e))?;
    
    if !config.enabled {
        return Err("Smart sessions are disabled".to_string());
    }
    
    // 1. 生成唯一的会话路径
    let session_path = generate_smart_session_path(&config, session_name)
        .map_err(|e| format!("Failed to generate session path: {}", e))?;
    
    // 2. 创建目录结构和环境
    create_smart_session_environment(&session_path)
        .map_err(|e| format!("Failed to create session environment: {}", e))?;
    
    // 3. 保存到历史记录
    let session_id = save_smart_session_record(&session_path)
        .map_err(|e| format!("Failed to save session record: {}", e))?;
    
    let display_name = session_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Smart Session")
        .to_string();
    
    let result = SmartSessionResult {
        session_id,
        project_path: session_path.to_string_lossy().to_string(),
        display_name,
        created_at: chrono::Utc::now(),
        session_type: "smart".to_string(),
    };
    
    log::info!("Smart session created successfully: {}", result.project_path);
    Ok(result)
}

/// 获取智能会话配置
#[tauri::command]
pub async fn get_smart_session_config() -> Result<SmartSessionConfig, String> {
    load_smart_session_config()
        .map_err(|e| format!("Failed to load smart session config: {}", e))
}

/// 更新智能会话配置
#[tauri::command]
pub async fn update_smart_session_config(
    config: SmartSessionConfig,
) -> Result<(), String> {
    save_smart_session_config(&config)
        .map_err(|e| format!("Failed to save smart session config: {}", e))
}

/// 列出智能会话
#[tauri::command]
pub async fn list_smart_sessions_command() -> Result<Vec<SmartSession>, String> {
    list_smart_sessions()
        .map_err(|e| format!("Failed to list smart sessions: {}", e))
}

/// 切换智能会话模式
#[tauri::command]
pub async fn toggle_smart_session_mode(enabled: bool) -> Result<(), String> {
    let mut config = load_smart_session_config()
        .map_err(|e| format!("Failed to load config: {}", e))?;
    
    config.enabled = enabled;
    
    save_smart_session_config(&config)
        .map_err(|e| format!("Failed to save config: {}", e))?;
    
    log::info!("Smart session mode toggled: {}", enabled);
    Ok(())
}

/// 清理过期智能会话
#[tauri::command]
pub async fn cleanup_old_smart_sessions_command(days: u32) -> Result<u32, String> {
    cleanup_old_smart_sessions(days)
        .map_err(|e| format!("Failed to cleanup old sessions: {}", e))
}