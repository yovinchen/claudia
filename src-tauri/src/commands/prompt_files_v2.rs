use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::command;
use log::{info, warn};

/// 提示词文件信息（从文件系统读取）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptFileInfo {
    pub project_id: String,        // 项目 ID（来自 projects 目录名）
    pub project_path: String,       // 实际项目路径
    pub has_claude_md: bool,        // 是否存在 .claude/CLAUDE.md
    pub content: Option<String>,    // CLAUDE.md 文件内容
    pub file_size: Option<u64>,     // 文件大小（字节）
    pub modified_at: Option<i64>,   // 最后修改时间
    pub claude_md_path: String,     // .claude/CLAUDE.md 完整路径
}

/// 获取 Claude 目录
fn get_claude_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|p| p.join(".claude"))
        .ok_or_else(|| "无法获取 home 目录".to_string())
}

/// 从项目名解码实际路径
fn decode_project_path(encoded_name: &str) -> String {
    // 简单的路径解码 - 将编码的斜杠 (%2F 或 -) 转回斜杠
    encoded_name.replace("%2F", "/").replace("-", "/")
}

/// 从会话文件中获取项目路径
fn get_project_path_from_sessions(project_dir: &PathBuf) -> Result<String, String> {
    let entries = fs::read_dir(project_dir)
        .map_err(|e| format!("无法读取项目目录: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
            // 读取 JSONL 文件的第一行
            if let Ok(content) = fs::read_to_string(&path) {
                if let Some(first_line) = content.lines().next() {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(first_line) {
                        if let Some(cwd) = json.get("cwd").and_then(|v| v.as_str()) {
                            return Ok(cwd.to_string());
                        }
                    }
                }
            }
        }
    }

    Err("未找到项目路径".to_string())
}

/// 扫描所有项目的提示词文件
#[command]
pub async fn scan_prompt_files() -> Result<Vec<PromptFileInfo>, String> {
    info!("扫描项目提示词文件");

    let claude_dir = get_claude_dir()?;
    let projects_dir = claude_dir.join("projects");

    if !projects_dir.exists() {
        warn!("项目目录不存在: {:?}", projects_dir);
        return Ok(Vec::new());
    }

    let mut prompt_files = Vec::new();

    // 读取所有项目目录
    let entries = fs::read_dir(&projects_dir)
        .map_err(|e| format!("无法读取项目目录: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("无法读取目录条目: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            let project_id = path
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| "无效的目录名".to_string())?
                .to_string();

            // 获取实际项目路径
            let project_path = match get_project_path_from_sessions(&path) {
                Ok(p) => p.clone(),
                Err(_) => {
                    warn!("无法从会话获取项目路径，使用解码: {}", project_id);
                    decode_project_path(&project_id)
                }
            };

            // 检查 .claude/CLAUDE.md 是否存在
            let claude_md_path = PathBuf::from(&project_path).join(".claude").join("CLAUDE.md");
            let has_claude_md = claude_md_path.exists();

            let (content, file_size, modified_at) = if has_claude_md {
                // 读取文件内容
                let content = fs::read_to_string(&claude_md_path)
                    .ok();
                
                // 获取文件元数据
                let metadata = fs::metadata(&claude_md_path).ok();
                let file_size = metadata.as_ref().map(|m| m.len());
                let modified_at = metadata
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64);

                (content, file_size, modified_at)
            } else {
                (None, None, None)
            };

            prompt_files.push(PromptFileInfo {
                project_id,
                project_path: project_path.clone(),
                has_claude_md,
                content,
                file_size,
                modified_at,
                claude_md_path: claude_md_path.to_string_lossy().to_string(),
            });
        }
    }

    // 按最后修改时间排序（最新的在前）
    prompt_files.sort_by(|a, b| {
        match (b.modified_at, a.modified_at) {
            (Some(b_time), Some(a_time)) => b_time.cmp(&a_time),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.project_path.cmp(&b.project_path),
        }
    });

    info!("找到 {} 个项目，其中 {} 个有 CLAUDE.md", 
        prompt_files.len(), 
        prompt_files.iter().filter(|p| p.has_claude_md).count()
    );

    Ok(prompt_files)
}

/// 读取指定项目的 CLAUDE.md 文件
#[command]
pub async fn read_prompt_file(project_path: String) -> Result<String, String> {
    info!("读取提示词文件: {}", project_path);

    let claude_md_path = PathBuf::from(&project_path).join(".claude").join("CLAUDE.md");

    if !claude_md_path.exists() {
        return Err(format!("文件不存在: {:?}", claude_md_path));
    }

    fs::read_to_string(&claude_md_path)
        .map_err(|e| format!("读取文件失败: {}", e))
}

/// 保存 CLAUDE.md 文件
#[command]
pub async fn save_prompt_file(project_path: String, content: String) -> Result<(), String> {
    info!("保存提示词文件: {}", project_path);

    let claude_dir = PathBuf::from(&project_path).join(".claude");
    let claude_md_path = claude_dir.join("CLAUDE.md");

    // 确保 .claude 目录存在
    if !claude_dir.exists() {
        fs::create_dir_all(&claude_dir)
            .map_err(|e| format!("创建 .claude 目录失败: {}", e))?;
        info!("创建 .claude 目录: {:?}", claude_dir);
    }

    // 备份现有文件
    if claude_md_path.exists() {
        let backup_path = claude_md_path.with_extension("md.backup");
        fs::copy(&claude_md_path, &backup_path)
            .map_err(|e| format!("备份文件失败: {}", e))?;
        info!("备份现有文件到: {:?}", backup_path);
    }

    // 写入新内容
    fs::write(&claude_md_path, content)
        .map_err(|e| format!("写入文件失败: {}", e))?;

    info!("成功保存文件: {:?}", claude_md_path);
    Ok(())
}

/// 创建新的 CLAUDE.md 文件
#[command]
pub async fn create_prompt_file(project_path: String, content: String) -> Result<(), String> {
    info!("创建提示词文件: {}", project_path);

    let claude_dir = PathBuf::from(&project_path).join(".claude");
    let claude_md_path = claude_dir.join("CLAUDE.md");

    // 检查文件是否已存在
    if claude_md_path.exists() {
        return Err("CLAUDE.md 文件已存在，请使用编辑功能".to_string());
    }

    // 确保 .claude 目录存在
    if !claude_dir.exists() {
        fs::create_dir_all(&claude_dir)
            .map_err(|e| format!("创建 .claude 目录失败: {}", e))?;
        info!("创建 .claude 目录: {:?}", claude_dir);
    }

    // 写入内容
    fs::write(&claude_md_path, content)
        .map_err(|e| format!("写入文件失败: {}", e))?;

    info!("成功创建文件: {:?}", claude_md_path);
    Ok(())
}

/// 删除 CLAUDE.md 文件
#[command]
pub async fn delete_prompt_file(project_path: String) -> Result<(), String> {
    info!("删除提示词文件: {}", project_path);

    let claude_md_path = PathBuf::from(&project_path).join(".claude").join("CLAUDE.md");

    if !claude_md_path.exists() {
        return Err("文件不存在".to_string());
    }

    // 备份到 .backup
    let backup_path = claude_md_path.with_extension("md.backup");
    fs::copy(&claude_md_path, &backup_path)
        .map_err(|e| format!("备份文件失败: {}", e))?;

    // 删除文件
    fs::remove_file(&claude_md_path)
        .map_err(|e| format!("删除文件失败: {}", e))?;

    info!("成功删除文件（已备份到 {:?}）", backup_path);
    Ok(())
}

/// 复制 CLAUDE.md 到另一个项目
#[command]
pub async fn copy_prompt_file(
    source_project_path: String,
    target_project_path: String,
) -> Result<(), String> {
    info!("复制提示词文件: {} -> {}", source_project_path, target_project_path);

    let source_path = PathBuf::from(&source_project_path).join(".claude").join("CLAUDE.md");
    if !source_path.exists() {
        return Err("源文件不存在".to_string());
    }

    // 读取源文件
    let content = fs::read_to_string(&source_path)
        .map_err(|e| format!("读取源文件失败: {}", e))?;

    // 保存到目标路径
    save_prompt_file(target_project_path, content).await
}

