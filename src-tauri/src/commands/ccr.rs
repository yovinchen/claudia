use log::{debug, error, info};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::net::TcpStream;
use std::process::Stdio;
use std::sync::Mutex;
use std::time::Duration;

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

/// 获取候选可执行名
fn candidate_binaries() -> Vec<&'static str> {
    // 覆盖常见发布名与别名
    vec![
        "ccr",
        "claude-code-router",
        // Windows 扩展
        "ccr.exe",
        "ccr.cmd",
        "claude-code-router.exe",
        "claude-code-router.cmd",
        // Node 安装中的可能文件名
        "ccr.js",
        "ccr.mjs",
        "claude-code-router.js",
        "claude-code-router.mjs",
    ]
}

/// 获取可能的 CCR 路径列表
fn get_possible_ccr_paths() -> Vec<String> {
    let mut paths: Vec<String> = Vec::new();
    // PATH 中的候选名（稍后用 PATH 遍历拼接，这里仅保留可直接执行名）
    paths.extend(candidate_binaries().into_iter().map(|s| s.to_string()));

    // 获取用户主目录
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();

    #[cfg(target_os = "macos")]
    {
        // macOS 特定路径
        // 常见全局 bin 目录
        for bin in ["ccr", "claude-code-router"] {
            paths.push(format!("/usr/local/bin/{}", bin));
            paths.push(format!("/opt/homebrew/bin/{}", bin));
        }
        // NVM 全局安装的二进制（通配）
        for bin in ["ccr", "claude-code-router"] {
            paths.push(format!("{}/.nvm/versions/node/*/bin/{}", home, bin));
        }
        // 全局 node_modules/.bin
        for bin in ["ccr", "claude-code-router"] {
            paths.push(format!("/usr/local/lib/node_modules/.bin/{}", bin));
            paths.push(format!("/opt/homebrew/lib/node_modules/.bin/{}", bin));
        }

        // 添加常见的 Node.js 版本路径
        for version in &["v16", "v18", "v20", "v21", "v22"] {
            paths.push(format!("{}/.nvm/versions/node/{}.*/bin/ccr", home, version));
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Windows 特定路径
        let program_files =
            std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
        let program_files_x86 = std::env::var("ProgramFiles(x86)")
            .unwrap_or_else(|_| "C:\\Program Files (x86)".to_string());
        let appdata =
            std::env::var("APPDATA").unwrap_or_else(|_| format!("{}\\AppData\\Roaming", home));

        for bin in [
            "ccr.exe",
            "ccr.cmd",
            "claude-code-router.exe",
            "claude-code-router.cmd",
        ] {
            paths.push(bin.to_string());
            paths.push(format!("{}\\npm\\{}", appdata, bin));
            paths.push(format!("{}\\nodejs\\{}", program_files, bin));
            paths.push(format!("{}\\nodejs\\{}", program_files_x86, bin));
            paths.push(format!("{}\\AppData\\Roaming\\npm\\{}", home, bin));
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Linux 特定路径
        for bin in ["ccr", "claude-code-router"] {
            paths.push(format!("/usr/bin/{}", bin));
            paths.push(format!("/usr/local/bin/{}", bin));
            paths.push(format!("{}/.local/bin/{}", home, bin));
            paths.push(format!("{}/.npm-global/bin/{}", home, bin));
            paths.push(format!("/usr/lib/node_modules/.bin/{}", bin));
        }
    }

    paths
}

/// 获取扩展的 PATH 环境变量
fn get_extended_path() -> String {
    let mut extended_path = std::env::var("PATH").unwrap_or_default();
    let separator = if cfg!(target_os = "windows") {
        ";"
    } else {
        ":"
    };

    // 添加常见的额外路径
    let additional_paths = if cfg!(target_os = "macos") {
        vec![
            "/usr/local/bin",
            "/opt/homebrew/bin",
            "/opt/homebrew/sbin",
            // Node.js 相关路径
            "/usr/local/lib/node_modules/.bin",
            "/opt/homebrew/lib/node_modules/.bin",
        ]
    } else if cfg!(target_os = "windows") {
        vec![]
    } else {
        vec!["/usr/local/bin", "/opt/bin"]
    };

    // 添加用户特定路径
    if let Ok(home) = std::env::var("HOME") {
        let user_paths = if cfg!(target_os = "macos") {
            // 动态发现 Node 版本管理工具的 bin 目录
            let mut list = vec![
                format!("{}/.local/bin", home),
                format!("{}/.cargo/bin", home),
            ];
            // nvm: ~/.nvm/versions/node/*/bin
            let nvm_versions_root = format!("{}/.nvm/versions/node", home);
            if let Ok(entries) = std::fs::read_dir(&nvm_versions_root) {
                for entry in entries.flatten() {
                    let p = entry.path().join("bin");
                    if p.exists() {
                        if let Some(s) = p.to_str() {
                            list.push(s.to_string());
                        }
                    }
                }
            }
            // volta
            list.push(format!("{}/.volta/bin", home));
            // asdf
            let asdf_installs = format!("{}/.asdf/installs/nodejs", home);
            if let Ok(entries) = std::fs::read_dir(&asdf_installs) {
                for entry in entries.flatten() {
                    let p = entry.path().join("bin");
                    if p.exists() {
                        if let Some(s) = p.to_str() {
                            list.push(s.to_string());
                        }
                    }
                }
            }
            list.push(format!("{}/.asdf/shims", home));
            // fnm
            let fnm_versions = format!("{}/.fnm/node-versions", home);
            if let Ok(entries) = std::fs::read_dir(&fnm_versions) {
                for entry in entries.flatten() {
                    let p = entry.path().join("installation").join("bin");
                    if p.exists() {
                        if let Some(s) = p.to_str() {
                            list.push(s.to_string());
                        }
                    }
                }
            }
            list
        } else if cfg!(target_os = "windows") {
            if let Ok(appdata) = std::env::var("APPDATA") {
                vec![format!("{}\\npm", appdata)]
            } else {
                vec![]
            }
        } else {
            vec![
                format!("{}/.local/bin", home),
                format!("{}/.npm-global/bin", home),
            ]
        };

        for path in user_paths {
            if std::path::Path::new(&path).exists() && !extended_path.contains(&path) {
                extended_path.push_str(separator);
                extended_path.push_str(&path);
            }
        }
    }

    // 添加系统额外路径
    for path in additional_paths {
        if std::path::Path::new(path).exists() && !extended_path.contains(path) {
            extended_path.push_str(separator);
            extended_path.push_str(path);
        }
    }

    extended_path
}

/// 通过 shell 查找 CCR
fn find_ccr_via_shell() -> Option<String> {
    // 尝试通过 shell 获取 ccr 路径
    let shell_cmd = if cfg!(target_os = "windows") {
        "where ccr claude-code-router"
    } else {
        "command -v ccr || which ccr || command -v claude-code-router || which claude-code-router"
    };

    let shell = if cfg!(target_os = "windows") {
        "cmd"
    } else {
        "sh"
    };

    let shell_args = if cfg!(target_os = "windows") {
        vec!["/C", shell_cmd]
    } else {
        vec!["-c", shell_cmd]
    };

    if let Ok(output) = crate::utils::process::std_command(shell)
        .args(&shell_args)
        .env("PATH", get_extended_path())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            if !path.is_empty() && test_ccr_command(&path) {
                info!("Found ccr via shell: {}", path);
                return Some(path);
            }
        }
    }

    // 如果标准方法失败，尝试加载用户的 shell 配置
    if !cfg!(target_os = "windows") {
        let home = std::env::var("HOME").ok()?;
        let shell_configs = vec![
            format!("{}/.bashrc", home),
            format!("{}/.zshrc", home),
            format!("{}/.profile", home),
        ];

        for config in shell_configs {
            if std::path::Path::new(&config).exists() {
                let cmd = format!(
                    "source {} && (command -v ccr || command -v claude-code-router)",
                    config
                );
                if let Ok(output) = crate::utils::process::std_command("sh")
                    .args(&["-c", &cmd])
                    .env("PATH", get_extended_path())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .output()
                {
                    if output.status.success() {
                        let path = String::from_utf8_lossy(&output.stdout)
                            .lines()
                            .next()
                            .unwrap_or("")
                            .trim()
                            .to_string();
                        if !path.is_empty() && test_ccr_command(&path) {
                            info!("Found ccr via shell config {}: {}", config, path);
                            return Some(path);
                        }
                    }
                }
            }
        }
    }

    None
}

/// 查找实际的 CCR 路径
fn find_ccr_path() -> Option<String> {
    // 先检查缓存
    if let Ok(cached) = CCR_PATH.lock() {
        if cached.is_some() {
            return cached.clone();
        }
    }

    // 硬编码检查最常见的路径（针对打包应用的特殊处理）
    let home = std::env::var("HOME").unwrap_or_default();
    let mut hardcoded_paths: Vec<String> = Vec::new();
    for bin in ["ccr", "claude-code-router"] {
        hardcoded_paths.push(format!("/usr/local/bin/{}", bin));
        hardcoded_paths.push(format!("/opt/homebrew/bin/{}", bin));
    }

    // 动态添加 NVM 路径
    let nvm_base = format!("{}/.nvm/versions/node", home);
    if std::path::Path::new(&nvm_base).exists() {
        if let Ok(entries) = std::fs::read_dir(&nvm_base) {
            for entry in entries.flatten() {
                if let Ok(name) = entry.file_name().into_string() {
                    if name.starts_with('v') {
                        for bin in ["ccr", "claude-code-router"] {
                            let ccr_path = format!("{}/{}/bin/{}", nvm_base, name, bin);
                            hardcoded_paths.push(ccr_path);
                        }
                    }
                }
            }
        }
    }

    info!("Checking hardcoded paths: {:?}", hardcoded_paths);

    for path in &hardcoded_paths {
        if std::path::Path::new(path).exists() {
            // 对于打包应用，存在即认为可用，不进行执行测试
            info!("Found ccr at hardcoded path: {}", path);
            if let Ok(mut cached) = CCR_PATH.lock() {
                *cached = Some(path.to_string());
            }
            return Some(path.to_string());
        }
    }

    // 获取扩展的 PATH
    let extended_path = get_extended_path();

    // 首先尝试通过 shell 查找（最可靠）
    if let Some(path) = find_ccr_via_shell() {
        if let Ok(mut cached) = CCR_PATH.lock() {
            *cached = Some(path.clone());
        }
        return Some(path);
    }

    // 然后尝试使用带有扩展 PATH 的 which/command -v 命令
    for name in ["ccr", "claude-code-router"] {
        if let Ok(output) = crate::utils::process::std_command("sh")
            .env("PATH", &extended_path)
            .arg("-c")
            .arg(format!("command -v {} || which {}", name, name))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
        {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if !path.is_empty() && test_ccr_command(&path) {
                    info!("Found {} using shell which: {}", name, path);
                    if let Ok(mut cached) = CCR_PATH.lock() {
                        *cached = Some(path.clone());
                    }
                    return Some(path);
                }
            }
        }
    }

    // 然后检查扩展后的 PATH
    let separator = if cfg!(target_os = "windows") {
        ";"
    } else {
        ":"
    };
    for path_dir in extended_path.split(separator) {
        for name in candidate_binaries() {
            let candidate = if cfg!(target_os = "windows") {
                format!("{}\\{}", path_dir, name)
            } else {
                format!("{}/{}", path_dir, name)
            };
            if test_ccr_command(&candidate) {
                info!("Found CCR in PATH: {}", candidate);
                if let Ok(mut cached) = CCR_PATH.lock() {
                    *cached = Some(candidate.clone());
                }
                return Some(candidate);
            }
        }
    }

    // 最后尝试预定义的路径列表
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

    error!(
        "CCR not found in any location. Original PATH: {:?}",
        std::env::var("PATH")
    );
    error!("Extended PATH: {}", extended_path);
    error!("Searched paths: {:?}", possible_paths);
    None
}

/// 测试给定路径的 CCR 命令是否可用
fn test_ccr_command(path: &str) -> bool {
    // 首先检查文件是否存在
    let path_obj = std::path::Path::new(path);
    if !path_obj.exists() {
        debug!("CCR path does not exist: {}", path);
        return false;
    }

    // 如果是符号链接，解析真实路径
    let real_path = if path_obj.is_symlink() {
        match std::fs::read_link(path) {
            Ok(target) => {
                // 如果是相对路径，需要基于符号链接的目录来解析
                if target.is_relative() {
                    if let Some(parent) = path_obj.parent() {
                        parent.join(target).to_string_lossy().to_string()
                    } else {
                        target.to_string_lossy().to_string()
                    }
                } else {
                    target.to_string_lossy().to_string()
                }
            }
            Err(e) => {
                debug!("Failed to read symlink {}: {}", path, e);
                return false;
            }
        }
    } else {
        path.to_string()
    };

    debug!(
        "Testing CCR command at: {} (real path: {})",
        path, real_path
    );

    // 如果是 .js 文件，使用 node 来执行
    if real_path.ends_with(".js") {
        let output = crate::utils::process::std_command("node")
            .arg(&real_path)
            .arg("version")
            .env("PATH", get_extended_path())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output();

        match output {
            Ok(result) => {
                let success = result.status.success();
                if !success {
                    let stderr = String::from_utf8_lossy(&result.stderr);
                    debug!("CCR command (via node) failed at {}: {}", real_path, stderr);
                }
                success
            }
            Err(e) => {
                debug!("Failed to execute CCR via node at {}: {}", real_path, e);
                false
            }
        }
    } else {
        // 直接执行，尝试多种版本参数
        for arg in ["version", "-v", "--version"] {
            let output = crate::utils::process::std_command(path)
                .arg(arg)
                .env("PATH", get_extended_path())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output();

            match output {
                Ok(result) => {
                    if result.status.success() {
                        return true;
                    }
                }
                Err(_) => {
                    // 尝试下一个参数
                }
            }
        }
        debug!("CCR command did not respond to version flags at {}", path);
        false
    }
}
/// 检查 CCR 是否已安装
#[tauri::command]
pub async fn check_ccr_installation() -> Result<bool, String> {
    let path = find_ccr_path();
    info!("CCR installation check result: {:?}", path);
    Ok(path.is_some())
}

/// 获取 CCR 版本信息
#[tauri::command]
pub async fn get_ccr_version() -> Result<String, String> {
    let ccr_path = find_ccr_path().ok_or("CCR not found")?;

    // 尝试多个版本命令参数
    let version_args = vec!["--version", "-v", "version"];

    for arg in version_args {
        let output = if ccr_path.contains("node_modules") || ccr_path.contains(".nvm") {
            crate::utils::process::std_command("sh")
                .arg("-c")
                .arg(format!("{} {}", ccr_path, arg))
                .env("PATH", get_extended_path())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
        } else {
            crate::utils::process::std_command(&ccr_path)
                .arg(arg)
                .env("PATH", get_extended_path())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
        };

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
        let original_path = std::env::var("PATH").unwrap_or_else(|_| "PATH not found".to_string());
        let extended_path = get_extended_path();

        // 动态扫描多个 Node 版本管理器目录以进行诊断
        let home = std::env::var("HOME").unwrap_or_default();
        let mut scan_dirs: Vec<String> = Vec::new();
        // nvm
        let nvm_versions_root = format!("{}/.nvm/versions/node", home);
        if let Ok(entries) = std::fs::read_dir(&nvm_versions_root) {
            for entry in entries.flatten() {
                let p = entry.path().join("bin");
                if p.exists() {
                    if let Some(s) = p.to_str() {
                        scan_dirs.push(s.to_string());
                    }
                }
            }
        }
        // volta
        scan_dirs.push(format!("{}/.volta/bin", home));
        // asdf
        scan_dirs.push(format!("{}/.asdf/shims", home));
        let asdf_installs = format!("{}/.asdf/installs/nodejs", home);
        if let Ok(entries) = std::fs::read_dir(&asdf_installs) {
            for entry in entries.flatten() {
                let p = entry.path().join("bin");
                if p.exists() {
                    if let Some(s) = p.to_str() {
                        scan_dirs.push(s.to_string());
                    }
                }
            }
        }
        // fnm
        let fnm_versions = format!("{}/.fnm/node-versions", home);
        if let Ok(entries) = std::fs::read_dir(&fnm_versions) {
            for entry in entries.flatten() {
                let p = entry.path().join("installation").join("bin");
                if p.exists() {
                    if let Some(s) = p.to_str() {
                        scan_dirs.push(s.to_string());
                    }
                }
            }
        }

        // 查找候选可执行
        let mut found_candidates: Vec<String> = Vec::new();
        for dir in &scan_dirs {
            for name in ["ccr", "claude-code-router"] {
                let p = format!("{}/{}", dir, name);
                if std::path::Path::new(&p).exists() {
                    found_candidates.push(p);
                }
            }
        }

        // 直接尝试第一个候选
        let direct_test = if let Some(first) = found_candidates.first() {
            match crate::utils::process::std_command(first)
                .arg("-v")
                .env("PATH", get_extended_path())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
            {
                Ok(output) => {
                    if output.status.success() {
                        let version = String::from_utf8_lossy(&output.stdout);
                        format!("Direct execution SUCCESS: {}", version.trim())
                    } else {
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        format!("Direct execution FAILED: {}", stderr.trim())
                    }
                }
                Err(e) => format!("Direct execution ERROR: {}", e),
            }
        } else {
            "No candidate binary found in Node manager dirs".to_string()
        };

        // 为诊断展示每个扫描目录里的相关二进制
        let mut scan_summary: Vec<String> = Vec::new();
        for dir in &scan_dirs {
            if std::path::Path::new(dir).exists() {
                match std::fs::read_dir(dir) {
                    Ok(entries) => {
                        let files: Vec<String> = entries
                            .filter_map(|e| e.ok())
                            .filter_map(|e| e.file_name().to_str().map(|s| s.to_string()))
                            .filter(|name| {
                                name.contains("ccr") || name.contains("claude-code-router")
                            })
                            .collect();
                        if !files.is_empty() {
                            scan_summary.push(format!("{} -> {:?}", dir, files));
                        }
                    }
                    Err(_) => {}
                }
            }
        }

        let debug_info = format!(
            "CCR not found.\n\
            Original PATH: {}\n\
            Extended PATH: {}\n\
            Candidates in Node manager dirs: {:?}\n\
            Direct test: {}\n\
            Scan details: {}",
            original_path,
            extended_path,
            found_candidates,
            direct_test,
            scan_summary.join("; ")
        );

        return Ok(CcrServiceStatus {
            is_running: false,
            port: None,
            endpoint: None,
            has_ccr_binary: false,
            ccr_version: None,
            process_id: None,
            raw_output: Some(debug_info),
        });
    }

    // 获取版本信息
    let ccr_version = get_ccr_version().await.ok();
    debug!("CCR version: {:?}", ccr_version);

    // 获取 CCR 路径
    let ccr_path = find_ccr_path().ok_or("CCR not found")?;

    // 检查服务状态
    let mut cmd = if ccr_path.contains("node_modules") || ccr_path.contains(".nvm") {
        // 如果是 Node.js 安装的路径，可能需要使用 node 来执行
        let mut c = crate::utils::process::std_command("sh");
        c.arg("-c")
            .arg(format!("{} status", ccr_path))
            .env("PATH", get_extended_path())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        c
    } else {
        let mut c = crate::utils::process::std_command(&ccr_path);
        c.arg("status")
            .env("PATH", get_extended_path())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        c
    };

    info!("Executing ccr status command at path: {}", ccr_path);
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
    let is_running =
        if status_output.contains("❌") || status_output.contains("Status: Not Running") {
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
            if line.contains("Port:")
                || line.contains("port:")
                || line.contains("端口:")
                || line.contains("🌐")
            {
                // 查找数字
                let numbers: String = line
                    .chars()
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
            if line.contains("API Endpoint:")
                || line.contains("Endpoint:")
                || line.contains("http://")
                || line.contains("https://")
                || line.contains("📡")
            {
                // 尝试提取URL
                if let Some(start) = line.find("http") {
                    let url_part = &line[start..];
                    // 找到URL的结束位置（空格或行尾）
                    let end = url_part.find(char::is_whitespace).unwrap_or(url_part.len());
                    let url = &url_part[..end];
                    if url.contains(":") && (url.contains("localhost") || url.contains("127.0.0.1"))
                    {
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
            if line.contains("Process ID:")
                || line.contains("PID:")
                || line.contains("pid:")
                || line.contains("🆔")
            {
                // 查找数字
                let numbers: String = line
                    .chars()
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
        match TcpStream::connect_timeout(&"127.0.0.1:3456".parse().unwrap(), Duration::from_secs(1))
        {
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
    let _output = crate::utils::process::std_command(&ccr_path)
        .arg("start")
        .env("PATH", get_extended_path())
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

    let output = crate::utils::process::std_command(&ccr_path)
        .arg("stop")
        .env("PATH", get_extended_path())
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

    let output = crate::utils::process::std_command(&ccr_path)
        .arg("restart")
        .env("PATH", get_extended_path())
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
    let _output = crate::utils::process::std_command(&ccr_path)
        .arg("ui")
        .env("PATH", get_extended_path())
        .spawn()
        .map_err(|e| format!("Failed to open ccr ui: {}", e))?;

    Ok("CCR UI opening...".to_string())
}

/// 获取 CCR 配置路径
#[tauri::command]
pub async fn get_ccr_config_path() -> Result<String, String> {
    let home_dir = dirs::home_dir().ok_or("Could not find home directory")?;

    let config_path = home_dir.join(".claude-code-router").join("config.json");

    Ok(config_path.to_string_lossy().to_string())
}
