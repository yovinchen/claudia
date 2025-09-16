use anyhow::Result;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
/// Shared module for detecting Claude Code binary installations
/// Supports NVM installations, aliased paths, and version-based selection
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

/// Type of Claude installation
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum InstallationType {
    /// System-installed binary
    System,
    /// Custom path specified by user
    Custom,
}

/// Represents a Claude installation with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeInstallation {
    /// Full path to the Claude binary
    pub path: String,
    /// Version string if available
    pub version: Option<String>,
    /// Source of discovery (e.g., "nvm", "system", "homebrew", "which")
    pub source: String,
    /// Type of installation
    pub installation_type: InstallationType,
}

/// Main function to find the Claude binary
/// Checks database first for stored path and preference, then prioritizes accordingly
pub fn find_claude_binary(app_handle: &tauri::AppHandle) -> Result<String, String> {
    info!("Searching for claude binary...");

    // First check if we have a stored path and preference in the database
    if let Ok(app_data_dir) = app_handle.path().app_data_dir() {
        let db_path = app_data_dir.join("agents.db");
        if db_path.exists() {
            if let Ok(conn) = rusqlite::Connection::open(&db_path) {
                // Check for stored path first
                if let Ok(stored_path) = conn.query_row(
                    "SELECT value FROM app_settings WHERE key = 'claude_binary_path'",
                    [],
                    |row| row.get::<_, String>(0),
                ) {
                    info!("Found stored claude path in database: {}", stored_path);

                    // Check if the path still exists and works
                    #[cfg(not(target_os = "windows"))]
                    let final_path = stored_path.clone();
                    #[cfg(not(target_os = "windows"))]
                    let path_buf = PathBuf::from(&stored_path);

                    #[cfg(target_os = "windows")]
                    let mut final_path = stored_path.clone();
                    #[cfg(target_os = "windows")]
                    let mut path_buf = PathBuf::from(&stored_path);

                    // On Windows, if stored path exists but is not executable (shell script), try .cmd version
                    #[cfg(target_os = "windows")]
                    if path_buf.exists() && !stored_path.ends_with(".cmd") && !stored_path.ends_with(".exe") {
                        // Test if the current path works by trying to get version
                        if let Err(_) = get_claude_version(&stored_path) {
                            // If it fails, try the .cmd version
                            let cmd_path = format!("{}.cmd", stored_path);
                            let cmd_path_buf = PathBuf::from(&cmd_path);
                            if cmd_path_buf.exists() {
                                if let Ok(_) = get_claude_version(&cmd_path) {
                                    final_path = cmd_path;
                                    path_buf = cmd_path_buf;
                                    info!("Using .cmd version instead of shell script: {}", final_path);
                                }
                            }
                        }
                    }

                    if path_buf.exists() && path_buf.is_file() {
                        return Ok(final_path);
                    } else {
                        warn!("Stored claude path no longer exists: {}", stored_path);
                    }
                }

                // Check user preference
                let preference = conn.query_row(
                    "SELECT value FROM app_settings WHERE key = 'claude_installation_preference'",
                    [],
                    |row| row.get::<_, String>(0),
                ).unwrap_or_else(|_| "system".to_string());

                info!("User preference for Claude installation: {}", preference);
            }
        }
    }

    // Discover all available system installations
    let installations = discover_system_installations();

    if installations.is_empty() {
        error!("Could not find claude binary in any location");
        return Err("Claude Code not found. Please ensure it's installed in one of these locations: PATH, /usr/local/bin, /opt/homebrew/bin, ~/.nvm/versions/node/*/bin, ~/.claude/local, ~/.local/bin".to_string());
    }

    // Log all found installations
    for installation in &installations {
        info!("Found Claude installation: {:?}", installation);
    }

    // Select the best installation (highest version)
    if let Some(best) = select_best_installation(installations) {
        info!(
            "Selected Claude installation: path={}, version={:?}, source={}",
            best.path, best.version, best.source
        );
        Ok(best.path)
    } else {
        Err("No valid Claude installation found".to_string())
    }
}

/// Discovers all available Claude installations and returns them for selection
/// This allows UI to show a version selector
pub fn discover_claude_installations() -> Vec<ClaudeInstallation> {
    info!("Discovering all Claude installations...");

    let mut installations = discover_system_installations();

    // Sort by version (highest first), then by source preference
    installations.sort_by(|a, b| {
        match (&a.version, &b.version) {
            (Some(v1), Some(v2)) => {
                // Compare versions in descending order (newest first)
                match compare_versions(v2, v1) {
                    Ordering::Equal => {
                        // If versions are equal, prefer by source
                        source_preference(a).cmp(&source_preference(b))
                    }
                    other => other,
                }
            }
            (Some(_), None) => Ordering::Less, // Version comes before no version
            (None, Some(_)) => Ordering::Greater,
            (None, None) => source_preference(a).cmp(&source_preference(b)),
        }
    });

    installations
}

/// Returns a preference score for installation sources (lower is better)
fn source_preference(installation: &ClaudeInstallation) -> u8 {
    match installation.source.as_str() {
        "which" => 1,
        "homebrew" => 2,
        "system" => 3,
        source if source.starts_with("nvm") => 4,
        "local-bin" => 5,
        "claude-local" => 6,
        "npm-global" => 7,
        "yarn" | "yarn-global" => 8,
        "bun" => 9,
        "node-modules" => 10,
        "home-bin" => 11,
        "PATH" => 12,
        _ => 13,
    }
}

/// Discovers all Claude installations on the system
fn discover_system_installations() -> Vec<ClaudeInstallation> {
    let mut installations = Vec::new();

    // 1. Try system command first (now works in production and can return multiple installations)
    installations.extend(find_which_installations());

    // 2. Check NVM paths
    installations.extend(find_nvm_installations());

    // 3. Check standard paths
    installations.extend(find_standard_installations());

    // Remove duplicates by path
    let mut unique_paths = std::collections::HashSet::new();
    installations.retain(|install| unique_paths.insert(install.path.clone()));

    installations
}

/// Try using the command to find Claude installations
/// Returns multiple installations if found (Windows 'where' can return multiple paths)
fn find_which_installations() -> Vec<ClaudeInstallation> {
    debug!("Trying to find claude binary...");

    // Use 'where' on Windows, 'which' on Unix
    #[cfg(target_os = "windows")]
    let command_name = "where";
    #[cfg(not(target_os = "windows"))]
    let command_name = "which";

    let mut installations = Vec::new();

    // Create command with enhanced PATH for production environments
    let mut cmd = Command::new(command_name);
    cmd.arg("claude");
    
    // In production (DMG), we need to ensure proper PATH is set
    let enhanced_path = build_enhanced_path();
    debug!("Using enhanced PATH for {}: {}", command_name, enhanced_path);
    cmd.env("PATH", enhanced_path);

    match cmd.output() {
        Ok(output) if output.status.success() => {
            let output_str = String::from_utf8_lossy(&output.stdout).trim().to_string();

            if output_str.is_empty() {
                return installations;
            }

            // Process each line (Windows 'where' can return multiple paths)
            for line in output_str.lines() {
                let mut path = line.trim().to_string();

                if path.is_empty() {
                    continue;
                }

                // Parse aliased output: "claude: aliased to /path/to/claude"
                if path.starts_with("claude:") && path.contains("aliased to") {
                    if let Some(aliased_path) = path.split("aliased to").nth(1) {
                        path = aliased_path.trim().to_string();
                    } else {
                        continue;
                    }
                }

                // Convert Unix-style path to Windows path if needed
                #[cfg(target_os = "windows")]
                let path = {
                    if path.starts_with("/c/") {
                        // Convert /c/path to C:\path
                        let windows_path = path.replace("/c/", "C:\\").replace("/", "\\");
                        windows_path
                    } else if path.starts_with("/") && path.len() > 3 && path.chars().nth(2) == Some('/') {
                        // Convert /X/path to X:\path where X is drive letter
                        let drive = path.chars().nth(1).unwrap();
                        let rest = &path[3..];
                        format!("{}:\\{}", drive.to_uppercase(), rest.replace("/", "\\"))
                    } else {
                        path
                    }
                };

                #[cfg(not(target_os = "windows"))]
                let path = path;

                debug!("'{}' found claude at: {}", command_name, path);

                // On Windows, prefer .cmd files over shell scripts
                #[cfg(target_os = "windows")]
                let final_path = {
                    if !path.ends_with(".cmd") && !path.ends_with(".exe") {
                        // Check if there's a .cmd file alongside
                        let cmd_path = format!("{}.cmd", path);
                        if PathBuf::from(&cmd_path).exists() {
                            // Only use .cmd if the original doesn't work
                            if let Err(_) = get_claude_version(&path) {
                                cmd_path
                            } else {
                                path
                            }
                        } else {
                            path
                        }
                    } else {
                        path
                    }
                };

                #[cfg(not(target_os = "windows"))]
                let final_path = path;

                // Verify the path exists
                if !PathBuf::from(&final_path).exists() {
                    warn!("Path from '{}' does not exist: {}", command_name, final_path);
                    continue;
                }

                // Get version
                let version = get_claude_version(&final_path).ok().flatten();

                installations.push(ClaudeInstallation {
                    path: final_path,
                    version,
                    source: command_name.to_string(),
                    installation_type: InstallationType::System,
                });
            }
        }
        _ => {}
    }

    installations
}

/// Find Claude installations in NVM directories
fn find_nvm_installations() -> Vec<ClaudeInstallation> {
    let mut installations = Vec::new();

    if let Ok(home) = std::env::var("HOME") {
        let nvm_dir = PathBuf::from(&home)
            .join(".nvm")
            .join("versions")
            .join("node");

        debug!("Checking NVM directory: {:?}", nvm_dir);

        if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
            for entry in entries.flatten() {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    let claude_path = entry.path().join("bin").join("claude");

                    if claude_path.exists() && claude_path.is_file() {
                        let path_str = claude_path.to_string_lossy().to_string();
                        let node_version = entry.file_name().to_string_lossy().to_string();

                        debug!("Found Claude in NVM node {}: {}", node_version, path_str);

                        // Get Claude version
                        let version = get_claude_version(&path_str).ok().flatten();

                        installations.push(ClaudeInstallation {
                            path: path_str,
                            version,
                            source: format!("nvm ({})", node_version),
                            installation_type: InstallationType::System,
                        });
                    }
                }
            }
        }
    }

    installations
}

/// Check standard installation paths
fn find_standard_installations() -> Vec<ClaudeInstallation> {
    let mut installations = Vec::new();

    // Common installation paths for claude
    let mut paths_to_check: Vec<(String, String)> = vec![
        ("/usr/local/bin/claude".to_string(), "system".to_string()),
        (
            "/opt/homebrew/bin/claude".to_string(),
            "homebrew".to_string(),
        ),
        ("/usr/bin/claude".to_string(), "system".to_string()),
        ("/bin/claude".to_string(), "system".to_string()),
    ];

    // Also check user-specific paths
    if let Ok(home) = std::env::var("HOME") {
        paths_to_check.extend(vec![
            (
                format!("{}/.claude/local/claude", home),
                "claude-local".to_string(),
            ),
            (
                format!("{}/.local/bin/claude", home),
                "local-bin".to_string(),
            ),
            (
                format!("{}/.npm-global/bin/claude", home),
                "npm-global".to_string(),
            ),
            (format!("{}/.yarn/bin/claude", home), "yarn".to_string()),
            (format!("{}/.bun/bin/claude", home), "bun".to_string()),
            (format!("{}/bin/claude", home), "home-bin".to_string()),
            // Check common node_modules locations
            (
                format!("{}/node_modules/.bin/claude", home),
                "node-modules".to_string(),
            ),
            (
                format!("{}/.config/yarn/global/node_modules/.bin/claude", home),
                "yarn-global".to_string(),
            ),
        ]);
    }

    // Check each path
    for (path, source) in paths_to_check {
        let path_buf = PathBuf::from(&path);
        if path_buf.exists() && path_buf.is_file() {
            debug!("Found claude at standard path: {} ({})", path, source);

            // Get version
            let version = get_claude_version(&path).ok().flatten();

            installations.push(ClaudeInstallation {
                path,
                version,
                source,
                installation_type: InstallationType::System,
            });
        }
    }

    // Also check if claude is available in PATH (without full path)
    let mut path_cmd = Command::new("claude");
    path_cmd.arg("--version");
    path_cmd.env("PATH", build_enhanced_path());
    
    if let Ok(output) = path_cmd.output() {
        if output.status.success() {
            debug!("claude is available in PATH");
            // Combine stdout and stderr for robust version extraction
            let mut combined: Vec<u8> = Vec::with_capacity(output.stdout.len() + output.stderr.len() + 1);
            combined.extend_from_slice(&output.stdout);
            if !output.stderr.is_empty() {
                combined.extend_from_slice(b"\n");
                combined.extend_from_slice(&output.stderr);
            }
            let version = extract_version_from_output(&combined);

            installations.push(ClaudeInstallation {
                path: "claude".to_string(),
                version,
                source: "PATH".to_string(),
                installation_type: InstallationType::System,
            });
        }
    }

    installations
}

/// Get Claude version by running --version command
fn get_claude_version(path: &str) -> Result<Option<String>, String> {
    // Use the helper function to create command with proper environment
    let mut cmd = create_command_with_env(path);
    cmd.arg("--version");
    
    match cmd.output() {
        Ok(output) => {
            if output.status.success() {
                // Combine stdout and stderr for robust version extraction
                let mut combined: Vec<u8> = Vec::with_capacity(output.stdout.len() + output.stderr.len() + 1);
                combined.extend_from_slice(&output.stdout);
                if !output.stderr.is_empty() {
                    combined.extend_from_slice(b"\n");
                    combined.extend_from_slice(&output.stderr);
                }
                Ok(extract_version_from_output(&combined))
            } else {
                Ok(None)
            }
        }
        Err(e) => {
            warn!("Failed to get version for {}: {}", path, e);
            Ok(None)
        }
    }
}

/// Extract version string from command output
fn extract_version_from_output(stdout: &[u8]) -> Option<String> {
    let output_str = String::from_utf8_lossy(stdout);

    // Debug log the raw output
    debug!("Raw version output: {:?}", output_str);

    // Use regex to directly extract version pattern (e.g., "1.0.41")
    // This pattern matches:
    // - One or more digits, followed by
    // - A dot, followed by
    // - One or more digits, followed by
    // - A dot, followed by
    // - One or more digits
    // - Optionally followed by pre-release/build metadata
    let version_regex = regex::Regex::new(r"(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)").ok()?;

    if let Some(captures) = version_regex.captures(&output_str) {
        if let Some(version_match) = captures.get(1) {
            let version = version_match.as_str().to_string();
            debug!("Extracted version: {:?}", version);
            return Some(version);
        }
    }

    debug!("No version found in output");
    None
}

/// Select the best installation based on version
fn select_best_installation(installations: Vec<ClaudeInstallation>) -> Option<ClaudeInstallation> {
    // In production builds, version information may not be retrievable because
    // spawning external processes can be restricted. We therefore no longer
    // discard installations that lack a detected version – the mere presence
    // of a readable binary on disk is enough to consider it valid. We still
    // prefer binaries with version information when it is available so that
    // in development builds we keep the previous behaviour of picking the
    // most recent version.
    installations.into_iter().max_by(|a, b| {
        match (&a.version, &b.version) {
            // If both have versions, compare them semantically.
            (Some(v1), Some(v2)) => compare_versions(v1, v2),
            // Prefer the entry that actually has version information.
            (Some(_), None) => Ordering::Greater,
            (None, Some(_)) => Ordering::Less,
            // Neither have version info: prefer the one that is not just
            // the bare "claude" lookup from PATH, because that may fail
            // at runtime if PATH is modified.
            (None, None) => {
                if a.path == "claude" && b.path != "claude" {
                    Ordering::Less
                } else if a.path != "claude" && b.path == "claude" {
                    Ordering::Greater
                } else {
                    Ordering::Equal
                }
            }
        }
    })
}

/// Compare two version strings
fn compare_versions(a: &str, b: &str) -> Ordering {
    // Simple semantic version comparison
    let a_parts: Vec<u32> = a
        .split('.')
        .filter_map(|s| {
            // Handle versions like "1.0.17-beta" by taking only numeric part
            s.chars()
                .take_while(|c| c.is_numeric())
                .collect::<String>()
                .parse()
                .ok()
        })
        .collect();

    let b_parts: Vec<u32> = b
        .split('.')
        .filter_map(|s| {
            s.chars()
                .take_while(|c| c.is_numeric())
                .collect::<String>()
                .parse()
                .ok()
        })
        .collect();

    // Compare each part
    for i in 0..std::cmp::max(a_parts.len(), b_parts.len()) {
        let a_val = a_parts.get(i).unwrap_or(&0);
        let b_val = b_parts.get(i).unwrap_or(&0);
        match a_val.cmp(b_val) {
            Ordering::Equal => continue,
            other => return other,
        }
    }

    Ordering::Equal
}

/// Helper function to create a Command with proper environment variables
/// This ensures commands like Claude can find Node.js and other dependencies
pub fn create_command_with_env(program: &str) -> Command {
    let mut cmd = Command::new(program);

    info!("Creating command for: {}", program);

    // Build enhanced PATH for production environments (DMG/App Bundle)
    let enhanced_path = build_enhanced_path();
    debug!("Enhanced PATH: {}", enhanced_path);
    cmd.env("PATH", enhanced_path.clone());

    // Inherit essential environment variables from parent process
    for (key, value) in std::env::vars() {
        // Pass through essential environment variables (excluding PATH which we set above)
        if key == "HOME"
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
            // Add proxy environment variables (only uppercase)
            || key == "HTTP_PROXY"
            || key == "HTTPS_PROXY"
            || key == "NO_PROXY"
            || key == "ALL_PROXY"
        {
            debug!("Inheriting env var: {}={}", key, value);
            cmd.env(&key, &value);
        }
    }

    // Log proxy-related environment variables for debugging
    info!("Command will use proxy settings:");
    if let Ok(http_proxy) = std::env::var("HTTP_PROXY") {
        info!("  HTTP_PROXY={}", http_proxy);
    }
    if let Ok(https_proxy) = std::env::var("HTTPS_PROXY") {
        info!("  HTTPS_PROXY={}", https_proxy);
    }

    // Add NVM support if the program is in an NVM directory
    if program.contains("/.nvm/versions/node/") {
        if let Some(node_bin_dir) = std::path::Path::new(program).parent() {
            // Ensure the Node.js bin directory is in PATH
            let current_path = cmd.get_envs()
                .find(|(k, _)| k.to_str() == Some("PATH"))
                .and_then(|(_, v)| v)
                .and_then(|v| v.to_str())
                .unwrap_or(&enhanced_path)
                .to_string();
            let node_bin_str = node_bin_dir.to_string_lossy();
            if !current_path.contains(&node_bin_str.as_ref()) {
                let new_path = format!("{}:{}", node_bin_str, current_path);
                debug!("Adding NVM bin directory to PATH: {}", node_bin_str);
                cmd.env("PATH", new_path);
            }
        }
    }

    cmd
}

/// Build an enhanced PATH that includes all possible Claude installation locations
/// This is especially important for DMG/packaged applications where PATH may be limited
fn build_enhanced_path() -> String {
    let mut paths = Vec::new();
    
    // Start with current PATH
    if let Ok(current_path) = std::env::var("PATH") {
        paths.push(current_path);
    }
    
    // Add standard system paths that might be missing in packaged apps
    let system_paths = vec![
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
    ];
    
    for path in system_paths {
        if PathBuf::from(path).exists() {
            paths.push(path.to_string());
        }
    }
    
    // Add user-specific paths
    if let Ok(home) = std::env::var("HOME") {
        let user_paths = vec![
            format!("{}/.local/bin", home),
            format!("{}/.claude/local", home),
            format!("{}/.npm-global/bin", home),
            format!("{}/.yarn/bin", home),
            format!("{}/.bun/bin", home),
            format!("{}/bin", home),
            format!("{}/.config/yarn/global/node_modules/.bin", home),
            format!("{}/node_modules/.bin", home),
        ];
        
        for path in user_paths {
            if PathBuf::from(&path).exists() {
                paths.push(path);
            }
        }
        
        // Add all NVM node versions
        let nvm_dir = PathBuf::from(&home).join(".nvm/versions/node");
        if nvm_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
                for entry in entries.flatten() {
                    if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        let bin_path = entry.path().join("bin");
                        if bin_path.exists() {
                            paths.push(bin_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }
    
    // Remove duplicates while preserving order
    let mut seen = std::collections::HashSet::new();
    let unique_paths: Vec<String> = paths
        .into_iter()
        .filter(|path| seen.insert(path.clone()))
        .collect();
    
    unique_paths.join(":")
}
