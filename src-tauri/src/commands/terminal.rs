use std::collections::HashMap;
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use uuid::Uuid;
use anyhow::Result;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSession {
    pub id: String,
    pub working_directory: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub is_active: bool,
}

/// Terminal child process wrapper
pub struct TerminalChild {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
}

/// State for managing terminal sessions
pub type TerminalState = Arc<Mutex<HashMap<String, (TerminalSession, Option<TerminalChild>)>>>;

/// Creates a new terminal session using PTY
#[tauri::command]
pub async fn create_terminal_session(
    working_directory: String,
    app_handle: AppHandle,
    terminal_state: State<'_, TerminalState>,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();
    
    log::info!("Creating terminal session: {} in {}", session_id, working_directory);
    
    // Check if working directory exists
    if !std::path::Path::new(&working_directory).exists() {
        return Err(format!("Working directory does not exist: {}", working_directory));
    }
    
    let session = TerminalSession {
        id: session_id.clone(),
        working_directory: working_directory.clone(),
        created_at: chrono::Utc::now(),
        is_active: true,
    };
    
    // Create PTY system
    let pty_system = native_pty_system();
    
    // Create PTY pair with size
    let pty_pair = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| format!("Failed to create PTY: {}", e))?;
    
    // Get shell command
    let shell = get_default_shell();
    let mut cmd = CommandBuilder::new(&shell);
    
    // Set as login interactive shell
    if shell.contains("bash") || shell.contains("zsh") {
        cmd.arg("-il"); // Interactive login shell
    } else if shell.contains("fish") {
        cmd.arg("-il");
    }
    
    // Set working directory
    cmd.cwd(working_directory.clone());
    
    // Set environment variables
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    
    // Spawn the shell process
    let _child = pty_pair.slave.spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;
    
    // Get writer for stdin
    let writer = pty_pair.master.take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;
    
    // Start reading output in background
    let session_id_clone = session_id.clone();
    let app_handle_clone = app_handle.clone();
    let mut reader = pty_pair.master.try_clone_reader()
        .map_err(|e| format!("Failed to get PTY reader: {}", e))?;
    
    // Spawn reader thread
    std::thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                    let _ = app_handle_clone.emit(&format!("terminal-output:{}", session_id_clone), &data);
                }
                Err(e) => {
                    log::error!("Error reading PTY output: {}", e);
                    break;
                }
            }
        }
        log::debug!("PTY reader thread finished for session: {}", session_id_clone);
    });
    
    // Store the session with PTY writer
    let terminal_child = TerminalChild {
        writer: Arc::new(Mutex::new(writer)),
    };
    
    {
        let mut state = terminal_state.lock().await;
        state.insert(session_id.clone(), (session, Some(terminal_child)));
    }
    
    log::info!("Terminal session created successfully: {}", session_id);
    Ok(session_id)
}

/// Sends input to a terminal session
#[tauri::command]
pub async fn send_terminal_input(
    session_id: String,
    input: String,
    terminal_state: State<'_, TerminalState>,
) -> Result<(), String> {
    let state = terminal_state.lock().await;
    
    if let Some((_session, child_opt)) = state.get(&session_id) {
        if let Some(child) = child_opt {
            log::debug!("Sending input to terminal {}: {:?}", session_id, input);
            
            // Write to PTY
            let mut writer = child.writer.lock().await;
            writer.write_all(input.as_bytes())
                .map_err(|e| format!("Failed to write to terminal: {}", e))?;
            writer.flush()
                .map_err(|e| format!("Failed to flush terminal input: {}", e))?;
            return Ok(());
        }
    }
    
    Err(format!("Terminal session not found or not active: {}", session_id))
}

/// Closes a terminal session
#[tauri::command]
pub async fn close_terminal_session(
    session_id: String,
    terminal_state: State<'_, TerminalState>,
) -> Result<(), String> {
    let mut state = terminal_state.lock().await;
    
    if let Some((mut session, _child)) = state.remove(&session_id) {
        session.is_active = false;
        // PTY and child process will be dropped automatically
        
        log::info!("Closed terminal session: {}", session_id);
        Ok(())
    } else {
        Err(format!("Terminal session not found: {}", session_id))
    }
}

/// Lists all active terminal sessions
#[tauri::command]
pub async fn list_terminal_sessions(
    terminal_state: State<'_, TerminalState>,
) -> Result<Vec<String>, String> {
    let state = terminal_state.lock().await;
    
    let sessions: Vec<String> = state.iter()
        .filter_map(|(id, (session, _))| {
            if session.is_active {
                Some(id.clone())
            } else {
                None
            }
        })
        .collect();
    
    Ok(sessions)
}

/// Resizes a terminal session
#[tauri::command]
pub async fn resize_terminal(
    session_id: String,
    _cols: u16,
    _rows: u16,
    _terminal_state: State<'_, TerminalState>,
) -> Result<(), String> {
    // Note: With the current architecture, resize is not supported
    // To support resize, we would need to keep a reference to the PTY master
    // or use a different approach
    log::warn!("Terminal resize not currently supported for session: {}", session_id);
    Ok(())
}

/// Cleanup orphaned terminal sessions
#[tauri::command]
pub async fn cleanup_terminal_sessions(
    terminal_state: State<'_, TerminalState>,
) -> Result<u32, String> {
    let mut state = terminal_state.lock().await;
    let mut cleaned_up = 0;
    
    let mut to_remove = Vec::new();
    
    for (id, (session, _child)) in state.iter() {
        if !session.is_active {
            to_remove.push(id.clone());
            cleaned_up += 1;
        }
    }
    
    // Remove the sessions
    for id in to_remove {
        state.remove(&id);
    }
    
    if cleaned_up > 0 {
        log::info!("Cleaned up {} orphaned terminal sessions", cleaned_up);
    }
    
    Ok(cleaned_up)
}

/// Get the default shell for the current platform
fn get_default_shell() -> String {
    if cfg!(target_os = "windows") {
        // Try PowerShell first, fallback to cmd
        if std::process::Command::new("pwsh").arg("--version").output().is_ok() {
            "pwsh".to_string()
        } else if std::process::Command::new("powershell").arg("-Version").output().is_ok() {
            "powershell".to_string()
        } else {
            "cmd".to_string()
        }
    } else {
        // Unix-like systems: try zsh, bash, then sh
        std::env::var("SHELL").unwrap_or_else(|_| {
            if std::path::Path::new("/bin/zsh").exists() {
                "/bin/zsh".to_string()
            } else if std::path::Path::new("/bin/bash").exists() {
                "/bin/bash".to_string()
            } else {
                "/bin/sh".to_string()
            }
        })
    }
}