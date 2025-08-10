use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, serde::Serialize)]
pub struct FileChangeEvent {
    pub path: String,
    pub change_type: String,
    pub timestamp: u64,
}

pub struct FileWatcherManager {
    watchers: Arc<Mutex<HashMap<String, RecommendedWatcher>>>,
    app_handle: AppHandle,
    // 用于去重，避免短时间内重复事件
    last_events: Arc<Mutex<HashMap<PathBuf, SystemTime>>>,
}

impl FileWatcherManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            watchers: Arc::new(Mutex::new(HashMap::new())),
            app_handle,
            last_events: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// 监听指定路径（文件或目录）
    pub fn watch_path(&self, path: &str, recursive: bool) -> Result<(), String> {
        let path_buf = PathBuf::from(path);
        
        // 检查路径是否存在
        if !path_buf.exists() {
            return Err(format!("Path does not exist: {}", path));
        }

        // 检查是否已经在监听
        {
            let watchers = self.watchers.lock().unwrap();
            if watchers.contains_key(path) {
                log::debug!("Already watching path: {}", path);
                return Ok(());
            }
        }

        let app_handle = self.app_handle.clone();
        let last_events = self.last_events.clone();
        let watch_path = path.to_string();

        // 创建文件监听器
        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                match res {
                    Ok(event) => {
                        Self::handle_event(event, &app_handle, &last_events);
                    }
                    Err(e) => {
                        log::error!("Watch error: {:?}", e);
                    }
                }
            },
            Config::default()
                .with_poll_interval(Duration::from_secs(1))
                .with_compare_contents(false),
        ).map_err(|e| format!("Failed to create watcher: {}", e))?;

        // 开始监听
        let mode = if recursive {
            RecursiveMode::Recursive
        } else {
            RecursiveMode::NonRecursive
        };

        watcher
            .watch(&path_buf, mode)
            .map_err(|e| format!("Failed to watch path: {}", e))?;

        // 存储监听器
        let mut watchers = self.watchers.lock().unwrap();
        watchers.insert(watch_path, watcher);

        log::info!("Started watching path: {} (recursive: {})", path, recursive);
        Ok(())
    }

    /// 停止监听指定路径
    pub fn unwatch_path(&self, path: &str) -> Result<(), String> {
        let mut watchers = self.watchers.lock().unwrap();
        
        if watchers.remove(path).is_some() {
            log::info!("Stopped watching path: {}", path);
            Ok(())
        } else {
            Err(format!("Path not being watched: {}", path))
        }
    }

    /// 停止所有监听
    #[allow(dead_code)]
    pub fn unwatch_all(&self) {
        let mut watchers = self.watchers.lock().unwrap();
        let count = watchers.len();
        watchers.clear();
        log::info!("Stopped watching {} paths", count);
    }

    /// 处理文件系统事件
    fn handle_event(event: Event, app_handle: &AppHandle, last_events: &Arc<Mutex<HashMap<PathBuf, SystemTime>>>) {
        // 过滤不需要的事件
        let change_type = match event.kind {
            EventKind::Create(_) => "created",
            EventKind::Modify(_) => "modified",
            EventKind::Remove(_) => "deleted",
            _ => return, // 忽略其他事件（包括 Access 等）
        };

        // 处理每个受影响的路径
        for path in event.paths {
            // 去重：检查是否在短时间内已经发送过相同路径的事件
            let now = SystemTime::now();
            let should_emit = {
                let mut last_events = last_events.lock().unwrap();
                
                if let Some(last_time) = last_events.get(&path) {
                    // 如果距离上次事件不到500ms，忽略
                    if now.duration_since(*last_time).unwrap_or(Duration::ZERO) < Duration::from_millis(500) {
                        false
                    } else {
                        last_events.insert(path.clone(), now);
                        true
                    }
                } else {
                    last_events.insert(path.clone(), now);
                    true
                }
            };

            if should_emit {
                let change_event = FileChangeEvent {
                    path: path.to_string_lossy().to_string(),
                    change_type: change_type.to_string(),
                    timestamp: now
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap()
                        .as_secs(),
                };

                // 发送事件到前端
                if let Err(e) = app_handle.emit("file-system-change", &change_event) {
                    log::error!("Failed to emit file change event: {}", e);
                } else {
                    log::debug!(
                        "Emitted file change event: {} ({})",
                        change_event.path,
                        change_event.change_type
                    );
                }
            }
        }
    }

    /// 获取当前监听的路径列表
    pub fn get_watched_paths(&self) -> Vec<String> {
        let watchers = self.watchers.lock().unwrap();
        watchers.keys().cloned().collect()
    }
}

// 全局文件监听管理器状态
pub struct FileWatcherState(pub Arc<Mutex<Option<FileWatcherManager>>>);

impl FileWatcherState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(None)))
    }

    pub fn init(&self, app_handle: AppHandle) {
        let mut state = self.0.lock().unwrap();
        *state = Some(FileWatcherManager::new(app_handle));
    }

    pub fn with_manager<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&FileWatcherManager) -> Result<R, String>,
    {
        let state = self.0.lock().unwrap();
        match state.as_ref() {
            Some(manager) => f(manager),
            None => Err("File watcher manager not initialized".to_string()),
        }
    }
}