use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub file_type: String, // "file" or "directory"
    pub children: Option<Vec<FileNode>>,
    pub size: Option<u64>,
    pub modified: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileSystemChange {
    pub path: String,
    pub change_type: String, // "created", "modified", "deleted"
}

/// 读取文件内容
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// 写入文件内容
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write file: {}", e))
}

/// 读取目录树结构
#[tauri::command]
pub async fn read_directory_tree(
    path: String,
    max_depth: Option<u32>,
    ignore_patterns: Option<Vec<String>>,
) -> Result<FileNode, String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    let max_depth = max_depth.unwrap_or(5);
    let ignore_patterns = ignore_patterns.unwrap_or_else(|| vec![
        String::from("node_modules"),
        String::from(".git"),
        String::from("target"),
        String::from("dist"),
        String::from("build"),
        String::from(".idea"),
        String::from(".vscode"),
        String::from("__pycache__"),
        String::from(".DS_Store"),
    ]);

    read_directory_recursive(path, 0, max_depth, &ignore_patterns)
        .map_err(|e| e.to_string())
}

fn read_directory_recursive(
    path: &Path,
    current_depth: u32,
    max_depth: u32,
    ignore_patterns: &[String],
) -> std::io::Result<FileNode> {
    let name = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let metadata = fs::metadata(path)?;
    
    let node = if metadata.is_dir() {
        let mut children = Vec::new();
        
        if current_depth < max_depth {
            // Check if directory should be ignored
            let should_ignore = ignore_patterns.iter().any(|pattern| {
                &name == pattern || name.starts_with('.')
            });
            
            if !should_ignore {
                let entries = fs::read_dir(path)?;
                for entry in entries {
                    let entry = entry?;
                    let child_path = entry.path();
                    
                    // Skip symlinks to avoid infinite loops
                    if let Ok(meta) = entry.metadata() {
                        if !meta.file_type().is_symlink() {
                            if let Ok(child_node) = read_directory_recursive(
                                &child_path,
                                current_depth + 1,
                                max_depth,
                                ignore_patterns,
                            ) {
                                children.push(child_node);
                            }
                        }
                    }
                }
                
                // Sort children: directories first, then files, alphabetically
                children.sort_by(|a, b| {
                    match (a.file_type.as_str(), b.file_type.as_str()) {
                        ("directory", "file") => std::cmp::Ordering::Less,
                        ("file", "directory") => std::cmp::Ordering::Greater,
                        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                    }
                });
            }
        }
        
        FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            file_type: String::from("directory"),
            children: Some(children),
            size: None,
            modified: metadata.modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs()),
        }
    } else {
        FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            file_type: String::from("file"),
            children: None,
            size: Some(metadata.len()),
            modified: metadata.modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs()),
        }
    };
    
    Ok(node)
}

/// 搜索文件
#[tauri::command]
pub async fn search_files_by_name(
    base_path: String,
    query: String,
    max_results: Option<usize>,
) -> Result<Vec<String>, String> {
    let base_path = Path::new(&base_path);
    if !base_path.exists() {
        return Err(format!("Path does not exist: {}", base_path.display()));
    }

    let query_lower = query.to_lowercase();
    let max_results = max_results.unwrap_or(100);
    let mut results = Vec::new();

    search_recursive(base_path, &query_lower, &mut results, max_results)?;
    
    Ok(results)
}

fn search_recursive(
    dir: &Path,
    query: &str,
    results: &mut Vec<String>,
    max_results: usize,
) -> Result<(), String> {
    if results.len() >= max_results {
        return Ok(());
    }

    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries {
        if results.len() >= max_results {
            break;
        }

        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let file_name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_lowercase();

        if file_name.contains(query) {
            results.push(path.to_string_lossy().to_string());
        }

        if path.is_dir() {
            // Skip hidden directories and common ignore patterns
            if !file_name.starts_with('.') 
                && file_name != "node_modules"
                && file_name != "target"
                && file_name != "dist" {
                let _ = search_recursive(&path, query, results, max_results);
            }
        }
    }

    Ok(())
}

/// 获取文件信息
#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileNode, String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to get metadata: {}", e))?;

    let name = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    Ok(FileNode {
        name,
        path: path.to_string_lossy().to_string(),
        file_type: if metadata.is_dir() { 
            String::from("directory") 
        } else { 
            String::from("file") 
        },
        children: None,
        size: if metadata.is_file() { 
            Some(metadata.len()) 
        } else { 
            None 
        },
        modified: metadata.modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs()),
    })
}

/// 监听文件系统变化（简化版本）
#[tauri::command]
pub async fn watch_directory(
    app: tauri::AppHandle,
    path: String,
) -> Result<(), String> {
    // 这里可以集成 notify crate 来实现文件系统监听
    // 为了简化，先返回成功
    
    // 发送测试事件
    app.emit("file-system-change", FileSystemChange {
        path: path.clone(),
        change_type: String::from("watching"),
    }).map_err(|e| e.to_string())?;
    
    Ok(())
}