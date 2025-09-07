use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use log::{debug, error, info};
use std::net::TcpStream;
use std::time::Duration;
use once_cell::sync::Lazy;
use std::sync::Mutex;

// 全局变量存储找到的 CCR 路径
static CCR_PATH: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CcrServiceStatus {
    pub is_running: bool,
    pub port: Option<u16>,
    pub endpoint: Option<String>,
    pub has_ccr_binary: bool,
    pub ccr_version: Option<String>,
    pub process_id: Option<u32>,
    pub raw_output: Option<String>, // 添加原始输出用于调试
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CcrServiceInfo {
    pub status: CcrServiceStatus,
    pub message: String,
}

/// 获取可能的 CCR 路径列表
fn get_possible_ccr_paths() -> Vec<String> {
    let mut paths = vec!["ccr".to_string()]; // PATH 中的 ccr
    
    // 获取用户主目录
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_default();
    
    #[cfg(target_os = "macos")]
    {
        // macOS 特定路径
        paths.extend(vec![
            "/usr/local/bin/ccr".to_string(),
            "/opt/homebrew/bin/ccr".to_string(),
            format!("{}/.nvm/versions/node/*/bin/ccr", home), // 通配符路径需要特殊处理
            "/usr/local/lib/node_modules/.bin/ccr".to_string(),
            "/opt/homebrew/lib/node_modules/.bin/ccr".to_string(),
        ]);
    }
    
    #[cfg(target_os = "windows")]
    {
        // Windows 特定路径
        let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
        let program_files_x86 = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".to_string());
        let appdata = std::env::var("APPDATA").unwrap_or_else(|_| format!("{}\\AppData\\Roaming", home));
        
        paths.extend(vec![
            "ccr.exe".to_string(),
            "ccr.cmd".to_string(),
            format!("{}\\npm\\ccr.cmd", appdata),
            format!("{}\\npm\\ccr.exe", appdata),
            format!("{}\\nodejs\\ccr.cmd", program_files),
            format!("{}\\nodejs\\ccr.exe", program_files),
            format!("{}\\nodejs\\ccr.cmd", program_files_x86),
            format!("{}\\nodejs\\ccr.exe", program_files_x86),
            format!("{}\\AppData\\Roaming\\npm\\ccr.cmd", home),
            format!("{}\\AppData\\Roaming\\npm\\ccr.exe", home),
        ]);
    }
    
    #[cfg(target_os = "linux")]
    {
        // Linux 特定路径
        paths.extend(vec![
            "/usr/bin/ccr".to_string(),
            "/usr/local/bin/ccr".to_string(),
            format!("{}/.local/bin/ccr", home),
            format!("{}/.npm-global/bin/ccr", home),
            "/usr/lib/node_modules/.bin/ccr".to_string(),
        ]);
    }
    
    paths
}

/// 查找实际的 CCR 路径
fn find_ccr_path() -> Option<String> {
    // 先检查缓存
    if let Ok(cached) = CCR_PATH.lock() {
        if cached.is_some() {
            return cached.clone();
        }
    }
    
    let possible_paths = get_possible_ccr_paths();
    
    for path in &possible_paths {
        // 处理通配符路径 (仅限 Unix-like 系统)
        if path.contains('*') {
            #[cfg(not(target_os = "windows"))]
            {
                if let Ok(entries) = glob::glob(path) {
                    for entry in entries.flatten() {
                        let path_str = entry.to_string_lossy().to_string();
                        if test_ccr_command(&path_str) {
                            if let Ok(mut cached) = CCR_PATH.lock() {
                                *cached = Some(path_str.clone());
                            }
                            info!("Found ccr at: {}", path_str);
                            return Some(path_str);
                        }
                    }
                }
            }
        } else if test_ccr_command(path) {
            if let Ok(mut cached) = CCR_PATH.lock() {
                *cached = Some(path.clone());
            }
            info!("Found ccr at: {}", path);
            return Some(path.clone());
        }
    }
    
    None
}

/// 测试给定路径的 CCR 命令是否可用
fn test_ccr_command(path: &str) -> bool {
    let output = Command::new(path)
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();
    
    matches!(output, Ok(result) if result.status.success())
}
/// 检查 CCR 是否已安装
#[tauri::command]
pub async fn check_ccr_installation() -> Result<bool, String> {
    Ok(find_ccr_path().is_some())
}

/// 获取 CCR 版本信息
#[tauri::command]
pub async fn get_ccr_version() -> Result<String, String> {
    let ccr_path = find_ccr_path().ok_or("CCR not found")?;
    
    // 尝试多个版本命令参数
    let version_args = vec!["--version", "-v", "version"];
    
    for arg in version_args {
        let output = Command::new(&ccr_path)
            .arg(arg)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output();
        
        if let Ok(result) = output {
            if result.status.success() {
                let version = String::from_utf8_lossy(&result.stdout);
                let trimmed = version.trim().to_string();
                if !trimmed.is_empty() {
                    return Ok(trimmed);
                }
            }
        }
    }
    
    Err("Unable to get CCR version".to_string())
}

/// 检查 CCR 服务状态
#[tauri::command]
pub async fn get_ccr_service_status() -> Result<CcrServiceStatus, String> {
    // 首先检查 ccr 二进制是否存在
    let has_ccr_binary = check_ccr_installation().await.unwrap_or(false);
    
    if !has_ccr_binary {
        info!("CCR binary not found in PATH");
        return Ok(CcrServiceStatus {
            is_running: false,
            port: None,
            endpoint: None,
            has_ccr_binary: false,
            ccr_version: None,
            process_id: None,
            raw_output: None,
        });
    }

    // 获取版本信息
    let ccr_version = get_ccr_version().await.ok();
    debug!("CCR version: {:?}", ccr_version);
    
    // 获取 CCR 路径
    let ccr_path = find_ccr_path().ok_or("CCR not found")?;

    // 检查服务状态 - 设置环境变量和工作目录
    let mut cmd = Command::new(&ccr_path);
    cmd.arg("status")
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());
    
    // 继承环境变量
    cmd.env_clear();
    for (key, value) in std::env::vars() {
        cmd.env(key, value);
    }
    
    info!("Executing ccr status command");
    let output = cmd.output();
    
    let output = match output {
        Ok(o) => o,
        Err(e) => {
            error!("Failed to execute ccr status: {}", e);
            return Ok(CcrServiceStatus {
                is_running: false,
                port: None,
                endpoint: None,
                has_ccr_binary: true,
                ccr_version,
                process_id: None,
                raw_output: None,
            });
        }
    };
    
    let status_output = String::from_utf8_lossy(&output.stdout);
    let stderr_output = String::from_utf8_lossy(&output.stderr);
    
    info!("CCR status command exit code: {:?}", output.status.code());
    info!("CCR status stdout length: {}", status_output.len());
    info!("CCR status stdout: {}", status_output);
    info!("CCR status stderr: {}", stderr_output);
    
    // 检查状态 - 明确检测运行和停止状态
    let is_running = if status_output.contains("❌") || status_output.contains("Status: Not Running") {
        // 明确显示未运行
        false
    } else if status_output.contains("✅") || status_output.contains("Status: Running") {
        // 明确显示运行中
        true
    } else if status_output.contains("Process ID:") && status_output.contains("Port:") {
        // 包含进程ID和端口信息，可能在运行
        true
    } else {
        // 默认认为未运行
        false
    };
    
    info!("CCR service running detection - is_running: {}", is_running);
    
    // 尝试从输出中提取端口、端点和进程ID信息
    let mut port = None;
    let mut endpoint = None;
    let mut process_id = None;
    
    if is_running {
        // 提取端口信息 - 支持多种格式
        for line in status_output.lines() {
            info!("Parsing line for port: {}", line);
            
            // 检查是否包含端口信息
            if line.contains("Port:") || line.contains("port:") || line.contains("端口:") || line.contains("🌐") {
                // 查找数字
                let numbers: String = line.chars()
                    .skip_while(|c| !c.is_numeric())
                    .take_while(|c| c.is_numeric())
                    .collect();
                
                if !numbers.is_empty() {
                    if let Ok(port_num) = numbers.parse::<u16>() {
                        port = Some(port_num);
                        info!("Successfully extracted port: {}", port_num);
                        break;
                    }
                }
            }
        }
        
        // 提取API端点信息 - 支持多种格式
        for line in status_output.lines() {
            info!("Parsing line for endpoint: {}", line);
            if line.contains("API Endpoint:") || line.contains("Endpoint:") || 
               line.contains("http://") || line.contains("https://") || line.contains("📡") {
                // 尝试提取URL
                if let Some(start) = line.find("http") {
                    let url_part = &line[start..];
                    // 找到URL的结束位置（空格或行尾）
                    let end = url_part.find(char::is_whitespace).unwrap_or(url_part.len());
                    let url = &url_part[..end];
                    if url.contains(":") && (url.contains("localhost") || url.contains("127.0.0.1")) {
                        endpoint = Some(url.to_string());
                        info!("Successfully extracted endpoint: {}", url);
                        break;
                    }
                }
            }
        }
        
        // 提取进程ID信息 - 支持多种格式
        for line in status_output.lines() {
            info!("Parsing line for PID: {}", line);
            if line.contains("Process ID:") || line.contains("PID:") || line.contains("pid:") || line.contains("🆔") {
                // 查找数字
                let numbers: String = line.chars()
                    .skip_while(|c| !c.is_numeric())
                    .take_while(|c| c.is_numeric())
                    .collect();
                
                if !numbers.is_empty() {
                    if let Ok(pid_num) = numbers.parse::<u32>() {
                        process_id = Some(pid_num);
                        info!("Successfully extracted PID: {}", pid_num);
                        break;
                    }
                }
            }
        }
        
        // 如果没有找到具体信息，使用默认值
        if port.is_none() {
            port = Some(3456);
            debug!("Using default port: 3456");
        }
        if endpoint.is_none() {
            let port_num = port.unwrap_or(3456);
            endpoint = Some(format!("http://localhost:{}", port_num));
            debug!("Using default endpoint: {:?}", endpoint);
        }
    }

    // 如果命令失败或无法确定状态，尝试通过端口检查
    if !is_running {
        info!("Status command didn't detect running service, checking port 3456...");
        // 尝试连接默认端口
        match TcpStream::connect_timeout(&"127.0.0.1:3456".parse().unwrap(), Duration::from_secs(1)) {
            Ok(_) => {
                info!("Port 3456 is open, service appears to be running");
                return Ok(CcrServiceStatus {
                    is_running: true,
                    port: Some(3456),
                    endpoint: Some("http://127.0.0.1:3456".to_string()),
                    has_ccr_binary: true,
                    ccr_version,
                    process_id: None,
                    raw_output: Some(status_output.to_string()),
                });
            }
            Err(e) => {
                info!("Port 3456 check failed: {}", e);
            }
        }
    }
    
    Ok(CcrServiceStatus {
        is_running,
        port,
        endpoint,
        has_ccr_binary,
        ccr_version,
        process_id,
        raw_output: Some(status_output.to_string()),
    })
}

/// 启动 CCR 服务
#[tauri::command]
pub async fn start_ccr_service() -> Result<CcrServiceInfo, String> {
    // 先检查是否已安装
    if !check_ccr_installation().await.unwrap_or(false) {
        return Err("CCR is not installed. Please install claude-code-router first.".to_string());
    }

    // 获取 CCR 路径
    let ccr_path = find_ccr_path().ok_or("CCR not found")?;

    // 检查当前状态
    let current_status = get_ccr_service_status().await?;
    if current_status.is_running {
        return Ok(CcrServiceInfo {
            status: current_status,
            message: "CCR service is already running".to_string(),
        });
    }

    // 启动服务
    let _output = Command::new(&ccr_path)
        .arg("start")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start ccr service: {}", e))?;

    // 等待一下让服务启动
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    // 再次检查状态
    let new_status = get_ccr_service_status().await?;
    
    if new_status.is_running {
        Ok(CcrServiceInfo {
            status: new_status,
            message: "CCR service started successfully".to_string(),
        })
    } else {
        Err("Failed to start CCR service".to_string())
    }
}

/// 停止 CCR 服务
#[tauri::command]
pub async fn stop_ccr_service() -> Result<CcrServiceInfo, String> {
    if !check_ccr_installation().await.unwrap_or(false) {
        return Err("CCR is not installed".to_string());
    }

    // 获取 CCR 路径
    let ccr_path = find_ccr_path().ok_or("CCR not found")?;

    let output = Command::new(&ccr_path)
        .arg("stop")
        .output()
        .map_err(|e| format!("Failed to stop ccr service: {}", e))?;

    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to stop CCR service: {}", error));
    }

    // 检查新状态
    let new_status = get_ccr_service_status().await?;
    
    Ok(CcrServiceInfo {
        status: new_status,
        message: "CCR service stopped successfully".to_string(),
    })
}

/// 重启 CCR 服务
#[tauri::command]
pub async fn restart_ccr_service() -> Result<CcrServiceInfo, String> {
    if !check_ccr_installation().await.unwrap_or(false) {
        return Err("CCR is not installed".to_string());
    }

    // 获取 CCR 路径
    let ccr_path = find_ccr_path().ok_or("CCR not found")?;

    let output = Command::new(&ccr_path)
        .arg("restart")
        .output()
        .map_err(|e| format!("Failed to restart ccr service: {}", e))?;

    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to restart CCR service: {}", error));
    }

    // 等待服务重启
    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

    // 检查新状态
    let new_status = get_ccr_service_status().await?;
    
    Ok(CcrServiceInfo {
        status: new_status,
        message: "CCR service restarted successfully".to_string(),
    })
}

/// 打开 CCR UI
#[tauri::command]
pub async fn open_ccr_ui() -> Result<String, String> {
    if !check_ccr_installation().await.unwrap_or(false) {
        return Err("CCR is not installed".to_string());
    }

    // 检查服务状态
    let status = get_ccr_service_status().await?;
    if !status.is_running {
        // 如果服务未运行，尝试启动
        let _start_result = start_ccr_service().await?;
        // 再等待一下
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }

    // 获取 CCR 路径
    let ccr_path = find_ccr_path().ok_or("CCR not found")?;

    // 执行 ccr ui 命令
    let _output = Command::new(&ccr_path)
        .arg("ui")
        .spawn()
        .map_err(|e| format!("Failed to open ccr ui: {}", e))?;

    Ok("CCR UI opening...".to_string())
}

/// 获取 CCR 配置路径
#[tauri::command]
pub async fn get_ccr_config_path() -> Result<String, String> {
    let home_dir = dirs::home_dir()
        .ok_or("Could not find home directory")?;
    
    let config_path = home_dir
        .join(".claude-code-router")
        .join("config.json");
    
    Ok(config_path.to_string_lossy().to_string())
}