use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::State;
use walkdir::WalkDir;

#[derive(Default)]
pub struct UsageIndexState {
    pub jobs: Arc<Mutex<HashMap<String, ScanProgress>>>, // job_id -> progress
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    pub processed: u64,
    pub total: u64,
    pub started_ts: i64,
    pub finished_ts: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageSummary {
    pub files: u64,
    pub tokens: u64,
    pub lines: u64,
    pub last_scan_ts: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub inserted: u64,
    pub skipped: u64,
    pub errors: u64,
}

fn db_path_for(project_root: &Path) -> PathBuf {
    project_root.join(".claudia/cache/usage.sqlite")
}

fn ensure_parent_dir(p: &Path) -> std::io::Result<()> {
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir)?;
    }
    Ok(())
}

fn open_db(project_root: &Path) -> rusqlite::Result<Connection> {
    let path = db_path_for(project_root);
    ensure_parent_dir(&path).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", &"WAL")?;
    // schema
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
        INSERT OR IGNORE INTO schema_version(version) VALUES (1);

        CREATE TABLE IF NOT EXISTS files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_root TEXT NOT NULL,
          rel_path TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          mtime_ms INTEGER NOT NULL,
          sha256 TEXT NOT NULL,
          language TEXT,
          UNIQUE(project_root, rel_path)
        );
        CREATE INDEX IF NOT EXISTS idx_files_project_path ON files(project_root, rel_path);

        CREATE TABLE IF NOT EXISTS file_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_id INTEGER NOT NULL,
          snapshot_ts INTEGER NOT NULL,
          lines INTEGER,
          tokens INTEGER,
          chars INTEGER,
          FOREIGN KEY(file_id) REFERENCES files(id)
        );
        CREATE INDEX IF NOT EXISTS idx_metrics_file_ts ON file_metrics(file_id, snapshot_ts);

        CREATE TABLE IF NOT EXISTS file_diffs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_id INTEGER NOT NULL,
          snapshot_ts INTEGER NOT NULL,
          prev_snapshot_ts INTEGER,
          added_lines INTEGER,
          removed_lines INTEGER,
          added_tokens INTEGER,
          removed_tokens INTEGER,
          change_type TEXT CHECK(change_type IN('created','modified','deleted')) NOT NULL,
          FOREIGN KEY(file_id) REFERENCES files(id)
        );
        CREATE INDEX IF NOT EXISTS idx_diffs_file_ts ON file_diffs(file_id, snapshot_ts);
        "#,
    )?;
    Ok(conn)
}

fn sha256_file(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn count_lines_chars_tokens(path: &Path) -> std::io::Result<(u64, u64, u64)> {
    let f = File::open(path)?;
    let reader = BufReader::new(f);
    let mut lines = 0u64;
    let mut chars = 0u64;
    let mut tokens = 0u64;
    for line in reader.lines() {
        let l = line?;
        lines += 1;
        chars += l.len() as u64;
        tokens += l.split_whitespace().count() as u64;
    }
    Ok((lines, chars, tokens))
}

fn should_exclude(rel: &str, excludes: &HashSet<String>) -> bool {
    // simple prefix/segment check
    let default = ["node_modules/", "dist/", "target/", ".git/"];
    if default.iter().any(|p| rel.starts_with(p)) {
        return true;
    }
    if rel.ends_with(".lock") {
        return true;
    }
    excludes.iter().any(|p| rel.starts_with(p))
}

#[tauri::command]
pub async fn usage_scan_index(
    project_root: String,
    exclude: Option<Vec<String>>,
    state: State<'_, UsageIndexState>,
) -> Result<String, String> {
    let project = PathBuf::from(project_root.clone());
    if !project.is_dir() {
        return Err("project_root is not a directory".into());
    }
    let job_id = uuid::Uuid::new_v4().to_string();
    {
        let mut jobs = state.jobs.lock().map_err(|e| e.to_string())?;
        jobs.insert(
            job_id.clone(),
            ScanProgress {
                processed: 0,
                total: 0,
                started_ts: Utc::now().timestamp_millis(),
                finished_ts: None,
            },
        );
    }
    let excludes: HashSet<String> = exclude.unwrap_or_default().into_iter().collect();
    let state_jobs = state.jobs.clone();
    let job_id_task = job_id.clone();
    let job_id_ret = job_id.clone();
    tauri::async_runtime::spawn(async move {
        let mut conn = match open_db(&project) {
            Ok(c) => c,
            Err(e) => {
                log::error!("DB open error: {}", e);
                return;
            }
        };
        // First pass: count total
        let mut total: u64 = 0;
        for entry in WalkDir::new(&project).into_iter().filter_map(Result::ok) {
            if entry.file_type().is_file() {
                if let Ok(rel) = entry.path().strip_prefix(&project) {
                    let rel = rel.to_string_lossy().replace('\\', "/");
                    if should_exclude(&format!("{}/", rel).trim_end_matches('/'), &excludes) {
                        continue;
                    }
                    total += 1;
                }
            }
        }
        {
            if let Ok(mut jobs) = state_jobs.lock() {
                if let Some(p) = jobs.get_mut(&job_id_task) {
                    p.total = total;
                }
            }
        }
        // Cache existing file meta
        let mut existing: HashMap<String, (i64, i64, String, i64)> = HashMap::new(); // rel -> (size, mtime, sha, file_id)
        {
            let stmt = conn.prepare("SELECT id, rel_path, size_bytes, mtime_ms, sha256 FROM files WHERE project_root=?1").ok();
            if let Some(mut st) = stmt {
                let rows = st.query_map(params![project.to_string_lossy()], |row| {
                    let id: i64 = row.get(0)?;
                    let rel: String = row.get(1)?;
                    let size: i64 = row.get(2)?;
                    let mtime: i64 = row.get(3)?;
                    let sha: String = row.get(4)?;
                    Ok((rel, (size, mtime, sha, id)))
                });
                if let Ok(rows) = rows {
                    for r in rows.flatten() {
                        existing.insert(r.0, r.1);
                    }
                }
            }
        }

        let mut seen: HashSet<String> = HashSet::new();
        let now = Utc::now().timestamp_millis();
        let tx = conn.transaction();
        let mut processed: u64 = 0;
        if let Ok(tx) = tx {
            for entry in WalkDir::new(&project).into_iter().filter_map(Result::ok) {
                if entry.file_type().is_file() {
                    if let Ok(relp) = entry.path().strip_prefix(&project) {
                        let rel = relp.to_string_lossy().replace('\\', "/");
                        let rel_norm = rel.clone();
                        if should_exclude(
                            &format!("{}/", rel_norm).trim_end_matches('/'),
                            &excludes,
                        ) {
                            continue;
                        }
                        let md = match entry.metadata() {
                            Ok(m) => m,
                            Err(_) => continue,
                        };
                        let size = md.len() as i64;
                        let mtime = md
                            .modified()
                            .ok()
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_millis() as i64)
                            .unwrap_or(0);
                        let mut content_changed = true;
                        let sha: String;
                        if let Some((esize, emtime, esha, _fid)) = existing.get(&rel_norm) {
                            if *esize == size && *emtime == mtime {
                                content_changed = false;
                                sha = esha.clone();
                            } else {
                                sha = sha256_file(entry.path()).unwrap_or_default();
                                if sha == *esha {
                                    content_changed = false;
                                }
                            }
                        } else {
                            sha = sha256_file(entry.path()).unwrap_or_default();
                        }

                        // upsert files
                        tx.execute(
                            "INSERT INTO files(project_root, rel_path, size_bytes, mtime_ms, sha256, language) VALUES (?1,?2,?3,?4,?5,NULL)
                             ON CONFLICT(project_root, rel_path) DO UPDATE SET size_bytes=excluded.size_bytes, mtime_ms=excluded.mtime_ms, sha256=excluded.sha256",
                            params![project.to_string_lossy(), rel_norm, size, mtime, sha],
                        ).ok();

                        // get file_id
                        let file_id: i64 = tx
                            .query_row(
                                "SELECT id FROM files WHERE project_root=?1 AND rel_path=?2",
                                params![project.to_string_lossy(), rel_norm],
                                |row| row.get(0),
                            )
                            .unwrap_or(-1);

                        // metrics
                        if content_changed {
                            if let Ok((lines, chars, tokens)) =
                                count_lines_chars_tokens(entry.path())
                            {
                                tx.execute(
                                  "INSERT INTO file_metrics(file_id, snapshot_ts, lines, tokens, chars) VALUES (?1,?2,?3,?4,?5)",
                                  params![file_id, now, lines as i64, tokens as i64, chars as i64]
                                ).ok();
                                // diff
                                let prev: Option<(i64,i64,i64)> = tx.query_row(
                                    "SELECT lines, tokens, snapshot_ts FROM file_metrics WHERE file_id=?1 ORDER BY snapshot_ts DESC LIMIT 1 OFFSET 1",
                                    params![file_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))
                                ).ok();
                                let (added_l, removed_l, added_t, removed_t, prev_ts, change_type) =
                                    match prev {
                                        None => (
                                            lines as i64,
                                            0,
                                            tokens as i64,
                                            0,
                                            None,
                                            "created".to_string(),
                                        ),
                                        Some((pl, pt, pts)) => {
                                            let dl = lines as i64 - pl;
                                            let dt = tokens as i64 - pt;
                                            (
                                                dl.max(0),
                                                (-dl).max(0),
                                                dt.max(0),
                                                (-dt).max(0),
                                                Some(pts),
                                                "modified".to_string(),
                                            )
                                        }
                                    };
                                tx.execute(
                                  "INSERT INTO file_diffs(file_id, snapshot_ts, prev_snapshot_ts, added_lines, removed_lines, added_tokens, removed_tokens, change_type) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                                  params![file_id, now, prev_ts, added_l, removed_l, added_t, removed_t, change_type]
                                ).ok();
                            }
                        }
                        seen.insert(rel_norm);
                        processed += 1;
                        if let Ok(mut jobs) = state_jobs.lock() {
                            if let Some(p) = jobs.get_mut(&job_id_task) {
                                p.processed = processed;
                            }
                        }
                    }
                }
            }

            // deletions: files in DB but not seen
            let mut to_delete: Vec<(i64, i64, i64)> = Vec::new(); // (file_id, last_lines, last_tokens)
            {
                let stmt = tx.prepare("SELECT f.id, m.lines, m.tokens FROM files f LEFT JOIN file_metrics m ON m.file_id=f.id WHERE f.project_root=?1 AND m.snapshot_ts=(SELECT MAX(snapshot_ts) FROM file_metrics WHERE file_id=f.id)").ok();
                if let Some(mut st) = stmt {
                    let rows = st.query_map(params![project.to_string_lossy()], |row| {
                        Ok((
                            row.get(0)?,
                            row.get::<_, Option<i64>>(1).unwrap_or(None).unwrap_or(0),
                            row.get::<_, Option<i64>>(2).unwrap_or(None).unwrap_or(0),
                        ))
                    });
                    if let Ok(rows) = rows {
                        for r in rows.flatten() {
                            to_delete.push(r);
                        }
                    }
                }
            }
            for (fid, last_lines, last_tokens) in to_delete {
                let rel: String = tx
                    .query_row(
                        "SELECT rel_path FROM files WHERE id=?1",
                        params![fid],
                        |r| r.get(0),
                    )
                    .unwrap_or_default();
                if !seen.contains(&rel) {
                    tx.execute(
                        "INSERT INTO file_diffs(file_id, snapshot_ts, prev_snapshot_ts, added_lines, removed_lines, added_tokens, removed_tokens, change_type) VALUES (?1,?2,NULL,0,?3,0,?4,'deleted')",
                        params![fid, now, last_lines, last_tokens]
                    ).ok();
                }
            }

            tx.commit().ok();
        }

        if let Ok(mut jobs) = state_jobs.lock() {
            if let Some(p) = jobs.get_mut(&job_id_task) {
                p.finished_ts = Some(Utc::now().timestamp_millis());
            }
        }
    });

    Ok(job_id_ret)
}

#[tauri::command]
pub fn usage_scan_progress(
    job_id: String,
    state: State<'_, UsageIndexState>,
) -> Result<ScanProgress, String> {
    let jobs = state.jobs.lock().map_err(|e| e.to_string())?;
    jobs.get(&job_id)
        .cloned()
        .ok_or_else(|| "job not found".into())
}

#[tauri::command]
pub fn usage_get_summary(project_root: String) -> Result<UsageSummary, String> {
    let project = PathBuf::from(project_root);
    let conn = open_db(&project).map_err(|e| e.to_string())?;
    let files: u64 = conn
        .query_row(
            "SELECT COUNT(*) FROM files WHERE project_root=?1",
            params![project.to_string_lossy()],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0) as u64;
    let mut lines: u64 = 0;
    let mut tokens: u64 = 0;
    let mut last_ts: Option<i64> = None;
    let mut stmt = conn.prepare("SELECT MAX(snapshot_ts), SUM(lines), SUM(tokens) FROM file_metrics WHERE file_id IN (SELECT id FROM files WHERE project_root=?1)").map_err(|e| e.to_string())?;
    let res = stmt.query_row(params![project.to_string_lossy()], |r| {
        Ok((
            r.get::<_, Option<i64>>(0)?,
            r.get::<_, Option<i64>>(1)?,
            r.get::<_, Option<i64>>(2)?,
        ))
    });
    if let Ok((mx, lsum, tsum)) = res {
        last_ts = mx;
        lines = lsum.unwrap_or(0) as u64;
        tokens = tsum.unwrap_or(0) as u64;
    }
    Ok(UsageSummary {
        files,
        tokens,
        lines,
        last_scan_ts: last_ts,
    })
}

#[derive(Debug, Deserialize)]
struct ExternalDiff {
    rel_path: String,
    snapshot_ts: i64,
    #[serde(default)]
    prev_snapshot_ts: Option<i64>,
    #[serde(default)]
    added_lines: i64,
    #[serde(default)]
    removed_lines: i64,
    #[serde(default)]
    added_tokens: i64,
    #[serde(default)]
    removed_tokens: i64,
    change_type: String,
}

#[tauri::command]
pub fn usage_import_diffs(project_root: String, path: String) -> Result<ImportResult, String> {
    let project = PathBuf::from(project_root);
    let mut conn = open_db(&project).map_err(|e| e.to_string())?;
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut inserted = 0u64;
    let mut skipped = 0u64;
    let mut errors = 0u64;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    // try as JSON array
    let mut diffs: Vec<ExternalDiff> = Vec::new();
    match serde_json::from_str::<serde_json::Value>(&data) {
        Ok(serde_json::Value::Array(arr)) => {
            for v in arr {
                if let Ok(d) = serde_json::from_value::<ExternalDiff>(v) {
                    diffs.push(d);
                }
            }
        }
        _ => {
            // try NDJSON
            for line in data.lines() {
                let l = line.trim();
                if l.is_empty() {
                    continue;
                }
                match serde_json::from_str::<ExternalDiff>(l) {
                    Ok(d) => diffs.push(d),
                    Err(_) => {
                        errors += 1;
                    }
                }
            }
        }
    }
    for d in diffs {
        // ensure file exists in files table (create placeholder if missing)
        tx.execute(
            "INSERT INTO files(project_root, rel_path, size_bytes, mtime_ms, sha256, language) VALUES (?1,?2,0,0,'',NULL)
             ON CONFLICT(project_root, rel_path) DO NOTHING",
            params![project.to_string_lossy(), d.rel_path],
        ).ok();
        let file_id: Option<i64> = tx
            .query_row(
                "SELECT id FROM files WHERE project_root=?1 AND rel_path=?2",
                params![project.to_string_lossy(), d.rel_path],
                |r| r.get(0),
            )
            .ok();
        if let Some(fid) = file_id {
            let res = tx.execute(
                "INSERT INTO file_diffs(file_id, snapshot_ts, prev_snapshot_ts, added_lines, removed_lines, added_tokens, removed_tokens, change_type) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![fid, d.snapshot_ts, d.prev_snapshot_ts, d.added_lines, d.removed_lines, d.added_tokens, d.removed_tokens, d.change_type]
            );
            if res.is_ok() {
                inserted += 1;
            } else {
                skipped += 1;
            }
        } else {
            errors += 1;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(ImportResult {
        inserted,
        skipped,
        errors,
    })
}
