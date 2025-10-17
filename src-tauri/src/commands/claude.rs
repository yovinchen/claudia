use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::SystemTime;
use tauri::{AppHandle, Emitter, Manager};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

/// Global state to track current Claude process
pub struct ClaudeProcessState {
    pub current_process: Arc<Mutex<Option<Child>>>,
}

impl Default for ClaudeProcessState {
    fn default() -> Self {
        Self {
            current_process: Arc::new(Mutex::new(None)),
        }
    }
}

/// Represents a project in the ~/.claude/projects directory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    /// The project ID (derived from the directory name)
    pub id: String,
    /// The original project path (decoded from the directory name)
    pub path: String,
    /// List of session IDs (JSONL file names without extension)
    pub sessions: Vec<String>,
    /// Unix timestamp when the project directory was created
    pub created_at: u64,
    /// Unix timestamp of the most recent session (last modified time of newest JSONL file)
    pub last_session_time: u64,
}

/// Represents a session with its metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    /// The session ID (UUID)
    pub id: String,
    /// The project ID this session belongs to
    pub project_id: String,
    /// The project path
    pub project_path: String,
    /// Optional todo data associated with this session
    pub todo_data: Option<serde_json::Value>,
    /// Unix timestamp when the session file was created
    pub created_at: u64,
    /// First user message content (if available)
    pub first_message: Option<String>,
    /// Timestamp of the first user message (if available)
    pub message_timestamp: Option<String>,
}

/// Represents a message entry in the JSONL file
#[derive(Debug, Deserialize)]
struct JsonlEntry {
    #[serde(rename = "type")]
    #[allow(dead_code)]
    entry_type: Option<String>,
    message: Option<MessageContent>,
    timestamp: Option<String>,
}

/// Represents the message content
#[derive(Debug, Deserialize)]
struct MessageContent {
    role: Option<String>,
    content: Option<String>,
}

/// Represents the settings from ~/.claude/settings.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSettings {
    #[serde(flatten)]
    pub data: serde_json::Value,
}

impl Default for ClaudeSettings {
    fn default() -> Self {
        Self {
            data: serde_json::json!({}),
        }
    }
}

/// Represents the Claude Code version status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeVersionStatus {
    /// Whether Claude Code is installed and working
    pub is_installed: bool,
    /// The version string if available
    pub version: Option<String>,
    /// The full output from the command
    pub output: String,
}

/// Represents a CLAUDE.md file found in the project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeMdFile {
    /// Relative path from the project root
    pub relative_path: String,
    /// Absolute path to the file
    pub absolute_path: String,
    /// File size in bytes
    pub size: u64,
    /// Last modified timestamp
    pub modified: u64,
}

/// Represents a file or directory entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    /// The name of the file or directory
    pub name: String,
    /// The full path
    pub path: String,
    /// Whether this is a directory
    pub is_directory: bool,
    /// File size in bytes (0 for directories)
    pub size: u64,
    /// File extension (if applicable)
    pub extension: Option<String>,
}

/// Finds the full path to the claude binary
/// This is necessary because macOS apps have a limited PATH environment
fn find_claude_binary(app_handle: &AppHandle) -> Result<String, String> {
    crate::claude_binary::find_claude_binary(app_handle)
}

/// Gets the path to the ~/.claude directory
fn get_claude_dir() -> Result<PathBuf> {
    dirs::home_dir()
        .context("Could not find home directory")?
        .join(".claude")
        .canonicalize()
        .context("Could not find ~/.claude directory")
}

/// Gets the actual project path by reading the cwd from the first JSONL entry
fn get_project_path_from_sessions(project_dir: &PathBuf) -> Result<String, String> {
    // Try to read any JSONL file in the directory
    let entries = fs::read_dir(project_dir)
        .map_err(|e| format!("Failed to read project directory: {}", e))?;

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                // Read the first line of the JSONL file
                if let Ok(file) = fs::File::open(&path) {
                    let reader = BufReader::new(file);
                    if let Some(Ok(first_line)) = reader.lines().next() {
                        // Parse the JSON and extract cwd
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&first_line) {
                            if let Some(cwd) = json.get("cwd").and_then(|v| v.as_str()) {
                                return Ok(cwd.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    Err("Could not determine project path from session files".to_string())
}

/// Decodes a project directory name back to its original path
/// The directory names in ~/.claude/projects are encoded paths
/// DEPRECATED: Use get_project_path_from_sessions instead when possible
fn decode_project_path(encoded: &str) -> String {
    // This is a fallback - the encoding isn't reversible when paths contain hyphens
    // For example: -Users-mufeedvh-dev-jsonl-viewer could be /Users/mufeedvh/dev/jsonl-viewer
    // or /Users/mufeedvh/dev/jsonl/viewer
    encoded.replace('-', "/")
}

/// Extracts the first valid user message from a JSONL file
fn extract_first_user_message(jsonl_path: &PathBuf) -> (Option<String>, Option<String>) {
    let file = match fs::File::open(jsonl_path) {
        Ok(file) => file,
        Err(_) => return (None, None),
    };

    let reader = BufReader::new(file);

    for line in reader.lines() {
        if let Ok(line) = line {
            if let Ok(entry) = serde_json::from_str::<JsonlEntry>(&line) {
                if let Some(message) = entry.message {
                    if message.role.as_deref() == Some("user") {
                        if let Some(content) = message.content {
                            // Skip if it contains the caveat message
                            if content.contains("Caveat: The messages below were generated by the user while running local commands") {
                                continue;
                            }

                            // Skip if it starts with command tags
                            if content.starts_with("<command-name>")
                                || content.starts_with("<local-command-stdout>")
                            {
                                continue;
                            }

                            // Found a valid user message
                            return (Some(content), entry.timestamp);
                        }
                    }
                }
            }
        }
    }

    (None, None)
}

/// Helper function to create a tokio Command with proper environment variables
/// This ensures commands like Claude can find Node.js and other dependencies
fn create_command_with_env(program: &str) -> Command {
    // Convert std::process::Command to tokio::process::Command
    let _std_cmd = crate::claude_binary::create_command_with_env(program);

    // Create a new tokio Command from the program path
    let mut tokio_cmd = Command::new(program);

    // Copy over all environment variables
    for (key, value) in std::env::vars() {
        if key == "PATH"
            || key == "HOME"
            || key == "USER"
            || key == "SHELL"
            || key == "LANG"
            || key == "LC_ALL"
            || key.starts_with("LC_")
            || key == "NODE_PATH"
            || key == "NVM_DIR"
            || key == "NVM_BIN"
            || key == "HOMEBREW_PREFIX"
            || key == "HOMEBREW_CELLAR"
        {
            log::debug!("Inheriting env var: {}={}", key, value);
            tokio_cmd.env(&key, &value);
        }
    }

    // Add NVM support if the program is in an NVM directory
    if program.contains("/.nvm/versions/node/") {
        if let Some(node_bin_dir) = std::path::Path::new(program).parent() {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let node_bin_str = node_bin_dir.to_string_lossy();
            if !current_path.contains(&node_bin_str.as_ref()) {
                let new_path = format!("{}:{}", node_bin_str, current_path);
                tokio_cmd.env("PATH", new_path);
            }
        }
    }

    tokio_cmd
}

/// Creates a system binary command with the given arguments
fn create_system_command(claude_path: &str, args: Vec<String>, project_path: &str) -> Command {
    let mut cmd = create_command_with_env(claude_path);

    // Add all arguments
    for arg in args {
        cmd.arg(arg);
    }

    cmd.current_dir(project_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    cmd
}

/// Starts watching the Claude projects directory for the specific project
#[tauri::command]
pub async fn watch_claude_project_directory(
    project_path: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    use crate::file_watcher::FileWatcherState;
    let project_path_buf = PathBuf::from(&project_path);

    // 支持直接传入位于 ~/.claude 或 ~/.claudia 下的特殊目录（例如智能会话）
    if (project_path.contains("/.claude/") || project_path.contains("/.claudia/"))
        && project_path_buf.exists()
    {
        let file_watcher_state = app_handle.state::<FileWatcherState>();
        let path_str = project_path_buf.to_string_lossy().to_string();
        return file_watcher_state
            .with_manager(|manager| manager.watch_path(&path_str, false))
            .map_err(|e| format!("Failed to watch Claude project directory: {}", e));
    }

    log::info!(
        "Starting to watch Claude project directory for project: {}",
        project_path
    );

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let projects_dir = claude_dir.join("projects");

    if !projects_dir.exists() {
        return Err("Claude projects directory does not exist".to_string());
    }

    // 找到对应项目的目录
    if let Ok(entries) = std::fs::read_dir(&projects_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_dir() {
                    // 检查是否是当前项目的目录
                    if let Ok(found_project_path) = get_project_path_from_sessions(&path) {
                        if found_project_path == project_path {
                            // 找到了对应的项目目录，开始监控
                            let file_watcher_state = app_handle.state::<FileWatcherState>();
                            let path_str = path.to_string_lossy().to_string();

                            return file_watcher_state
                                .with_manager(|manager| manager.watch_path(&path_str, false))
                                .map_err(|e| {
                                    format!("Failed to watch Claude project directory: {}", e)
                                });
                        }
                    }
                }
            }
        }
    }

    Err("Could not find Claude project directory for the given project path".to_string())
}

/// Stops watching the Claude projects directory
#[tauri::command]
pub async fn unwatch_claude_project_directory(
    project_path: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    use crate::file_watcher::FileWatcherState;
    let project_path_buf = PathBuf::from(&project_path);

    // 对智能会话等位于 ~/.claude* 下的目录执行直接取消
    if project_path.contains("/.claude/") || project_path.contains("/.claudia/") {
        let file_watcher_state = app_handle.state::<FileWatcherState>();
        let path_str = project_path_buf.to_string_lossy().to_string();
        return file_watcher_state
            .with_manager(|manager| manager.unwatch_path(&path_str))
            .map_err(|e| format!("Failed to stop watching Claude project directory: {}", e));
    }

    log::info!(
        "Stopping watch on Claude project directory for project: {}",
        project_path
    );

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let projects_dir = claude_dir.join("projects");

    if !projects_dir.exists() {
        return Ok(()); // 目录不存在，视为成功
    }

    // 找到对应项目的目录
    if let Ok(entries) = std::fs::read_dir(&projects_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_dir() {
                    // 检查是否是当前项目的目录
                    if let Ok(found_project_path) = get_project_path_from_sessions(&path) {
                        if found_project_path == project_path {
                            // 找到了对应的项目目录，停止监控
                            let file_watcher_state = app_handle.state::<FileWatcherState>();
                            let path_str = path.to_string_lossy().to_string();

                            return file_watcher_state
                                .with_manager(|manager| manager.unwatch_path(&path_str))
                                .map_err(|e| {
                                    format!(
                                        "Failed to stop watching Claude project directory: {}",
                                        e
                                    )
                                });
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

/// Lists all projects in the ~/.claude/projects directory
#[tauri::command]
pub async fn list_projects() -> Result<Vec<Project>, String> {
    log::info!("Listing projects from ~/.claude/projects");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let projects_dir = claude_dir.join("projects");

    if !projects_dir.exists() {
        log::warn!("Projects directory does not exist: {:?}", projects_dir);
        return Ok(Vec::new());
    }

    let mut projects = Vec::new();

    // Read all directories in the projects folder
    let entries = fs::read_dir(&projects_dir)
        .map_err(|e| format!("Failed to read projects directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            let dir_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| "Invalid directory name".to_string())?;

            // Get directory creation time
            let metadata = fs::metadata(&path)
                .map_err(|e| format!("Failed to read directory metadata: {}", e))?;

            let created_at = metadata
                .created()
                .or_else(|_| metadata.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH)
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            // Get the actual project path from JSONL files
            let project_path = match get_project_path_from_sessions(&path) {
                Ok(path) => path,
                Err(e) => {
                    log::warn!("Failed to get project path from sessions for {}: {}, falling back to decode", dir_name, e);
                    decode_project_path(dir_name)
                }
            };

            // List all JSONL files (sessions) in this project directory
            let mut sessions = Vec::new();
            let mut last_session_time = created_at; // Default to project creation time

            if let Ok(session_entries) = fs::read_dir(&path) {
                for session_entry in session_entries.flatten() {
                    let session_path = session_entry.path();
                    if session_path.is_file()
                        && session_path.extension().and_then(|s| s.to_str()) == Some("jsonl")
                    {
                        if let Some(session_id) = session_path.file_stem().and_then(|s| s.to_str())
                        {
                            sessions.push(session_id.to_string());

                            // Get the modified time of this session file
                            if let Ok(metadata) = fs::metadata(&session_path) {
                                if let Ok(modified) = metadata.modified() {
                                    let modified_time = modified
                                        .duration_since(SystemTime::UNIX_EPOCH)
                                        .unwrap_or_default()
                                        .as_secs();

                                    // Update last_session_time if this file is newer
                                    if modified_time > last_session_time {
                                        last_session_time = modified_time;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            projects.push(Project {
                id: dir_name.to_string(),
                path: project_path,
                sessions,
                created_at,
                last_session_time,
            });
        }
    }

    // Sort projects by last session time (newest first)
    projects.sort_by(|a, b| b.last_session_time.cmp(&a.last_session_time));

    log::info!("Found {} projects", projects.len());
    Ok(projects)
}

/// Gets sessions for a specific project
#[tauri::command]
pub async fn get_project_sessions(project_id: String) -> Result<Vec<Session>, String> {
    log::info!("Getting sessions for project: {}", project_id);

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let project_dir = claude_dir.join("projects").join(&project_id);
    let todos_dir = claude_dir.join("todos");

    if !project_dir.exists() {
        return Err(format!("Project directory not found: {}", project_id));
    }

    // Get the actual project path from JSONL files
    let project_path = match get_project_path_from_sessions(&project_dir) {
        Ok(path) => path,
        Err(e) => {
            log::warn!(
                "Failed to get project path from sessions for {}: {}, falling back to decode",
                project_id,
                e
            );
            decode_project_path(&project_id)
        }
    };

    let mut sessions = Vec::new();

    // Read all JSONL files in the project directory
    let entries = fs::read_dir(&project_dir)
        .map_err(|e| format!("Failed to read project directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
            if let Some(session_id) = path.file_stem().and_then(|s| s.to_str()) {
                // Get file creation time
                let metadata = fs::metadata(&path)
                    .map_err(|e| format!("Failed to read file metadata: {}", e))?;

                let created_at = metadata
                    .created()
                    .or_else(|_| metadata.modified())
                    .unwrap_or(SystemTime::UNIX_EPOCH)
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                // Extract first user message and timestamp
                let (first_message, message_timestamp) = extract_first_user_message(&path);

                // Try to load associated todo data
                let todo_path = todos_dir.join(format!("{}.json", session_id));
                let todo_data = if todo_path.exists() {
                    fs::read_to_string(&todo_path)
                        .ok()
                        .and_then(|content| serde_json::from_str(&content).ok())
                } else {
                    None
                };

                sessions.push(Session {
                    id: session_id.to_string(),
                    project_id: project_id.clone(),
                    project_path: project_path.clone(),
                    todo_data,
                    created_at,
                    first_message,
                    message_timestamp,
                });
            }
        }
    }

    // Sort sessions by creation time (newest first)
    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    log::info!(
        "Found {} sessions for project {}",
        sessions.len(),
        project_id
    );
    Ok(sessions)
}

/// Reads the Claude settings file
#[tauri::command]
pub async fn get_claude_settings() -> Result<ClaudeSettings, String> {
    log::info!("Reading Claude settings");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let settings_path = claude_dir.join("settings.json");

    if !settings_path.exists() {
        log::warn!("Settings file not found, returning empty settings");
        return Ok(ClaudeSettings {
            data: serde_json::json!({}),
        });
    }

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;

    let data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings JSON: {}", e))?;

    Ok(ClaudeSettings { data })
}

/// Opens a new Claude Code session by executing the claude command
#[tauri::command]
pub async fn open_new_session(app: AppHandle, path: Option<String>) -> Result<String, String> {
    log::info!("Opening new Claude Code session at path: {:?}", path);

    #[cfg(not(debug_assertions))]
    let _claude_path = find_claude_binary(&app)?;

    #[cfg(debug_assertions)]
    let claude_path = find_claude_binary(&app)?;

    // In production, we can't use std::process::Command directly
    // The user should launch Claude Code through other means or use the execute_claude_code command
    #[cfg(not(debug_assertions))]
    {
        log::error!("Cannot spawn processes directly in production builds");
        return Err("Direct process spawning is not available in production builds. Please use Claude Code directly or use the integrated execution commands.".to_string());
    }

    #[cfg(debug_assertions)]
    {
        let mut cmd = std::process::Command::new(claude_path);

        // If a path is provided, use it; otherwise use current directory
        if let Some(project_path) = path {
            cmd.current_dir(&project_path);
        }

        // Execute the command
        match cmd.spawn() {
            Ok(_) => {
                log::info!("Successfully launched Claude Code");
                Ok("Claude Code session started".to_string())
            }
            Err(e) => {
                log::error!("Failed to launch Claude Code: {}", e);
                Err(format!("Failed to launch Claude Code: {}", e))
            }
        }
    }
}

/// Reads the CLAUDE.md system prompt file
#[tauri::command]
pub async fn get_system_prompt() -> Result<String, String> {
    log::info!("Reading CLAUDE.md system prompt");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let claude_md_path = claude_dir.join("CLAUDE.md");

    if !claude_md_path.exists() {
        log::warn!("CLAUDE.md not found");
        return Ok(String::new());
    }

    fs::read_to_string(&claude_md_path).map_err(|e| format!("Failed to read CLAUDE.md: {}", e))
}

/// Checks if Claude Code is installed and gets its version
#[tauri::command]
pub async fn check_claude_version(_app: AppHandle) -> Result<ClaudeVersionStatus, String> {
    log::info!("Checking Claude Code version");

    // Try to find Claude installations with versions
    let installations = crate::claude_binary::discover_claude_installations();

    if installations.is_empty() {
        return Ok(ClaudeVersionStatus {
            is_installed: false,
            version: None,
            output: "Claude Code not found. Please ensure it's installed.".to_string(),
        });
    }

    // Find the best installation (highest version or first found)
    let best_installation = installations
        .into_iter()
        .max_by(|a, b| match (&a.version, &b.version) {
            (Some(v1), Some(v2)) => v1.cmp(v2),
            (Some(_), None) => std::cmp::Ordering::Greater,
            (None, Some(_)) => std::cmp::Ordering::Less,
            (None, None) => std::cmp::Ordering::Equal,
        })
        .unwrap(); // Safe because we checked is_empty() above

    log::info!("Found Claude installation: {:?}", best_installation);

    Ok(ClaudeVersionStatus {
        is_installed: true,
        version: best_installation.version,
        output: format!("Claude binary found at: {}", best_installation.path),
    })
}

/// Saves the CLAUDE.md system prompt file
#[tauri::command]
pub async fn save_system_prompt(content: String) -> Result<String, String> {
    log::info!("Saving CLAUDE.md system prompt");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let claude_md_path = claude_dir.join("CLAUDE.md");

    fs::write(&claude_md_path, content).map_err(|e| format!("Failed to write CLAUDE.md: {}", e))?;

    Ok("System prompt saved successfully".to_string())
}

/// Saves the Claude settings file
#[tauri::command]
pub async fn save_claude_settings(settings: serde_json::Value) -> Result<String, String> {
    log::info!("Saving Claude settings");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let settings_path = claude_dir.join("settings.json");

    // Pretty print the JSON with 2-space indentation
    let json_string = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, json_string)
        .map_err(|e| format!("Failed to write settings file: {}", e))?;

    Ok("Settings saved successfully".to_string())
}

/// Recursively finds all CLAUDE.md files in a project directory
#[tauri::command]
pub async fn find_claude_md_files(project_path: String) -> Result<Vec<ClaudeMdFile>, String> {
    log::info!("Finding CLAUDE.md files in project: {}", project_path);

    let path = PathBuf::from(&project_path);
    if !path.exists() {
        return Err(format!("Project path does not exist: {}", project_path));
    }

    let mut claude_files = Vec::new();
    find_claude_md_recursive(&path, &path, &mut claude_files)?;

    // Sort by relative path
    claude_files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    log::info!("Found {} CLAUDE.md files", claude_files.len());
    Ok(claude_files)
}

/// Helper function to recursively find CLAUDE.md files
fn find_claude_md_recursive(
    current_path: &PathBuf,
    project_root: &PathBuf,
    claude_files: &mut Vec<ClaudeMdFile>,
) -> Result<(), String> {
    let entries = fs::read_dir(current_path)
        .map_err(|e| format!("Failed to read directory {:?}: {}", current_path, e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Skip hidden files/directories
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                continue;
            }
        }

        if path.is_dir() {
            // Skip common directories that shouldn't be searched
            if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                if matches!(
                    dir_name,
                    "node_modules" | "target" | ".git" | "dist" | "build" | ".next" | "__pycache__"
                ) {
                    continue;
                }
            }

            find_claude_md_recursive(&path, project_root, claude_files)?;
        } else if path.is_file() {
            // Check if it's a CLAUDE.md file (case insensitive)
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if file_name.eq_ignore_ascii_case("CLAUDE.md") {
                    let metadata = fs::metadata(&path)
                        .map_err(|e| format!("Failed to read file metadata: {}", e))?;

                    let relative_path = path
                        .strip_prefix(project_root)
                        .map_err(|e| format!("Failed to get relative path: {}", e))?
                        .to_string_lossy()
                        .to_string();

                    let modified = metadata
                        .modified()
                        .unwrap_or(SystemTime::UNIX_EPOCH)
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();

                    claude_files.push(ClaudeMdFile {
                        relative_path,
                        absolute_path: path.to_string_lossy().to_string(),
                        size: metadata.len(),
                        modified,
                    });
                }
            }
        }
    }

    Ok(())
}

/// Reads a specific CLAUDE.md file by its absolute path
#[tauri::command]
pub async fn read_claude_md_file(file_path: String) -> Result<String, String> {
    log::info!("Reading CLAUDE.md file: {}", file_path);

    let path = PathBuf::from(&file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// Saves a specific CLAUDE.md file by its absolute path
#[tauri::command]
pub async fn save_claude_md_file(file_path: String, content: String) -> Result<String, String> {
    log::info!("Saving CLAUDE.md file: {}", file_path);

    let path = PathBuf::from(&file_path);

    // Ensure the parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok("File saved successfully".to_string())
}

/// Loads the JSONL history for a specific session
#[tauri::command]
pub async fn load_session_history(
    session_id: String,
    project_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    log::info!(
        "Loading session history for session: {} in project: {}",
        session_id,
        project_id
    );

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let session_path = claude_dir
        .join("projects")
        .join(&project_id)
        .join(format!("{}.jsonl", session_id));

    if !session_path.exists() {
        return Err(format!("Session file not found: {}", session_id));
    }

    let file =
        fs::File::open(&session_path).map_err(|e| format!("Failed to open session file: {}", e))?;

    let reader = BufReader::new(file);
    let mut messages = Vec::new();

    for line in reader.lines() {
        if let Ok(line) = line {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                messages.push(json);
            }
        }
    }

    Ok(messages)
}

/// Execute a new interactive Claude Code session with streaming output
#[tauri::command]
pub async fn execute_claude_code(
    app: AppHandle,
    project_path: String,
    prompt: String,
    model: String,
) -> Result<(), String> {
    log::info!(
        "Starting new Claude Code session in: {} with model: {}",
        project_path,
        model
    );

    let claude_path = find_claude_binary(&app)?;

    // Map opus-plan to the appropriate Claude CLI parameter
    let claude_model = match model.as_str() {
        "opus-plan" => "opusplan".to_string(),
        _ => model.clone(),
    };

    let args = vec![
        "-p".to_string(),
        prompt.clone(),
        "--model".to_string(),
        claude_model,
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--dangerously-skip-permissions".to_string(),
    ];

    let cmd = create_system_command(&claude_path, args, &project_path);
    spawn_claude_process(app, cmd, prompt, model, project_path).await
}

/// Continue an existing Claude Code conversation with streaming output
#[tauri::command]
pub async fn continue_claude_code(
    app: AppHandle,
    project_path: String,
    prompt: String,
    model: String,
) -> Result<(), String> {
    log::info!(
        "Continuing Claude Code conversation in: {} with model: {}",
        project_path,
        model
    );

    let claude_path = find_claude_binary(&app)?;

    // Map opus-plan to the appropriate Claude CLI parameter
    let claude_model = match model.as_str() {
        "opus-plan" => "opusplan".to_string(),
        _ => model.clone(),
    };

    let args = vec![
        "-c".to_string(), // Continue flag
        "-p".to_string(),
        prompt.clone(),
        "--model".to_string(),
        claude_model,
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--dangerously-skip-permissions".to_string(),
    ];

    let cmd = create_system_command(&claude_path, args, &project_path);
    spawn_claude_process(app, cmd, prompt, model, project_path).await
}

/// Resume an existing Claude Code session by ID with streaming output
#[tauri::command]
pub async fn resume_claude_code(
    app: AppHandle,
    project_path: String,
    session_id: String,
    prompt: String,
    model: String,
) -> Result<(), String> {
    log::info!(
        "Resuming Claude Code session: {} in: {} with model: {}",
        session_id,
        project_path,
        model
    );

    let claude_path = find_claude_binary(&app)?;

    // Map opus-plan to the appropriate Claude CLI parameter
    let claude_model = match model.as_str() {
        "opus-plan" => "opusplan".to_string(),
        _ => model.clone(),
    };

    let args = vec![
        "--resume".to_string(),
        session_id.clone(),
        "-p".to_string(),
        prompt.clone(),
        "--model".to_string(),
        claude_model,
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--dangerously-skip-permissions".to_string(),
    ];

    let cmd = create_system_command(&claude_path, args, &project_path);
    spawn_claude_process(app, cmd, prompt, model, project_path).await
}

/// Cancel the currently running Claude Code execution
#[tauri::command]
pub async fn cancel_claude_execution(
    app: AppHandle,
    session_id: Option<String>,
) -> Result<(), String> {
    log::info!(
        "Cancelling Claude Code execution for session: {:?}",
        session_id
    );

    let mut killed = false;
    let mut attempted_methods = Vec::new();

    // Method 1: Try to find and kill via ProcessRegistry using session ID
    if let Some(sid) = &session_id {
        let registry = app.state::<crate::process::ProcessRegistryState>();
        match registry.0.get_claude_session_by_id(sid) {
            Ok(Some(process_info)) => {
                log::info!(
                    "Found process in registry for session {}: run_id={}, PID={}",
                    sid,
                    process_info.run_id,
                    process_info.pid
                );
                match registry.0.kill_process(process_info.run_id).await {
                    Ok(success) => {
                        if success {
                            log::info!("Successfully killed process via registry");
                            killed = true;
                        } else {
                            log::warn!("Registry kill returned false");
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to kill via registry: {}", e);
                    }
                }
                attempted_methods.push("registry");
            }
            Ok(None) => {
                log::warn!("Session {} not found in ProcessRegistry", sid);
            }
            Err(e) => {
                log::error!("Error querying ProcessRegistry: {}", e);
            }
        }
    }

    // Method 2: Try the legacy approach via ClaudeProcessState
    if !killed {
        let claude_state = app.state::<ClaudeProcessState>();
        let mut current_process = claude_state.current_process.lock().await;

        if let Some(mut child) = current_process.take() {
            // Try to get the PID before killing
            let pid = child.id();
            log::info!(
                "Attempting to kill Claude process via ClaudeProcessState with PID: {:?}",
                pid
            );

            // Kill the process
            match child.kill().await {
                Ok(_) => {
                    log::info!("Successfully killed Claude process via ClaudeProcessState");
                    killed = true;
                }
                Err(e) => {
                    log::error!(
                        "Failed to kill Claude process via ClaudeProcessState: {}",
                        e
                    );

                    // Method 3: If we have a PID, try system kill as last resort
                    if let Some(pid) = pid {
                        log::info!("Attempting system kill as last resort for PID: {}", pid);
                        let kill_result = if cfg!(target_os = "windows") {
                            std::process::Command::new("taskkill")
                                .args(["/F", "/PID", &pid.to_string()])
                                .output()
                        } else {
                            std::process::Command::new("kill")
                                .args(["-KILL", &pid.to_string()])
                                .output()
                        };

                        match kill_result {
                            Ok(output) if output.status.success() => {
                                log::info!("Successfully killed process via system command");
                                killed = true;
                            }
                            Ok(output) => {
                                let stderr = String::from_utf8_lossy(&output.stderr);
                                log::error!("System kill failed: {}", stderr);
                            }
                            Err(e) => {
                                log::error!("Failed to execute system kill command: {}", e);
                            }
                        }
                    }
                }
            }
            attempted_methods.push("claude_state");
        } else {
            log::warn!("No active Claude process in ClaudeProcessState");
        }
    }

    if !killed && attempted_methods.is_empty() {
        log::warn!("No active Claude process found to cancel");
    }

    // Always emit cancellation events for UI consistency
    if let Some(sid) = session_id {
        let _ = app.emit(&format!("claude-cancelled:{}", sid), true);
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        let _ = app.emit(&format!("claude-complete:{}", sid), false);
    }

    // Also emit generic events for backward compatibility
    let _ = app.emit("claude-cancelled", true);
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    let _ = app.emit("claude-complete", false);

    if killed {
        log::info!("Claude process cancellation completed successfully");
    } else if !attempted_methods.is_empty() {
        log::warn!("Claude process cancellation attempted but process may have already exited. Attempted methods: {:?}", attempted_methods);
    }

    Ok(())
}

/// Get all running Claude sessions
#[tauri::command]
pub async fn list_running_claude_sessions(
    registry: tauri::State<'_, crate::process::ProcessRegistryState>,
) -> Result<Vec<crate::process::ProcessInfo>, String> {
    registry.0.get_running_claude_sessions()
}

/// Get live output from a Claude session
#[tauri::command]
pub async fn get_claude_session_output(
    registry: tauri::State<'_, crate::process::ProcessRegistryState>,
    session_id: String,
) -> Result<String, String> {
    // Find the process by session ID
    if let Some(process_info) = registry.0.get_claude_session_by_id(&session_id)? {
        registry.0.get_live_output(process_info.run_id)
    } else {
        Ok(String::new())
    }
}

/// Helper function to spawn Claude process and handle streaming
async fn spawn_claude_process(
    app: AppHandle,
    mut cmd: Command,
    prompt: String,
    model: String,
    project_path: String,
) -> Result<(), String> {
    use std::sync::Mutex;
    use tokio::io::{AsyncBufReadExt, BufReader};

    // Spawn the process
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Claude: {}", e))?;

    // Get stdout and stderr
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

    // Get the child PID for logging
    let pid = child.id().unwrap_or(0);
    log::info!("Spawned Claude process with PID: {:?}", pid);

    // Create readers first (before moving child)
    let stdout_reader = BufReader::new(stdout);
    let stderr_reader = BufReader::new(stderr);

    // We'll extract the session ID from Claude's init message
    let session_id_holder: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let run_id_holder: Arc<Mutex<Option<i64>>> = Arc::new(Mutex::new(None));

    // Store the child process in the global state (for backward compatibility)
    let claude_state = app.state::<ClaudeProcessState>();
    {
        let mut current_process = claude_state.current_process.lock().await;
        // If there's already a process running, kill it first
        if let Some(mut existing_child) = current_process.take() {
            log::warn!("Killing existing Claude process before starting new one");
            let _ = existing_child.kill().await;
        }
        *current_process = Some(child);
    }

    // Spawn tasks to read stdout and stderr
    let app_handle = app.clone();
    let session_id_holder_clone = session_id_holder.clone();
    let run_id_holder_clone = run_id_holder.clone();
    let registry = app.state::<crate::process::ProcessRegistryState>();
    let registry_clone = registry.0.clone();
    let project_path_clone = project_path.clone();
    let prompt_clone = prompt.clone();
    let model_clone = model.clone();
    let stdout_task = tokio::spawn(async move {
        let mut lines = stdout_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            log::debug!("Claude stdout: {}", line);

            // Parse the line to check for init message with session ID
            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) {
                if msg["type"] == "system" && msg["subtype"] == "init" {
                    if let Some(claude_session_id) = msg["session_id"].as_str() {
                        let mut session_id_guard = session_id_holder_clone.lock().unwrap();
                        if session_id_guard.is_none() {
                            *session_id_guard = Some(claude_session_id.to_string());
                            log::info!("Extracted Claude session ID: {}", claude_session_id);

                            // Now register with ProcessRegistry using Claude's session ID
                            match registry_clone.register_claude_session(
                                claude_session_id.to_string(),
                                pid,
                                project_path_clone.clone(),
                                prompt_clone.clone(),
                                model_clone.clone(),
                            ) {
                                Ok(run_id) => {
                                    log::info!("Registered Claude session with run_id: {}", run_id);
                                    let mut run_id_guard = run_id_holder_clone.lock().unwrap();
                                    *run_id_guard = Some(run_id);
                                }
                                Err(e) => {
                                    log::error!("Failed to register Claude session: {}", e);
                                }
                            }
                        }
                    }
                }
            }

            // Store live output in registry if we have a run_id
            if let Some(run_id) = *run_id_holder_clone.lock().unwrap() {
                let _ = registry_clone.append_live_output(run_id, &line);
            }

            // Emit the line to the frontend with session isolation if we have session ID
            if let Some(ref session_id) = *session_id_holder_clone.lock().unwrap() {
                let _ = app_handle.emit(&format!("claude-output:{}", session_id), &line);
            }
            // Also emit to the generic event for backward compatibility
            let _ = app_handle.emit("claude-output", &line);
        }
    });

    let app_handle_stderr = app.clone();
    let session_id_holder_clone2 = session_id_holder.clone();
    let stderr_task = tokio::spawn(async move {
        let mut lines = stderr_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            log::error!("Claude stderr: {}", line);
            // Emit error lines to the frontend with session isolation if we have session ID
            if let Some(ref session_id) = *session_id_holder_clone2.lock().unwrap() {
                let _ = app_handle_stderr.emit(&format!("claude-error:{}", session_id), &line);
            }
            // Also emit to the generic event for backward compatibility
            let _ = app_handle_stderr.emit("claude-error", &line);
        }
    });

    // Wait for the process to complete
    let app_handle_wait = app.clone();
    let claude_state_wait = claude_state.current_process.clone();
    let session_id_holder_clone3 = session_id_holder.clone();
    let run_id_holder_clone2 = run_id_holder.clone();
    let registry_clone2 = registry.0.clone();
    tokio::spawn(async move {
        let _ = stdout_task.await;
        let _ = stderr_task.await;

        // Get the child from the state to wait on it
        let mut current_process = claude_state_wait.lock().await;
        if let Some(mut child) = current_process.take() {
            match child.wait().await {
                Ok(status) => {
                    log::info!("Claude process exited with status: {}", status);
                    // Add a small delay to ensure all messages are processed
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    if let Some(ref session_id) = *session_id_holder_clone3.lock().unwrap() {
                        let _ = app_handle_wait
                            .emit(&format!("claude-complete:{}", session_id), status.success());
                    }
                    // Also emit to the generic event for backward compatibility
                    let _ = app_handle_wait.emit("claude-complete", status.success());
                }
                Err(e) => {
                    log::error!("Failed to wait for Claude process: {}", e);
                    // Add a small delay to ensure all messages are processed
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    if let Some(ref session_id) = *session_id_holder_clone3.lock().unwrap() {
                        let _ =
                            app_handle_wait.emit(&format!("claude-complete:{}", session_id), false);
                    }
                    // Also emit to the generic event for backward compatibility
                    let _ = app_handle_wait.emit("claude-complete", false);
                }
            }
        }

        // Unregister from ProcessRegistry if we have a run_id
        if let Some(run_id) = *run_id_holder_clone2.lock().unwrap() {
            let _ = registry_clone2.unregister_process(run_id);
        }

        // Clear the process from state
        *current_process = None;
    });

    Ok(())
}

/// Lists files and directories in a given path
#[tauri::command]
pub async fn list_directory_contents(directory_path: String) -> Result<Vec<FileEntry>, String> {
    log::info!("Listing directory contents: '{}'", directory_path);

    // Check if path is empty
    if directory_path.trim().is_empty() {
        log::error!("Directory path is empty or whitespace");
        return Err("Directory path cannot be empty".to_string());
    }

    let path = PathBuf::from(&directory_path);
    log::debug!("Resolved path: {:?}", path);

    if !path.exists() {
        log::error!("Path does not exist: {:?}", path);
        return Err(format!("Path does not exist: {}", directory_path));
    }

    if !path.is_dir() {
        log::error!("Path is not a directory: {:?}", path);
        return Err(format!("Path is not a directory: {}", directory_path));
    }

    let mut entries = Vec::new();

    let dir_entries =
        fs::read_dir(&path).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in dir_entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let entry_path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;

        // Skip hidden files/directories unless they are .claude directories
        if let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') && name != ".claude" {
                continue;
            }
        }

        let name = entry_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let extension = if metadata.is_file() {
            entry_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_string())
        } else {
            None
        };

        entries.push(FileEntry {
            name,
            path: entry_path.to_string_lossy().to_string(),
            is_directory: metadata.is_dir(),
            size: metadata.len(),
            extension,
        });
    }

    // Sort: directories first, then files, alphabetically within each group
    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Search for files and directories matching a pattern
#[tauri::command]
pub async fn search_files(base_path: String, query: String) -> Result<Vec<FileEntry>, String> {
    log::info!("Searching files in '{}' for: '{}'", base_path, query);

    // Check if path is empty
    if base_path.trim().is_empty() {
        log::error!("Base path is empty or whitespace");
        return Err("Base path cannot be empty".to_string());
    }

    // Check if query is empty
    if query.trim().is_empty() {
        log::warn!("Search query is empty, returning empty results");
        return Ok(Vec::new());
    }

    let path = PathBuf::from(&base_path);
    log::debug!("Resolved search base path: {:?}", path);

    if !path.exists() {
        log::error!("Base path does not exist: {:?}", path);
        return Err(format!("Path does not exist: {}", base_path));
    }

    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    search_files_recursive(&path, &path, &query_lower, &mut results, 0)?;

    // Sort by relevance: exact matches first, then by name
    results.sort_by(|a, b| {
        let a_exact = a.name.to_lowercase() == query_lower;
        let b_exact = b.name.to_lowercase() == query_lower;

        match (a_exact, b_exact) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    // Limit results to prevent overwhelming the UI
    results.truncate(50);

    Ok(results)
}

fn search_files_recursive(
    current_path: &PathBuf,
    base_path: &PathBuf,
    query: &str,
    results: &mut Vec<FileEntry>,
    depth: usize,
) -> Result<(), String> {
    // Limit recursion depth to prevent excessive searching
    if depth > 5 || results.len() >= 50 {
        return Ok(());
    }

    let entries = fs::read_dir(current_path)
        .map_err(|e| format!("Failed to read directory {:?}: {}", current_path, e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let entry_path = entry.path();

        // Skip hidden files/directories
        if let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                continue;
            }

            // Check if name matches query
            if name.to_lowercase().contains(query) {
                let metadata = entry
                    .metadata()
                    .map_err(|e| format!("Failed to read metadata: {}", e))?;

                let extension = if metadata.is_file() {
                    entry_path
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|e| e.to_string())
                } else {
                    None
                };

                results.push(FileEntry {
                    name: name.to_string(),
                    path: entry_path.to_string_lossy().to_string(),
                    is_directory: metadata.is_dir(),
                    size: metadata.len(),
                    extension,
                });
            }
        }

        // Recurse into directories
        if entry_path.is_dir() {
            // Skip common directories that shouldn't be searched
            if let Some(dir_name) = entry_path.file_name().and_then(|n| n.to_str()) {
                if matches!(
                    dir_name,
                    "node_modules" | "target" | ".git" | "dist" | "build" | ".next" | "__pycache__"
                ) {
                    continue;
                }
            }

            search_files_recursive(&entry_path, base_path, query, results, depth + 1)?;
        }
    }

    Ok(())
}

/// Creates a checkpoint for the current session state
#[tauri::command]
pub async fn create_checkpoint(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
    message_index: Option<usize>,
    description: Option<String>,
) -> Result<crate::checkpoint::CheckpointResult, String> {
    log::info!(
        "Creating checkpoint for session: {} in project: {}",
        session_id,
        project_id
    );

    let manager = app
        .get_or_create_manager(
            session_id.clone(),
            project_id.clone(),
            PathBuf::from(&project_path),
        )
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    // Always load current session messages from the JSONL file
    let session_path = get_claude_dir()
        .map_err(|e| e.to_string())?
        .join("projects")
        .join(&project_id)
        .join(format!("{}.jsonl", session_id));

    if session_path.exists() {
        let file = fs::File::open(&session_path)
            .map_err(|e| format!("Failed to open session file: {}", e))?;
        let reader = BufReader::new(file);

        let mut line_count = 0;
        for line in reader.lines() {
            if let Some(index) = message_index {
                if line_count > index {
                    break;
                }
            }
            if let Ok(line) = line {
                manager
                    .track_message(line)
                    .await
                    .map_err(|e| format!("Failed to track message: {}", e))?;
            }
            line_count += 1;
        }
    }

    manager
        .create_checkpoint(description, None)
        .await
        .map_err(|e| format!("Failed to create checkpoint: {}", e))
}

/// Restores a session to a specific checkpoint
#[tauri::command]
pub async fn restore_checkpoint(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    checkpoint_id: String,
    session_id: String,
    project_id: String,
    project_path: String,
) -> Result<crate::checkpoint::CheckpointResult, String> {
    log::info!(
        "Restoring checkpoint: {} for session: {}",
        checkpoint_id,
        session_id
    );

    let manager = app
        .get_or_create_manager(
            session_id.clone(),
            project_id.clone(),
            PathBuf::from(&project_path),
        )
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    let result = manager
        .restore_checkpoint(&checkpoint_id)
        .await
        .map_err(|e| format!("Failed to restore checkpoint: {}", e))?;

    // Update the session JSONL file with restored messages
    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let session_path = claude_dir
        .join("projects")
        .join(&result.checkpoint.project_id)
        .join(format!("{}.jsonl", session_id));

    // The manager has already restored the messages internally,
    // but we need to update the actual session file
    let (_, _, messages) = manager
        .storage
        .load_checkpoint(&result.checkpoint.project_id, &session_id, &checkpoint_id)
        .map_err(|e| format!("Failed to load checkpoint data: {}", e))?;

    fs::write(&session_path, messages)
        .map_err(|e| format!("Failed to update session file: {}", e))?;

    Ok(result)
}

/// Lists all checkpoints for a session
#[tauri::command]
pub async fn list_checkpoints(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
) -> Result<Vec<crate::checkpoint::Checkpoint>, String> {
    log::info!(
        "Listing checkpoints for session: {} in project: {}",
        session_id,
        project_id
    );

    let manager = app
        .get_or_create_manager(session_id, project_id, PathBuf::from(&project_path))
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    Ok(manager.list_checkpoints().await)
}

/// Forks a new timeline branch from a checkpoint
#[tauri::command]
pub async fn fork_from_checkpoint(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    checkpoint_id: String,
    session_id: String,
    project_id: String,
    project_path: String,
    new_session_id: String,
    description: Option<String>,
) -> Result<crate::checkpoint::CheckpointResult, String> {
    log::info!(
        "Forking from checkpoint: {} to new session: {}",
        checkpoint_id,
        new_session_id
    );

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;

    // First, copy the session file to the new session
    let source_session_path = claude_dir
        .join("projects")
        .join(&project_id)
        .join(format!("{}.jsonl", session_id));
    let new_session_path = claude_dir
        .join("projects")
        .join(&project_id)
        .join(format!("{}.jsonl", new_session_id));

    if source_session_path.exists() {
        fs::copy(&source_session_path, &new_session_path)
            .map_err(|e| format!("Failed to copy session file: {}", e))?;
    }

    // Create manager for the new session
    let manager = app
        .get_or_create_manager(
            new_session_id.clone(),
            project_id,
            PathBuf::from(&project_path),
        )
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    manager
        .fork_from_checkpoint(&checkpoint_id, description)
        .await
        .map_err(|e| format!("Failed to fork checkpoint: {}", e))
}

/// Gets the timeline for a session
#[tauri::command]
pub async fn get_session_timeline(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
) -> Result<crate::checkpoint::SessionTimeline, String> {
    log::info!(
        "Getting timeline for session: {} in project: {}",
        session_id,
        project_id
    );

    let manager = app
        .get_or_create_manager(session_id, project_id, PathBuf::from(&project_path))
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    Ok(manager.get_timeline().await)
}

/// Updates checkpoint settings for a session
#[tauri::command]
pub async fn update_checkpoint_settings(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
    auto_checkpoint_enabled: bool,
    checkpoint_strategy: String,
) -> Result<(), String> {
    use crate::checkpoint::CheckpointStrategy;

    log::info!("Updating checkpoint settings for session: {}", session_id);

    let strategy = match checkpoint_strategy.as_str() {
        "manual" => CheckpointStrategy::Manual,
        "per_prompt" => CheckpointStrategy::PerPrompt,
        "per_tool_use" => CheckpointStrategy::PerToolUse,
        "smart" => CheckpointStrategy::Smart,
        _ => {
            return Err(format!(
                "Invalid checkpoint strategy: {}",
                checkpoint_strategy
            ))
        }
    };

    let manager = app
        .get_or_create_manager(session_id, project_id, PathBuf::from(&project_path))
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    manager
        .update_settings(auto_checkpoint_enabled, strategy)
        .await
        .map_err(|e| format!("Failed to update settings: {}", e))
}

/// Gets diff between two checkpoints
#[tauri::command]
pub async fn get_checkpoint_diff(
    from_checkpoint_id: String,
    to_checkpoint_id: String,
    session_id: String,
    project_id: String,
) -> Result<crate::checkpoint::CheckpointDiff, String> {
    use crate::checkpoint::storage::CheckpointStorage;

    log::info!(
        "Getting diff between checkpoints: {} -> {}",
        from_checkpoint_id,
        to_checkpoint_id
    );

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let storage = CheckpointStorage::new(claude_dir);

    // Load both checkpoints
    let (from_checkpoint, from_files, _) = storage
        .load_checkpoint(&project_id, &session_id, &from_checkpoint_id)
        .map_err(|e| format!("Failed to load source checkpoint: {}", e))?;
    let (to_checkpoint, to_files, _) = storage
        .load_checkpoint(&project_id, &session_id, &to_checkpoint_id)
        .map_err(|e| format!("Failed to load target checkpoint: {}", e))?;

    // Build file maps
    let mut from_map: std::collections::HashMap<PathBuf, &crate::checkpoint::FileSnapshot> =
        std::collections::HashMap::new();
    for file in &from_files {
        from_map.insert(file.file_path.clone(), file);
    }

    let mut to_map: std::collections::HashMap<PathBuf, &crate::checkpoint::FileSnapshot> =
        std::collections::HashMap::new();
    for file in &to_files {
        to_map.insert(file.file_path.clone(), file);
    }

    // Calculate differences
    let mut modified_files = Vec::new();
    let mut added_files = Vec::new();
    let mut deleted_files = Vec::new();

    // Check for modified and deleted files
    for (path, from_file) in &from_map {
        if let Some(to_file) = to_map.get(path) {
            if from_file.hash != to_file.hash {
                // File was modified
                let additions = to_file.content.lines().count();
                let deletions = from_file.content.lines().count();

                modified_files.push(crate::checkpoint::FileDiff {
                    path: path.clone(),
                    additions,
                    deletions,
                    diff_content: None, // TODO: Generate actual diff
                });
            }
        } else {
            // File was deleted
            deleted_files.push(path.clone());
        }
    }

    // Check for added files
    for (path, _) in &to_map {
        if !from_map.contains_key(path) {
            added_files.push(path.clone());
        }
    }

    // Calculate token delta
    let token_delta = (to_checkpoint.metadata.total_tokens as i64)
        - (from_checkpoint.metadata.total_tokens as i64);

    Ok(crate::checkpoint::CheckpointDiff {
        from_checkpoint_id,
        to_checkpoint_id,
        modified_files,
        added_files,
        deleted_files,
        token_delta,
    })
}

/// Tracks a message for checkpointing
#[tauri::command]
pub async fn track_checkpoint_message(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
    message: String,
) -> Result<(), String> {
    log::info!("Tracking message for session: {}", session_id);

    let manager = app
        .get_or_create_manager(session_id, project_id, PathBuf::from(project_path))
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    manager
        .track_message(message)
        .await
        .map_err(|e| format!("Failed to track message: {}", e))
}

/// Checks if auto-checkpoint should be triggered
#[tauri::command]
pub async fn check_auto_checkpoint(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
    message: String,
) -> Result<bool, String> {
    log::info!("Checking auto-checkpoint for session: {}", session_id);

    let manager = app
        .get_or_create_manager(session_id.clone(), project_id, PathBuf::from(project_path))
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    Ok(manager.should_auto_checkpoint(&message).await)
}

/// Triggers cleanup of old checkpoints
#[tauri::command]
pub async fn cleanup_old_checkpoints(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
    keep_count: usize,
) -> Result<usize, String> {
    log::info!(
        "Cleaning up old checkpoints for session: {}, keeping {}",
        session_id,
        keep_count
    );

    let manager = app
        .get_or_create_manager(
            session_id.clone(),
            project_id.clone(),
            PathBuf::from(project_path),
        )
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    manager
        .storage
        .cleanup_old_checkpoints(&project_id, &session_id, keep_count)
        .map_err(|e| format!("Failed to cleanup checkpoints: {}", e))
}

/// Gets checkpoint settings for a session
#[tauri::command]
pub async fn get_checkpoint_settings(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
) -> Result<serde_json::Value, String> {
    log::info!("Getting checkpoint settings for session: {}", session_id);

    let manager = app
        .get_or_create_manager(session_id, project_id, PathBuf::from(project_path))
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    let timeline = manager.get_timeline().await;

    Ok(serde_json::json!({
        "auto_checkpoint_enabled": timeline.auto_checkpoint_enabled,
        "checkpoint_strategy": timeline.checkpoint_strategy,
        "total_checkpoints": timeline.total_checkpoints,
        "current_checkpoint_id": timeline.current_checkpoint_id,
    }))
}

/// Clears checkpoint manager for a session (cleanup on session end)
#[tauri::command]
pub async fn clear_checkpoint_manager(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
) -> Result<(), String> {
    log::info!("Clearing checkpoint manager for session: {}", session_id);

    app.remove_manager(&session_id).await;
    Ok(())
}

/// Gets checkpoint state statistics (for debugging/monitoring)
#[tauri::command]
pub async fn get_checkpoint_state_stats(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
) -> Result<serde_json::Value, String> {
    let active_count = app.active_count().await;
    let active_sessions = app.list_active_sessions().await;

    Ok(serde_json::json!({
        "active_managers": active_count,
        "active_sessions": active_sessions,
    }))
}

/// Gets files modified in the last N minutes for a session
#[tauri::command]
pub async fn get_recently_modified_files(
    app: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
    minutes: i64,
) -> Result<Vec<String>, String> {
    use chrono::{Duration, Utc};

    log::info!(
        "Getting files modified in the last {} minutes for session: {}",
        minutes,
        session_id
    );

    let manager = app
        .get_or_create_manager(session_id, project_id, PathBuf::from(project_path))
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    let since = Utc::now() - Duration::minutes(minutes);
    let modified_files = manager.get_files_modified_since(since).await;

    // Also log the last modification time
    if let Some(last_mod) = manager.get_last_modification_time().await {
        log::info!("Last file modification was at: {}", last_mod);
    }

    Ok(modified_files
        .into_iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect())
}

/// Track session messages from the frontend for checkpointing
#[tauri::command]
pub async fn track_session_messages(
    state: tauri::State<'_, crate::checkpoint::state::CheckpointState>,
    session_id: String,
    project_id: String,
    project_path: String,
    messages: Vec<String>,
) -> Result<(), String> {
    log::info!(
        "Tracking {} messages for session {}",
        messages.len(),
        session_id
    );

    let manager = state
        .get_or_create_manager(
            session_id.clone(),
            project_id.clone(),
            PathBuf::from(&project_path),
        )
        .await
        .map_err(|e| format!("Failed to get checkpoint manager: {}", e))?;

    for message in messages {
        manager
            .track_message(message)
            .await
            .map_err(|e| format!("Failed to track message: {}", e))?;
    }

    Ok(())
}

/// Gets hooks configuration from settings at specified scope
#[tauri::command]
pub async fn get_hooks_config(
    scope: String,
    project_path: Option<String>,
) -> Result<serde_json::Value, String> {
    log::info!(
        "Getting hooks config for scope: {}, project: {:?}",
        scope,
        project_path
    );

    let settings_path = match scope.as_str() {
        "user" => get_claude_dir()
            .map_err(|e| e.to_string())?
            .join("settings.json"),
        "project" => {
            let path = project_path.ok_or("Project path required for project scope")?;
            PathBuf::from(path).join(".claude").join("settings.json")
        }
        "local" => {
            let path = project_path.ok_or("Project path required for local scope")?;
            PathBuf::from(path)
                .join(".claude")
                .join("settings.local.json")
        }
        _ => return Err("Invalid scope".to_string()),
    };

    if !settings_path.exists() {
        log::info!(
            "Settings file does not exist at {:?}, returning empty hooks",
            settings_path
        );
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;

    let settings: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {}", e))?;

    Ok(settings
        .get("hooks")
        .cloned()
        .unwrap_or(serde_json::json!({})))
}

/// Updates hooks configuration in settings at specified scope
#[tauri::command]
pub async fn update_hooks_config(
    scope: String,
    hooks: serde_json::Value,
    project_path: Option<String>,
) -> Result<String, String> {
    log::info!(
        "Updating hooks config for scope: {}, project: {:?}",
        scope,
        project_path
    );

    let settings_path = match scope.as_str() {
        "user" => get_claude_dir()
            .map_err(|e| e.to_string())?
            .join("settings.json"),
        "project" => {
            let path = project_path.ok_or("Project path required for project scope")?;
            let claude_dir = PathBuf::from(path).join(".claude");
            fs::create_dir_all(&claude_dir)
                .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
            claude_dir.join("settings.json")
        }
        "local" => {
            let path = project_path.ok_or("Project path required for local scope")?;
            let claude_dir = PathBuf::from(path).join(".claude");
            fs::create_dir_all(&claude_dir)
                .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
            claude_dir.join("settings.local.json")
        }
        _ => return Err("Invalid scope".to_string()),
    };

    // Read existing settings or create new
    let mut settings = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {}", e))?
    } else {
        serde_json::json!({})
    };

    // Update hooks section
    settings["hooks"] = hooks;

    // Write back with pretty formatting
    let json_string = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, json_string)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok("Hooks configuration updated successfully".to_string())
}

/// Validates a hook command by dry-running it
#[tauri::command]
pub async fn validate_hook_command(command: String) -> Result<serde_json::Value, String> {
    log::info!("Validating hook command syntax");

    // Validate syntax without executing
    let mut cmd = std::process::Command::new("bash");
    cmd.arg("-n") // Syntax check only
        .arg("-c")
        .arg(&command);

    match cmd.output() {
        Ok(output) => {
            if output.status.success() {
                Ok(serde_json::json!({
                    "valid": true,
                    "message": "Command syntax is valid"
                }))
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Ok(serde_json::json!({
                    "valid": false,
                    "message": format!("Syntax error: {}", stderr)
                }))
            }
        }
        Err(e) => Err(format!("Failed to validate command: {}", e)),
    }
}
