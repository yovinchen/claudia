use chrono::{Local, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{command, State};
use walkdir::WalkDir;

use super::usage::{
    UsageStats, ModelUsage, DailyUsage, ProjectUsage, UsageEntry,
    parse_jsonl_file
};

#[derive(Default)]
pub struct UsageCacheState {
    pub conn: Arc<Mutex<Option<Connection>>>,
    pub last_scan_time: Arc<Mutex<Option<i64>>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScanResult {
    pub files_scanned: u32,
    pub entries_added: u32,
    pub entries_skipped: u32,
    pub scan_time_ms: u64,
}

fn db_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claudia/cache/usage_stats.sqlite")
}

fn ensure_parent_dir(p: &Path) -> std::io::Result<()> {
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir)?;
    }
    Ok(())
}

pub fn init_cache_db() -> rusqlite::Result<Connection> {
    let path = db_path();
    ensure_parent_dir(&path).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", &"WAL")?;
    
    // Create schema
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
        INSERT OR IGNORE INTO schema_version(version) VALUES (1);

        -- File scan records
        CREATE TABLE IF NOT EXISTS scanned_files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_path TEXT NOT NULL UNIQUE,
          file_size INTEGER NOT NULL,
          mtime_ms INTEGER NOT NULL,
          last_scanned_ms INTEGER NOT NULL,
          entry_count INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_files_path ON scanned_files(file_path);

        -- API usage records
        CREATE TABLE IF NOT EXISTS usage_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          model TEXT NOT NULL,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          cache_creation_tokens INTEGER DEFAULT 0,
          cache_read_tokens INTEGER DEFAULT 0,
          cost REAL NOT NULL,
          session_id TEXT NOT NULL,
          project_path TEXT NOT NULL,
          file_path TEXT NOT NULL,
          unique_hash TEXT NOT NULL UNIQUE
        );
        CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON usage_entries(timestamp);
        CREATE INDEX IF NOT EXISTS idx_entries_project ON usage_entries(project_path);
        CREATE INDEX IF NOT EXISTS idx_entries_hash ON usage_entries(unique_hash);
        CREATE INDEX IF NOT EXISTS idx_entries_model ON usage_entries(model);
        "#,
    )?;
    
    Ok(conn)
}

fn get_file_mtime_ms(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn get_file_size(path: &Path) -> i64 {
    fs::metadata(path)
        .map(|m| m.len() as i64)
        .unwrap_or(0)
}

fn generate_unique_hash(entry: &UsageEntry, has_io_tokens: bool, has_cache_tokens: bool) -> String {
    if has_io_tokens {
        // For I/O tokens: use session_id + timestamp + model
        format!("io:{}:{}:{}", entry.session_id, entry.timestamp, entry.model)
    } else if has_cache_tokens {
        // For cache tokens: use timestamp + model + project
        format!("cache:{}:{}:{}", entry.timestamp, entry.model, entry.project_path)
    } else {
        // Fallback
        format!("other:{}:{}", entry.timestamp, entry.session_id)
    }
}

#[command]
pub async fn usage_scan_update(state: State<'_, UsageCacheState>) -> Result<ScanResult, String> {
    let start_time = Utc::now().timestamp_millis();
    
    // Initialize or get connection
    let mut conn_guard = state.conn.lock().map_err(|e| e.to_string())?;
    if conn_guard.is_none() {
        *conn_guard = Some(init_cache_db().map_err(|e| e.to_string())?);
    }
    let conn = conn_guard.as_mut().unwrap();
    
    let claude_path = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".claude");
    
    let projects_dir = claude_path.join("projects");
    
    // Get existing scanned files from DB
    let mut existing_files: HashMap<String, (i64, i64)> = HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT file_path, file_size, mtime_ms FROM scanned_files")
            .map_err(|e| e.to_string())?;
        
        let rows = stmt.query_map(params![], |row| {
            Ok((
                row.get::<_, String>(0)?,
                (row.get::<_, i64>(1)?, row.get::<_, i64>(2)?),
            ))
        }).map_err(|e| e.to_string())?;
        
        for row in rows {
            if let Ok((path, data)) = row {
                existing_files.insert(path, data);
            }
        }
    }
    
    // Find all .jsonl files
    let mut files_to_process = Vec::new();
    let mut all_current_files = HashSet::new();
    
    if let Ok(projects) = fs::read_dir(&projects_dir) {
        for project in projects.flatten() {
            if project.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let project_name = project.file_name().to_string_lossy().to_string();
                let project_path = project.path();
                
                WalkDir::new(&project_path)
                    .into_iter()
                    .filter_map(Result::ok)
                    .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("jsonl"))
                    .for_each(|entry| {
                        let path = entry.path().to_path_buf();
                        let path_str = path.to_string_lossy().to_string();
                        all_current_files.insert(path_str.clone());
                        
                        // Check if file needs processing
                        let current_size = get_file_size(&path);
                        let current_mtime = get_file_mtime_ms(&path);
                        
                        let needs_processing = if let Some((stored_size, stored_mtime)) = existing_files.get(&path_str) {
                            current_size != *stored_size || current_mtime != *stored_mtime
                        } else {
                            true // New file
                        };
                        
                        if needs_processing {
                            files_to_process.push((path, project_name.clone()));
                        }
                    });
            }
        }
    }
    
    let mut files_scanned = 0u32;
    let mut entries_added = 0u32;
    let mut entries_skipped = 0u32;
    
    // Process files that need updating
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    for (file_path, project_name) in files_to_process {
        let path_str = file_path.to_string_lossy().to_string();
        let file_size = get_file_size(&file_path);
        let mtime_ms = get_file_mtime_ms(&file_path);
        
        // Parse the JSONL file and get entries
        let mut processed_hashes = HashSet::new();
        let entries = parse_jsonl_file(&file_path, &project_name, &mut processed_hashes);
        
        // Insert or update file record
        tx.execute(
            "INSERT INTO scanned_files (file_path, file_size, mtime_ms, last_scanned_ms, entry_count) 
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(file_path) DO UPDATE SET 
                file_size = excluded.file_size,
                mtime_ms = excluded.mtime_ms,
                last_scanned_ms = excluded.last_scanned_ms,
                entry_count = excluded.entry_count",
            params![path_str, file_size, mtime_ms, start_time, entries.len() as i64],
        ).map_err(|e| e.to_string())?;
        
        // Insert usage entries
        for entry in entries {
            let has_io_tokens = entry.input_tokens > 0 || entry.output_tokens > 0;
            let has_cache_tokens = entry.cache_creation_tokens > 0 || entry.cache_read_tokens > 0;
            let unique_hash = generate_unique_hash(&entry, has_io_tokens, has_cache_tokens);
            
            let result = tx.execute(
                "INSERT INTO usage_entries (
                    timestamp, model, input_tokens, output_tokens, 
                    cache_creation_tokens, cache_read_tokens, cost, 
                    session_id, project_path, file_path, unique_hash
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                ON CONFLICT(unique_hash) DO NOTHING",
                params![
                    entry.timestamp,
                    entry.model,
                    entry.input_tokens as i64,
                    entry.output_tokens as i64,
                    entry.cache_creation_tokens as i64,
                    entry.cache_read_tokens as i64,
                    entry.cost,
                    entry.session_id,
                    entry.project_path,
                    path_str,
                    unique_hash,
                ],
            );
            
            match result {
                Ok(n) if n > 0 => entries_added += 1,
                _ => entries_skipped += 1,
            }
        }
        
        files_scanned += 1;
    }
    
    // Remove entries for files that no longer exist
    for (old_path, _) in existing_files {
        if !all_current_files.contains(&old_path) {
            tx.execute("DELETE FROM usage_entries WHERE file_path = ?1", params![old_path])
                .map_err(|e| e.to_string())?;
            tx.execute("DELETE FROM scanned_files WHERE file_path = ?1", params![old_path])
                .map_err(|e| e.to_string())?;
        }
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    
    // Update last scan time
    let mut last_scan = state.last_scan_time.lock().map_err(|e| e.to_string())?;
    *last_scan = Some(start_time);
    
    let scan_time_ms = (Utc::now().timestamp_millis() - start_time) as u64;
    
    Ok(ScanResult {
        files_scanned,
        entries_added,
        entries_skipped,
        scan_time_ms,
    })
}

#[command]
pub async fn usage_get_stats_cached(
    days: Option<u32>,
    state: State<'_, UsageCacheState>,
) -> Result<UsageStats, String> {
    // First ensure cache is up to date
    usage_scan_update(state.clone()).await?;
    
    let conn_guard = state.conn.lock().map_err(|e| e.to_string())?;
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;
    
    // Build date filter
    let date_filter = if let Some(d) = days {
        let cutoff = Local::now().naive_local().date() - chrono::Duration::days(d as i64);
        Some(cutoff.format("%Y-%m-%d").to_string())
    } else {
        None
    };
    
    // Query total stats
    let (total_cost, total_input, total_output, total_cache_creation, total_cache_read): (f64, i64, i64, i64, i64) = 
        if let Some(cutoff) = &date_filter {
            conn.query_row(
                "SELECT 
                    COALESCE(SUM(cost), 0.0),
                    COALESCE(SUM(input_tokens), 0),
                    COALESCE(SUM(output_tokens), 0),
                    COALESCE(SUM(cache_creation_tokens), 0),
                    COALESCE(SUM(cache_read_tokens), 0)
                FROM usage_entries
                WHERE timestamp >= ?1",
                params![cutoff],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            ).map_err(|e| e.to_string())?
        } else {
            conn.query_row(
                "SELECT 
                    COALESCE(SUM(cost), 0.0),
                    COALESCE(SUM(input_tokens), 0),
                    COALESCE(SUM(output_tokens), 0),
                    COALESCE(SUM(cache_creation_tokens), 0),
                    COALESCE(SUM(cache_read_tokens), 0)
                FROM usage_entries",
                params![],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            ).map_err(|e| e.to_string())?
        };
    
    let total_tokens = total_input + total_output + total_cache_creation + total_cache_read;
    
    // Get session count
    let total_sessions: i64 = if let Some(cutoff) = &date_filter {
        conn.query_row(
            "SELECT COUNT(DISTINCT session_id) FROM usage_entries WHERE timestamp >= ?1",
            params![cutoff],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?
    } else {
        conn.query_row(
            "SELECT COUNT(DISTINCT session_id) FROM usage_entries",
            params![],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?
    };
    
    // Get stats by model
    let mut by_model = Vec::new();
    {
        let query = if date_filter.is_some() {
            "SELECT 
                model,
                SUM(cost) as total_cost,
                SUM(input_tokens) as input,
                SUM(output_tokens) as output,
                SUM(cache_creation_tokens) as cache_creation,
                SUM(cache_read_tokens) as cache_read,
                COUNT(DISTINCT session_id) as sessions
            FROM usage_entries
            WHERE timestamp >= ?1
            GROUP BY model
            ORDER BY total_cost DESC"
        } else {
            "SELECT 
                model,
                SUM(cost) as total_cost,
                SUM(input_tokens) as input,
                SUM(output_tokens) as output,
                SUM(cache_creation_tokens) as cache_creation,
                SUM(cache_read_tokens) as cache_read,
                COUNT(DISTINCT session_id) as sessions
            FROM usage_entries
            GROUP BY model
            ORDER BY total_cost DESC"
        };
        
        let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
        
        // Create closure once to avoid type mismatch
        let create_model_usage = |row: &rusqlite::Row| -> rusqlite::Result<ModelUsage> {
            Ok(ModelUsage {
                model: row.get(0)?,
                total_cost: row.get(1)?,
                input_tokens: row.get::<_, i64>(2)? as u64,
                output_tokens: row.get::<_, i64>(3)? as u64,
                cache_creation_tokens: row.get::<_, i64>(4)? as u64,
                cache_read_tokens: row.get::<_, i64>(5)? as u64,
                session_count: row.get::<_, i64>(6)? as u64,
                total_tokens: 0, // Will calculate below
            })
        };
        
        let rows = if let Some(cutoff) = &date_filter {
            stmt.query_map(params![cutoff], create_model_usage).map_err(|e| e.to_string())?
        } else {
            stmt.query_map(params![], create_model_usage).map_err(|e| e.to_string())?
        };
        
        for row in rows {
            if let Ok(mut usage) = row {
                usage.total_tokens = usage.input_tokens + usage.output_tokens + 
                                   usage.cache_creation_tokens + usage.cache_read_tokens;
                by_model.push(usage);
            }
        }
    }
    
    // Get daily stats
    let mut by_date = Vec::new();
    {
        let query = if date_filter.is_some() {
            "SELECT 
                DATE(timestamp) as date,
                SUM(cost) as total_cost,
                SUM(input_tokens) as input,
                SUM(output_tokens) as output,
                SUM(cache_creation_tokens) as cache_creation,
                SUM(cache_read_tokens) as cache_read,
                COUNT(DISTINCT session_id) as sessions,
                COUNT(*) as requests,
                GROUP_CONCAT(DISTINCT model) as models
            FROM usage_entries
            WHERE timestamp >= ?1
            GROUP BY DATE(timestamp)
            ORDER BY date DESC"
        } else {
            "SELECT 
                DATE(timestamp) as date,
                SUM(cost) as total_cost,
                SUM(input_tokens) as input,
                SUM(output_tokens) as output,
                SUM(cache_creation_tokens) as cache_creation,
                SUM(cache_read_tokens) as cache_read,
                COUNT(DISTINCT session_id) as sessions,
                COUNT(*) as requests,
                GROUP_CONCAT(DISTINCT model) as models
            FROM usage_entries
            GROUP BY DATE(timestamp)
            ORDER BY date DESC"
        };
        
        let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
        
        // Create closure once to avoid type mismatch
        let create_daily_usage = |row: &rusqlite::Row| -> rusqlite::Result<DailyUsage> {
            let models_str: String = row.get(8)?;
            let models_used: Vec<String> = models_str.split(',').map(|s| s.to_string()).collect();
            
            Ok(DailyUsage {
                date: row.get(0)?,
                total_cost: row.get(1)?,
                total_tokens: (row.get::<_, i64>(2)? + row.get::<_, i64>(3)? + 
                             row.get::<_, i64>(4)? + row.get::<_, i64>(5)?) as u64,
                input_tokens: row.get::<_, i64>(2)? as u64,
                output_tokens: row.get::<_, i64>(3)? as u64,
                cache_creation_tokens: row.get::<_, i64>(4)? as u64,
                cache_read_tokens: row.get::<_, i64>(5)? as u64,
                request_count: row.get::<_, i64>(7)? as u64,
                models_used,
            })
        };
        
        let rows = if let Some(cutoff) = &date_filter {
            stmt.query_map(params![cutoff], create_daily_usage).map_err(|e| e.to_string())?
        } else {
            stmt.query_map(params![], create_daily_usage).map_err(|e| e.to_string())?
        };
        
        for row in rows {
            if let Ok(daily) = row {
                by_date.push(daily);
            }
        }
    }
    
    // Get project stats
    let mut by_project = Vec::new();
    {
        let query = if date_filter.is_some() {
            "SELECT 
                project_path,
                SUM(cost) as total_cost,
                SUM(input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens) as total_tokens,
                COUNT(DISTINCT session_id) as sessions,
                MAX(timestamp) as last_used
            FROM usage_entries
            WHERE timestamp >= ?1
            GROUP BY project_path
            ORDER BY total_cost DESC"
        } else {
            "SELECT 
                project_path,
                SUM(cost) as total_cost,
                SUM(input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens) as total_tokens,
                COUNT(DISTINCT session_id) as sessions,
                MAX(timestamp) as last_used
            FROM usage_entries
            GROUP BY project_path
            ORDER BY total_cost DESC"
        };
        
        let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
        
        // Create closure once to avoid type mismatch
        let create_project_usage = |row: &rusqlite::Row| -> rusqlite::Result<ProjectUsage> {
            Ok(ProjectUsage {
                project_path: row.get(0)?,
                project_name: String::new(), // Will be extracted from path
                total_cost: row.get(1)?,
                total_tokens: row.get::<_, i64>(2)? as u64,
                session_count: row.get::<_, i64>(3)? as u64,
                last_used: row.get(4)?,
            })
        };
        
        let rows = if let Some(cutoff) = &date_filter {
            stmt.query_map(params![cutoff], create_project_usage).map_err(|e| e.to_string())?
        } else {
            stmt.query_map(params![], create_project_usage).map_err(|e| e.to_string())?
        };
        
        for row in rows {
            if let Ok(mut project) = row {
                // Extract project name from path
                project.project_name = project.project_path
                    .split('/')
                    .last()
                    .unwrap_or(&project.project_path)
                    .to_string();
                by_project.push(project);
            }
        }
    }
    
    Ok(UsageStats {
        total_cost,
        total_tokens: total_tokens as u64,
        total_input_tokens: total_input as u64,
        total_output_tokens: total_output as u64,
        total_cache_creation_tokens: total_cache_creation as u64,
        total_cache_read_tokens: total_cache_read as u64,
        total_sessions: total_sessions as u64,
        by_model,
        by_date,
        by_project,
    })
}

#[command]
pub async fn usage_clear_cache(state: State<'_, UsageCacheState>) -> Result<String, String> {
    let mut conn_guard = state.conn.lock().map_err(|e| e.to_string())?;
    
    if let Some(conn) = conn_guard.as_mut() {
        conn.execute("DELETE FROM usage_entries", params![])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM scanned_files", params![])
            .map_err(|e| e.to_string())?;
        
        // 重置last scan time
        let mut last_scan = state.last_scan_time.lock().map_err(|e| e.to_string())?;
        *last_scan = None;
        
        return Ok("Cache cleared successfully. All costs will be recalculated.".to_string());
    }
    
    Ok("No cache to clear.".to_string())
}