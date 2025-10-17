use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitStatus {
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub staged: Vec<GitFileStatus>,
    pub modified: Vec<GitFileStatus>,
    pub untracked: Vec<GitFileStatus>,
    pub conflicted: Vec<GitFileStatus>,
    pub is_clean: bool,
    pub remote_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String, // "modified", "added", "deleted", "renamed"
    pub staged: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub message: String,
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
    pub remote: Option<String>,
    pub last_commit: Option<String>,
}

/// 获取 Git 状态
#[tauri::command]
pub async fn get_git_status(path: String) -> Result<GitStatus, String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    // Check if it's a git repository
    let git_check = Command::new("git")
        .arg("rev-parse")
        .arg("--git-dir")
        .current_dir(path)
        .output()
        .map_err(|e| format!("Failed to execute git command: {}", e))?;

    if !git_check.status.success() {
        return Err("Not a git repository".to_string());
    }

    // Get current branch
    let branch_output = Command::new("git")
        .args(&["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(path)
        .output()
        .map_err(|e| format!("Failed to get branch: {}", e))?;

    let branch = String::from_utf8_lossy(&branch_output.stdout)
        .trim()
        .to_string();

    // Get remote tracking info
    let (ahead, behind) = get_tracking_info(path)?;

    // Get status
    let status_output = Command::new("git")
        .args(&["status", "--porcelain=v1"])
        .current_dir(path)
        .output()
        .map_err(|e| format!("Failed to get status: {}", e))?;

    let status_text = String::from_utf8_lossy(&status_output.stdout);
    let (staged, modified, untracked, conflicted) = parse_git_status(&status_text);

    // Get remote URL
    let remote_output = Command::new("git")
        .args(&["remote", "get-url", "origin"])
        .current_dir(path)
        .output()
        .ok();

    let remote_url = remote_output.and_then(|o| {
        if o.status.success() {
            Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
        } else {
            None
        }
    });

    let is_clean = staged.is_empty() && modified.is_empty() && untracked.is_empty();

    Ok(GitStatus {
        branch,
        ahead,
        behind,
        staged,
        modified,
        untracked,
        conflicted,
        is_clean,
        remote_url,
    })
}

fn get_tracking_info(path: &Path) -> Result<(u32, u32), String> {
    // Get ahead/behind counts
    let ahead_output = Command::new("git")
        .args(&["rev-list", "--count", "@{u}..HEAD"])
        .current_dir(path)
        .output();

    let behind_output = Command::new("git")
        .args(&["rev-list", "--count", "HEAD..@{u}"])
        .current_dir(path)
        .output();

    let ahead = ahead_output
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8_lossy(&o.stdout)
                    .trim()
                    .parse::<u32>()
                    .ok()
            } else {
                None
            }
        })
        .unwrap_or(0);

    let behind = behind_output
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8_lossy(&o.stdout)
                    .trim()
                    .parse::<u32>()
                    .ok()
            } else {
                None
            }
        })
        .unwrap_or(0);

    Ok((ahead, behind))
}

fn parse_git_status(
    status_text: &str,
) -> (
    Vec<GitFileStatus>,
    Vec<GitFileStatus>,
    Vec<GitFileStatus>,
    Vec<GitFileStatus>,
) {
    let mut staged = Vec::new();
    let mut modified = Vec::new();
    let mut untracked = Vec::new();
    let mut conflicted = Vec::new();

    for line in status_text.lines() {
        if line.len() < 3 {
            continue;
        }

        let status_code = &line[0..2];
        let file_path = line[3..].trim().to_string();

        match status_code {
            "M " => modified.push(GitFileStatus {
                path: file_path,
                status: "modified".to_string(),
                staged: false,
            }),
            " M" => modified.push(GitFileStatus {
                path: file_path,
                status: "modified".to_string(),
                staged: false,
            }),
            "MM" => {
                staged.push(GitFileStatus {
                    path: file_path.clone(),
                    status: "modified".to_string(),
                    staged: true,
                });
                modified.push(GitFileStatus {
                    path: file_path,
                    status: "modified".to_string(),
                    staged: false,
                });
            }
            "A " | "AM" => staged.push(GitFileStatus {
                path: file_path,
                status: "added".to_string(),
                staged: true,
            }),
            "D " => staged.push(GitFileStatus {
                path: file_path,
                status: "deleted".to_string(),
                staged: true,
            }),
            " D" => modified.push(GitFileStatus {
                path: file_path,
                status: "deleted".to_string(),
                staged: false,
            }),
            "R " => staged.push(GitFileStatus {
                path: file_path,
                status: "renamed".to_string(),
                staged: true,
            }),
            "??" => untracked.push(GitFileStatus {
                path: file_path,
                status: "untracked".to_string(),
                staged: false,
            }),
            "UU" | "AA" | "DD" => conflicted.push(GitFileStatus {
                path: file_path,
                status: "conflicted".to_string(),
                staged: false,
            }),
            _ => {}
        }
    }

    (staged, modified, untracked, conflicted)
}

/// 获取 Git 提交历史
#[tauri::command]
pub async fn get_git_history(
    path: String,
    limit: Option<usize>,
    branch: Option<String>,
) -> Result<Vec<GitCommit>, String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    let limit = limit.unwrap_or(50);
    let branch = branch.unwrap_or_else(|| "HEAD".to_string());

    // Get commit logs with stats
    let log_output = Command::new("git")
        .args(&[
            "log",
            &branch,
            &format!("-{}", limit),
            "--pretty=format:%H|%h|%an|%ae|%ad|%s",
            "--date=iso",
            "--numstat",
        ])
        .current_dir(path)
        .output()
        .map_err(|e| format!("Failed to get git history: {}", e))?;

    if !log_output.status.success() {
        return Err("Failed to get git history".to_string());
    }

    let log_text = String::from_utf8_lossy(&log_output.stdout);
    parse_git_log(&log_text)
}

fn parse_git_log(log_text: &str) -> Result<Vec<GitCommit>, String> {
    let mut commits = Vec::new();
    let mut current_commit: Option<GitCommit> = None;
    let mut files_changed = 0u32;
    let mut insertions = 0u32;
    let mut deletions = 0u32;

    for line in log_text.lines() {
        if line.contains('|') && line.matches('|').count() == 5 {
            // Save previous commit if exists
            if let Some(mut commit) = current_commit.take() {
                commit.files_changed = files_changed;
                commit.insertions = insertions;
                commit.deletions = deletions;
                commits.push(commit);
            }

            // Reset counters
            files_changed = 0;
            insertions = 0;
            deletions = 0;

            // Parse new commit
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 6 {
                current_commit = Some(GitCommit {
                    hash: parts[0].to_string(),
                    short_hash: parts[1].to_string(),
                    author: parts[2].to_string(),
                    email: parts[3].to_string(),
                    date: parts[4].to_string(),
                    message: parts[5].to_string(),
                    files_changed: 0,
                    insertions: 0,
                    deletions: 0,
                });
            }
        } else if !line.trim().is_empty() && current_commit.is_some() {
            // Parse numstat line
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                if let Ok(added) = parts[0].parse::<u32>() {
                    insertions += added;
                }
                if let Ok(removed) = parts[1].parse::<u32>() {
                    deletions += removed;
                }
                files_changed += 1;
            }
        }
    }

    // Save last commit
    if let Some(mut commit) = current_commit {
        commit.files_changed = files_changed;
        commit.insertions = insertions;
        commit.deletions = deletions;
        commits.push(commit);
    }

    Ok(commits)
}

/// 获取 Git 分支列表
#[tauri::command]
pub async fn get_git_branches(path: String) -> Result<Vec<GitBranch>, String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    // Get all branches
    let branch_output = Command::new("git")
        .args(&["branch", "-a", "-v"])
        .current_dir(path)
        .output()
        .map_err(|e| format!("Failed to get branches: {}", e))?;

    if !branch_output.status.success() {
        return Err("Failed to get branches".to_string());
    }

    let branch_text = String::from_utf8_lossy(&branch_output.stdout);
    let mut branches = Vec::new();

    for line in branch_text.lines() {
        let is_current = line.starts_with('*');
        let line = line.trim_start_matches('*').trim();

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        let name = parts[0].to_string();
        let last_commit = if parts.len() > 1 {
            Some(parts[1].to_string())
        } else {
            None
        };

        let remote = if name.starts_with("remotes/") {
            Some(name.trim_start_matches("remotes/").to_string())
        } else {
            None
        };

        branches.push(GitBranch {
            name: name.trim_start_matches("remotes/").to_string(),
            is_current,
            remote,
            last_commit,
        });
    }

    Ok(branches)
}

/// 获取文件的 Git diff
#[tauri::command]
pub async fn get_git_diff(
    path: String,
    file_path: Option<String>,
    staged: Option<bool>,
) -> Result<String, String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    let mut cmd = Command::new("git");
    cmd.arg("diff");

    if staged.unwrap_or(false) {
        cmd.arg("--cached");
    }

    if let Some(file) = file_path {
        cmd.arg(file);
    }

    let diff_output = cmd
        .current_dir(path)
        .output()
        .map_err(|e| format!("Failed to get diff: {}", e))?;

    if !diff_output.status.success() {
        return Err("Failed to get diff".to_string());
    }

    Ok(String::from_utf8_lossy(&diff_output.stdout).to_string())
}

/// 获取 Git 提交列表（简化版）
#[tauri::command]
pub async fn get_git_commits(project_path: String, limit: usize) -> Result<Vec<GitCommit>, String> {
    // 使用已有的 get_git_history 函数，直接传递 limit 参数
    get_git_history(project_path, Some(limit), None).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_git_status() {
        let status_text = "?? test-untracked.txt\nA  staged-file.txt\n M modified-file.txt";
        let (staged, modified, untracked, conflicted) = parse_git_status(status_text);

        println!("Untracked files: {:?}", untracked);
        println!("Staged files: {:?}", staged);
        println!("Modified files: {:?}", modified);

        assert_eq!(untracked.len(), 1);
        assert_eq!(untracked[0].path, "test-untracked.txt");
        assert_eq!(untracked[0].status, "untracked");

        assert_eq!(staged.len(), 1);
        assert_eq!(staged[0].path, "staged-file.txt");

        assert_eq!(modified.len(), 1);
        assert_eq!(modified[0].path, "modified-file.txt");
    }
}
