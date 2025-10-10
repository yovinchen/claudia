// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod checkpoint;
mod claude_binary;
mod commands;
mod process;
mod i18n;
mod claude_config;
mod file_watcher;

use checkpoint::state::CheckpointState;
use commands::agents::{
    cleanup_finished_processes, create_agent, delete_agent, execute_agent, export_agent,
    export_agent_to_file, fetch_github_agent_content, fetch_github_agents, get_agent,
    get_agent_run, get_agent_run_with_real_time_metrics, get_claude_binary_path,
    get_live_session_output, get_session_output, get_session_status, import_agent,
    import_agent_from_file, import_agent_from_github, init_database, kill_agent_session,
    list_agent_runs, list_agent_runs_with_metrics, list_agents, list_claude_installations,
    list_running_sessions, load_agent_session_history, set_claude_binary_path, stream_session_output, update_agent, AgentDb,
    get_model_mappings, update_model_mapping,
};
use commands::claude::{
    cancel_claude_execution, check_auto_checkpoint, check_claude_version, cleanup_old_checkpoints,
    clear_checkpoint_manager, continue_claude_code, create_checkpoint, execute_claude_code,
    find_claude_md_files, fork_from_checkpoint, get_checkpoint_diff, get_checkpoint_settings,
    get_checkpoint_state_stats, get_claude_session_output, get_claude_settings, get_project_sessions,
    get_recently_modified_files, get_session_timeline, get_system_prompt, list_checkpoints,
    list_directory_contents, list_projects, list_running_claude_sessions, load_session_history,
    open_new_session, read_claude_md_file, restore_checkpoint, resume_claude_code,
    save_claude_md_file, save_claude_settings, save_system_prompt, search_files,
    track_checkpoint_message, track_session_messages, update_checkpoint_settings,
    get_hooks_config, update_hooks_config, validate_hook_command,
    watch_claude_project_directory, unwatch_claude_project_directory,
    ClaudeProcessState,
};
use commands::mcp::{
    mcp_add, mcp_add_from_claude_desktop, mcp_add_json, mcp_get, mcp_get_server_status, mcp_list,
    mcp_read_project_config, mcp_remove, mcp_reset_project_choices, mcp_save_project_config,
    mcp_serve, mcp_test_connection, mcp_export_servers,
};

use commands::usage::{
    get_session_stats, get_usage_by_date_range, get_usage_details, get_usage_stats,
};
use commands::usage_index::{
    usage_get_summary, usage_import_diffs, usage_scan_index, usage_scan_progress, UsageIndexState,
};
use commands::usage_cache::{
    usage_scan_update, usage_get_stats_cached, usage_clear_cache, usage_force_scan, usage_check_updates, UsageCacheState,
};
use commands::storage::{
    storage_list_tables, storage_read_table, storage_update_row, storage_delete_row,
    storage_insert_row, storage_execute_sql, storage_reset_database,
};
use commands::proxy::{get_proxy_settings, save_proxy_settings, apply_proxy_settings};
use commands::language::{get_current_language, set_language, get_supported_languages};
use commands::relay_stations::{
    relay_stations_list, relay_station_get, relay_station_create, relay_station_update,
    relay_station_delete, relay_station_toggle_enable, relay_station_sync_config,
    relay_station_restore_config, relay_station_get_current_config,
    relay_stations_export, relay_stations_import,
};
use commands::relay_adapters::{
    relay_station_get_info, relay_station_get_user_info,
    relay_station_test_connection, relay_station_get_usage_logs, relay_station_list_tokens,
    relay_station_create_token, relay_station_update_token, relay_station_delete_token,
    packycode_get_user_quota,
};
use commands::packycode_nodes::{
    test_all_packycode_nodes, auto_select_best_node, get_packycode_nodes,
};
use commands::filesystem::{
    read_directory_tree, search_files_by_name, get_file_info, watch_directory,
    read_file, write_file, get_file_tree, unwatch_directory, get_watched_paths,
};
use commands::git::{
    get_git_status, get_git_history, get_git_branches, get_git_diff, get_git_commits,
};
use commands::terminal::{
    create_terminal_session, send_terminal_input, close_terminal_session,
    list_terminal_sessions, resize_terminal, cleanup_terminal_sessions, TerminalState,
};
use commands::ccr::{
    check_ccr_installation, get_ccr_version, get_ccr_service_status, start_ccr_service,
    stop_ccr_service, restart_ccr_service, open_ccr_ui, get_ccr_config_path,
};
use commands::system::flush_dns;
use process::ProcessRegistryState;
use file_watcher::FileWatcherState;
use std::sync::Mutex;
use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri_plugin_log::{Target, TargetKind};

fn main() {
    // Logging is initialized by tauri-plugin-log

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_log::Builder::new()
            .level(log::LevelFilter::Debug)
            .targets([
                Target::new(TargetKind::LogDir { file_name: None }),
                Target::new(TargetKind::Stdout),
            ])
            .build())
        // App menu: include standard Edit actions so OS hotkeys (Undo/Redo/Cut/Copy/Paste/Select All)
        // work across all pages, plus a DevTools toggle.
        .menu(|app| {
            let toggle_devtools = MenuItemBuilder::new("Toggle DevTools")
                .id("toggle-devtools")
                .accelerator("CmdOrCtrl+Alt+I")
                .build(app)
                .unwrap();
            // Create a proper "Edit" submenu (macOS expects standard edit actions under Edit)
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()
                .unwrap();

            MenuBuilder::new(app)
                .item(&edit_menu)
                .separator()
                // DevTools toggle
                .item(&toggle_devtools)
                .build()
        })
        .on_menu_event(|app, event| {
            if event.id() == "toggle-devtools" {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.open_devtools();
                }
            }
        })
        .setup(|app| {
            // Initialize agents database
            let conn = init_database(&app.handle()).expect("Failed to initialize agents database");
            
            // Load and apply proxy settings from the database
            {
                let db = AgentDb(Mutex::new(conn));
                let proxy_settings = match db.0.lock() {
                    Ok(conn) => {
                        // Directly query proxy settings from the database
                        let mut settings = commands::proxy::ProxySettings::default();
                        
                        let keys = vec![
                            ("proxy_enabled", "enabled"),
                            ("proxy_http", "http_proxy"),
                            ("proxy_https", "https_proxy"),
                            ("proxy_no", "no_proxy"),
                            ("proxy_all", "all_proxy"),
                        ];
                        
                        for (db_key, field) in keys {
                            if let Ok(value) = conn.query_row(
                                "SELECT value FROM app_settings WHERE key = ?1",
                                rusqlite::params![db_key],
                                |row| row.get::<_, String>(0),
                            ) {
                                match field {
                                    "enabled" => settings.enabled = value == "true",
                                    "http_proxy" => settings.http_proxy = Some(value).filter(|s| !s.is_empty()),
                                    "https_proxy" => settings.https_proxy = Some(value).filter(|s| !s.is_empty()),
                                    "no_proxy" => settings.no_proxy = Some(value).filter(|s| !s.is_empty()),
                                    "all_proxy" => settings.all_proxy = Some(value).filter(|s| !s.is_empty()),
                                    _ => {}
                                }
                            }
                        }
                        
                        log::info!("Loaded proxy settings: enabled={}", settings.enabled);
                        settings
                    }
                    Err(e) => {
                        log::warn!("Failed to lock database for proxy settings: {}", e);
                        commands::proxy::ProxySettings::default()
                    }
                };
                
                // Apply the proxy settings
                apply_proxy_settings(&proxy_settings);
            }
            
            // Re-open the connection for the app to manage
            let conn = init_database(&app.handle()).expect("Failed to initialize agents database");
            app.manage(AgentDb(Mutex::new(conn)));

            // Initialize checkpoint state
            let checkpoint_state = CheckpointState::new();

            // Set the Claude directory path
            if let Ok(claude_dir) = dirs::home_dir()
                .ok_or_else(|| "Could not find home directory")
                .and_then(|home| {
                    let claude_path = home.join(".claude");
                    claude_path
                        .canonicalize()
                        .map_err(|_| "Could not find ~/.claude directory")
                })
            {
                let state_clone = checkpoint_state.clone();
                tauri::async_runtime::spawn(async move {
                    state_clone.set_claude_dir(claude_dir).await;
                });
            }

            app.manage(checkpoint_state);

            // Initialize process registry
            app.manage(ProcessRegistryState::default());
            
            // Initialize file watcher state
            let file_watcher_state = FileWatcherState::new();
            file_watcher_state.init(app.handle().clone());
            app.manage(file_watcher_state);

            // Initialize Claude process state
            app.manage(ClaudeProcessState::default());

            // Initialize Usage Index state
            app.manage(UsageIndexState::default());
            app.manage(UsageCacheState::default());

            // Initialize Terminal state
            app.manage(TerminalState::default());

            // Optionally auto-open DevTools if env var is set (works in packaged builds)
            if std::env::var("TAURI_OPEN_DEVTOOLS").ok().as_deref() == Some("1") {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.open_devtools();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Claude & Project Management
            list_projects,
            get_project_sessions,
            get_claude_settings,
            open_new_session,
            get_system_prompt,
            check_claude_version,
            save_system_prompt,
            save_claude_settings,
            watch_claude_project_directory,
            unwatch_claude_project_directory,
            find_claude_md_files,
            read_claude_md_file,
            save_claude_md_file,
            load_session_history,
            execute_claude_code,
            continue_claude_code,
            resume_claude_code,
            cancel_claude_execution,
            list_running_claude_sessions,
            get_claude_session_output,
            list_directory_contents,
            search_files,
            get_recently_modified_files,
            get_hooks_config,
            update_hooks_config,
            validate_hook_command,
            
            // Checkpoint Management
            create_checkpoint,
            restore_checkpoint,
            list_checkpoints,
            fork_from_checkpoint,
            get_session_timeline,
            update_checkpoint_settings,
            get_checkpoint_diff,
            track_checkpoint_message,
            track_session_messages,
            check_auto_checkpoint,
            cleanup_old_checkpoints,
            get_checkpoint_settings,
            clear_checkpoint_manager,
            get_checkpoint_state_stats,
            
            // Agent Management
            list_agents,
            create_agent,
            update_agent,
            delete_agent,
            get_agent,
            execute_agent,
            list_agent_runs,
            get_agent_run,
            list_agent_runs_with_metrics,
            get_agent_run_with_real_time_metrics,
            list_running_sessions,
            kill_agent_session,
            get_session_status,
            cleanup_finished_processes,
            get_session_output,
            get_live_session_output,
            stream_session_output,
            load_agent_session_history,
            get_claude_binary_path,
            set_claude_binary_path,
            list_claude_installations,
            export_agent,
            export_agent_to_file,
            import_agent,
            import_agent_from_file,
            fetch_github_agents,
            fetch_github_agent_content,
            import_agent_from_github,
            get_model_mappings,
            update_model_mapping,
            
            // Usage & Analytics
            get_usage_stats,
            get_usage_by_date_range,
            get_usage_details,
            get_session_stats,

            // File Usage Index (SQLite)
            usage_scan_index,
            usage_scan_progress,
            usage_get_summary,
            usage_import_diffs,
            
            // Usage Cache Management
            usage_scan_update,
            usage_get_stats_cached,
            usage_clear_cache,
            usage_force_scan,
            usage_check_updates,
            
            // MCP (Model Context Protocol)
            mcp_add,
            mcp_list,
            mcp_get,
            mcp_remove,
            mcp_add_json,
            mcp_add_from_claude_desktop,
            mcp_serve,
            mcp_test_connection,
            mcp_reset_project_choices,
            mcp_get_server_status,
            mcp_read_project_config,
            mcp_save_project_config,
            mcp_export_servers,
            
            // Storage Management
            storage_list_tables,
            storage_read_table,
            storage_update_row,
            storage_delete_row,
            storage_insert_row,
            storage_execute_sql,
            storage_reset_database,
            
            // Slash Commands
            commands::slash_commands::slash_commands_list,
            commands::slash_commands::slash_command_get,
            commands::slash_commands::slash_command_save,
            commands::slash_commands::slash_command_delete,
            
            // Proxy Settings
            get_proxy_settings,
            save_proxy_settings,
            
            // Language Settings
            get_current_language,
            set_language,
            get_supported_languages,
            
            // Relay Stations
            relay_stations_list,
            relay_station_get,
            relay_station_create,
            relay_station_update,
            relay_station_delete,
            relay_station_toggle_enable,
            relay_station_sync_config,
            relay_station_restore_config,
            relay_station_get_current_config,
            relay_stations_export,
            relay_stations_import,
            relay_station_get_info,
            relay_station_get_user_info,
            relay_station_test_connection,
            relay_station_get_usage_logs,
            relay_station_list_tokens,
            relay_station_create_token,
            relay_station_update_token,
            relay_station_delete_token,
            packycode_get_user_quota,
            
            // PackyCode Nodes
            test_all_packycode_nodes,
            auto_select_best_node,
            get_packycode_nodes,
            
            // File System
            read_directory_tree,
            search_files_by_name,
            get_file_info,
            watch_directory,
            unwatch_directory,
            get_watched_paths,
            read_file,
            write_file,
            get_file_tree,
            
            // Git
            get_git_status,
            get_git_history,
            get_git_branches,
            get_git_diff,
            get_git_commits,
            
            // Terminal
            create_terminal_session,
            send_terminal_input,
            close_terminal_session,
            list_terminal_sessions,
            resize_terminal,
            cleanup_terminal_sessions,
            
            // CCR (Claude Code Router)
            check_ccr_installation,
            get_ccr_version,
            get_ccr_service_status,
            start_ccr_service,
            stop_ccr_service,
            restart_ccr_service,
            open_ccr_ui,
            get_ccr_config_path,
            
            // System utilities
            flush_dns,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
