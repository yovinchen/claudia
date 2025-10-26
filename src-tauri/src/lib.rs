// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// Declare modules
pub mod checkpoint;
pub mod claude_binary;
pub mod claude_config;
pub mod commands;
pub mod file_watcher;
pub mod http_client;
pub mod i18n;
pub mod process;
pub mod types;
pub mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
