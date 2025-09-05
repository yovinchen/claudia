use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use log::{debug, error, info};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CcrServiceStatus {
    pub is_running: bool,
    pub port: Option<u16>,
    pub endpoint: Option<String>,
    pub has_ccr_binary: bool,
    pub ccr_version: Option<String>,
    pub process_id: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CcrServiceInfo {
    pub status: CcrServiceStatus,
    pub message: String,
}

/// 检查 CCR 是否已安装
#[tauri::command]
pub async fn check_ccr_installation() -> Result<bool, String> {
    // 直接尝试执行 ccr --version 命令来检测是否安装
    // 这比使用 which 命令更可靠，特别是在打包后的应用中
    let output = Command::new("ccr")
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();
    
    match output {
        Ok(result) => Ok(result.status.success()),
        Err(e) => {
            // 如果命令执行失败，可能是因为 ccr 未安装或不在 PATH 中
            debug!("CCR installation check failed: {}", e);
            Ok(false)
        }
    }
}

/// 获取 CCR 版本信息
#[tauri::command]
pub async fn get_ccr_version() -> Result<String, String> {
    // 尝试多个版本命令参数
    let version_args = vec!["--version", "-v", "version"];
    
    for arg in version_args {
        let output = Command::new("ccr")
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
        });
    }

    // 获取版本信息
    let ccr_version = get_ccr_version().await.ok();
    debug!("CCR version: {:?}", ccr_version);

    // 检查服务状态
    let output = Command::new("ccr")
        .arg("status")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();
    
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
            });
        }
    };
    
    let status_output = String::from_utf8_lossy(&output.stdout);
    let stderr_output = String::from_utf8_lossy(&output.stderr);
    
    debug!("CCR status stdout: {}", status_output);
    debug!("CCR status stderr: {}", stderr_output);
    
    // 更宽松的运行状态检测
    let is_running = output.status.success() && 
        (status_output.contains("Running") || 
         status_output.contains("running") ||
         status_output.contains("✅") ||
         status_output.contains("Port:"));
    
    // 尝试从输出中提取端口、端点和进程ID信息
    let mut port = None;
    let mut endpoint = None;
    let mut process_id = None;
    
    if is_running {
        // 提取端口信息 - 支持多种格式
        for line in status_output.lines() {
            if line.contains("Port:") || line.contains("port:") {
                // 尝试提取端口号
                if let Some(port_str) = line.split(':').last() {
                    // 清理字符串，只保留数字
                    let cleaned: String = port_str.chars()
                        .filter(|c| c.is_numeric())
                        .collect();
                    if let Ok(port_num) = cleaned.parse::<u16>() {
                        port = Some(port_num);
                        break;
                    }
                }
            }
        }
        
        // 提取API端点信息 - 支持多种格式
        for line in status_output.lines() {
            if line.contains("API Endpoint:") || line.contains("Endpoint:") || line.contains("http://") || line.contains("https://") {
                // 尝试提取URL
                if let Some(start) = line.find("http") {
                    let url_part = &line[start..];
                    // 找到URL的结束位置（空格或行尾）
                    let end = url_part.find(char::is_whitespace).unwrap_or(url_part.len());
                    let url = &url_part[..end];
                    if url.contains(":") && (url.contains("localhost") || url.contains("127.0.0.1")) {
                        endpoint = Some(url.to_string());
                        break;
                    }
                }
            }
        }
        
        // 提取进程ID信息 - 支持多种格式
        for line in status_output.lines() {
            if line.contains("Process ID:") || line.contains("PID:") || line.contains("pid:") {
                // 尝试提取PID
                if let Some(pid_str) = line.split(':').last() {
                    // 清理字符串，只保留数字
                    let cleaned: String = pid_str.chars()
                        .filter(|c| c.is_numeric())
                        .collect();
                    if let Ok(pid_num) = cleaned.parse::<u32>() {
                        process_id = Some(pid_num);
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

    Ok(CcrServiceStatus {
        is_running,
        port,
        endpoint,
        has_ccr_binary,
        ccr_version,
        process_id,
    })
}

/// 启动 CCR 服务
#[tauri::command]
pub async fn start_ccr_service() -> Result<CcrServiceInfo, String> {
    // 先检查是否已安装
    if !check_ccr_installation().await.unwrap_or(false) {
        return Err("CCR is not installed. Please install claude-code-router first.".to_string());
    }

    // 检查当前状态
    let current_status = get_ccr_service_status().await?;
    if current_status.is_running {
        return Ok(CcrServiceInfo {
            status: current_status,
            message: "CCR service is already running".to_string(),
        });
    }

    // 启动服务
    let _output = Command::new("ccr")
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

    let output = Command::new("ccr")
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

    let output = Command::new("ccr")
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

    // 执行 ccr ui 命令
    let _output = Command::new("ccr")
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