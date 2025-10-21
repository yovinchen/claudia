use chrono::Utc;
use dirs;
use log::{error, info};
use rusqlite::{params, Connection, Result as SqliteResult, Row};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{command, State};
use uuid::Uuid;

use crate::commands::agents::AgentDb;

/// 提示词文件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptFile {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub content: String,
    pub tags: Vec<String>,
    pub is_active: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_used_at: Option<i64>,
    pub display_order: i32,
}

/// 创建提示词文件请求
#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePromptFileRequest {
    pub name: String,
    pub description: Option<String>,
    pub content: String,
    pub tags: Vec<String>,
}

/// 更新提示词文件请求
#[derive(Debug, Serialize, Deserialize)]
pub struct UpdatePromptFileRequest {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub content: String,
    pub tags: Vec<String>,
}

impl PromptFile {
    pub fn from_row(row: &Row) -> Result<Self, rusqlite::Error> {
        let tags_str: String = row.get("tags")?;
        let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();

        Ok(PromptFile {
            id: row.get("id")?,
            name: row.get("name")?,
            description: row.get("description")?,
            content: row.get("content")?,
            tags,
            is_active: row.get::<_, i32>("is_active")? == 1,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            last_used_at: row.get("last_used_at")?,
            display_order: row.get("display_order")?,
        })
    }
}

/// 初始化提示词文件数据库表
pub fn init_prompt_files_tables(conn: &Connection) -> SqliteResult<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS prompt_files (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            content TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '[]',
            is_active INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            last_used_at INTEGER,
            display_order INTEGER DEFAULT 0
        )",
        [],
    )?;

    // 创建索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_prompt_files_active ON prompt_files(is_active)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_prompt_files_name ON prompt_files(name)",
        [],
    )?;

    info!("Prompt files tables initialized");
    Ok(())
}

/// 列出所有提示词文件
#[command]
pub async fn prompt_files_list(db: State<'_, AgentDb>) -> Result<Vec<PromptFile>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, content, tags, is_active, created_at, updated_at, 
             last_used_at, display_order 
             FROM prompt_files 
             ORDER BY display_order ASC, created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let files = stmt
        .query_map([], |row| PromptFile::from_row(row))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(files)
}

/// 获取单个提示词文件
#[command]
pub async fn prompt_file_get(id: String, db: State<'_, AgentDb>) -> Result<PromptFile, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let file = conn
        .query_row(
            "SELECT id, name, description, content, tags, is_active, created_at, updated_at, 
             last_used_at, display_order 
             FROM prompt_files 
             WHERE id = ?1",
            params![id],
            |row| PromptFile::from_row(row),
        )
        .map_err(|e| format!("提示词文件不存在: {}", e))?;

    Ok(file)
}

/// 创建提示词文件
#[command]
pub async fn prompt_file_create(
    request: CreatePromptFileRequest,
    db: State<'_, AgentDb>,
) -> Result<PromptFile, String> {
    info!("Creating prompt file: {}", request.name);

    let id = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;

        // 检查名称是否已存在
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM prompt_files WHERE name = ?1",
                params![request.name],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        if exists {
            return Err(format!("提示词文件名称已存在: {}", request.name));
        }

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();
        let tags_json = serde_json::to_string(&request.tags).unwrap_or_else(|_| "[]".to_string());

        // 获取当前最大 display_order
        let max_order: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(display_order), 0) FROM prompt_files",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        conn.execute(
            "INSERT INTO prompt_files 
             (id, name, description, content, tags, is_active, created_at, updated_at, display_order) 
             VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6, ?7)",
            params![
                id.clone(),
                request.name,
                request.description,
                request.content,
                tags_json,
                now,
                max_order + 1
            ],
        )
        .map_err(|e| format!("创建提示词文件失败: {}", e))?;

        id
    }; // conn is dropped here

    prompt_file_get(id, db).await
}

/// 更新提示词文件
#[command]
pub async fn prompt_file_update(
    request: UpdatePromptFileRequest,
    db: State<'_, AgentDb>,
) -> Result<PromptFile, String> {
    info!("Updating prompt file: {}", request.id);

    let id = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;

        // 检查文件是否存在
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM prompt_files WHERE id = ?1",
                params![request.id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        if !exists {
            return Err("提示词文件不存在".to_string());
        }

        // 检查名称冲突（排除自己）
        let name_conflict: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM prompt_files WHERE name = ?1 AND id != ?2",
                params![request.name, request.id],
                |row| {
                    let count: i32 = row.get(0)?;
                    Ok(count > 0)
                },
            )
            .map_err(|e| e.to_string())?;

        if name_conflict {
            return Err(format!("提示词文件名称已存在: {}", request.name));
        }

        let now = Utc::now().timestamp();
        let tags_json = serde_json::to_string(&request.tags).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "UPDATE prompt_files 
             SET name = ?1, description = ?2, content = ?3, tags = ?4, updated_at = ?5 
             WHERE id = ?6",
            params![
                request.name,
                request.description,
                request.content,
                tags_json,
                now,
                request.id.clone()
            ],
        )
        .map_err(|e| format!("更新提示词文件失败: {}", e))?;

        request.id
    }; // conn is dropped here

    prompt_file_get(id, db).await
}

/// 删除提示词文件
#[command]
pub async fn prompt_file_delete(id: String, db: State<'_, AgentDb>) -> Result<(), String> {
    info!("Deleting prompt file: {}", id);

    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let deleted = conn
        .execute("DELETE FROM prompt_files WHERE id = ?1", params![id])
        .map_err(|e| format!("删除提示词文件失败: {}", e))?;

    if deleted == 0 {
        return Err("提示词文件不存在".to_string());
    }

    Ok(())
}

/// 获取 Claude 配置目录路径（~/.claude）
fn get_claude_config_dir() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "无法获取主目录".to_string())?;
    
    let claude_dir = home_dir.join(".claude");
    
    // 确保目录存在
    if !claude_dir.exists() {
        fs::create_dir_all(&claude_dir)
            .map_err(|e| format!("创建 .claude 目录失败: {}", e))?;
        info!("创建 Claude 配置目录: {:?}", claude_dir);
    }
    
    Ok(claude_dir)
}

/// 应用提示词文件（替换本地 CLAUDE.md）
#[command]
pub async fn prompt_file_apply(
    id: String,
    target_path: Option<String>,
    db: State<'_, AgentDb>,
) -> Result<String, String> {
    info!("Applying prompt file: {} to {:?}", id, target_path);

    // 1. 从数据库读取提示词文件
    let file = prompt_file_get(id.clone(), db.clone()).await?;

    // 2. 确定目标路径
    let claude_md_path = if let Some(path) = target_path {
        PathBuf::from(path).join("CLAUDE.md")
    } else {
        // 默认使用 ~/.claude/CLAUDE.md（和 settings.json 同目录）
        get_claude_config_dir()?.join("CLAUDE.md")
    };

    // 3. 备份现有文件（如果存在）- 使用时间戳避免触发文件监视
    if claude_md_path.exists() {
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let backup_path = claude_md_path.with_file_name(format!("CLAUDE.md.backup.{}", timestamp));
        fs::copy(&claude_md_path, &backup_path)
            .map_err(|e| format!("备份文件失败: {}", e))?;
        info!("Backed up existing CLAUDE.md to {:?}", backup_path);
    }

    // 4. 写入新内容
    fs::write(&claude_md_path, &file.content)
        .map_err(|e| format!("写入文件失败: {}", e))?;

    // 5. 更新数据库状态
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // 将所有文件的 is_active 设为 0
    conn.execute("UPDATE prompt_files SET is_active = 0", [])
        .map_err(|e| format!("更新激活状态失败: {}", e))?;

    // 将当前文件设为激活并更新最后使用时间
    let now = Utc::now().timestamp();
    conn.execute(
        "UPDATE prompt_files SET is_active = 1, last_used_at = ?1 WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| format!("更新激活状态失败: {}", e))?;

    info!("Applied prompt file to {:?}", claude_md_path);
    Ok(claude_md_path.to_string_lossy().to_string())
}

/// 取消使用当前提示词文件
#[command]
pub async fn prompt_file_deactivate(db: State<'_, AgentDb>) -> Result<(), String> {
    info!("Deactivating all prompt files");

    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute("UPDATE prompt_files SET is_active = 0", [])
        .map_err(|e| format!("取消激活失败: {}", e))?;

    Ok(())
}

/// 从当前 CLAUDE.md 导入
#[command]
pub async fn prompt_file_import_from_claude_md(
    name: String,
    description: Option<String>,
    source_path: Option<String>,
    db: State<'_, AgentDb>,
) -> Result<PromptFile, String> {
    info!("Importing from CLAUDE.md: {:?}", source_path);

    // 1. 确定源文件路径
    let claude_md_path = if let Some(path) = source_path {
        PathBuf::from(path)
    } else {
        // 默认从 ~/.claude/CLAUDE.md 导入
        get_claude_config_dir()?.join("CLAUDE.md")
    };

    // 2. 读取文件内容
    if !claude_md_path.exists() {
        return Err("CLAUDE.md 文件不存在".to_string());
    }

    let content = fs::read_to_string(&claude_md_path)
        .map_err(|e| format!("读取文件失败: {}", e))?;

    // 3. 自动提取标签（简单实现：从内容中提取关键词）
    let tags = extract_tags_from_content(&content);

    // 4. 创建提示词文件
    let request = CreatePromptFileRequest {
        name,
        description,
        content,
        tags,
    };

    prompt_file_create(request, db).await
}

/// 从内容中提取标签（简单实现）
fn extract_tags_from_content(content: &str) -> Vec<String> {
    let mut tags = Vec::new();
    let content_lower = content.to_lowercase();

    // 常见技术栈关键词
    let keywords = [
        "react",
        "vue",
        "angular",
        "typescript",
        "javascript",
        "node",
        "nodejs",
        "express",
        "nest",
        "python",
        "django",
        "flask",
        "rust",
        "go",
        "java",
        "spring",
        "frontend",
        "backend",
        "fullstack",
        "api",
        "rest",
        "graphql",
        "database",
        "mongodb",
        "postgresql",
        "mysql",
        "redis",
        "docker",
        "kubernetes",
        "aws",
        "testing",
        "jest",
        "vitest",
    ];

    for keyword in keywords.iter() {
        if content_lower.contains(keyword) {
            tags.push(keyword.to_string());
        }
    }

    // 限制标签数量
    tags.truncate(10);
    tags
}

/// 导出提示词文件
#[command]
pub async fn prompt_file_export(
    id: String,
    export_path: String,
    db: State<'_, AgentDb>,
) -> Result<(), String> {
    info!("Exporting prompt file {} to {}", id, export_path);

    let file = prompt_file_get(id, db).await?;

    fs::write(&export_path, &file.content)
        .map_err(|e| format!("导出文件失败: {}", e))?;

    Ok(())
}

/// 更新提示词文件排序
#[command]
pub async fn prompt_files_update_order(
    ids: Vec<String>,
    db: State<'_, AgentDb>,
) -> Result<(), String> {
    info!("Updating prompt files order");

    let conn = db.0.lock().map_err(|e| e.to_string())?;

    for (index, id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE prompt_files SET display_order = ?1 WHERE id = ?2",
            params![index as i32, id],
        )
        .map_err(|e| format!("更新排序失败: {}", e))?;
    }

    Ok(())
}

/// 批量导入提示词文件
#[command]
pub async fn prompt_files_import_batch(
    files: Vec<CreatePromptFileRequest>,
    db: State<'_, AgentDb>,
) -> Result<Vec<PromptFile>, String> {
    info!("Batch importing {} prompt files", files.len());

    let mut imported = Vec::new();

    for request in files {
        match prompt_file_create(request, db.clone()).await {
            Ok(file) => imported.push(file),
            Err(e) => error!("Failed to import file: {}", e),
        }
    }

    Ok(imported)
}

