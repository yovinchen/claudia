use tauri::command;
use serde::{Deserialize, Serialize};
use crate::i18n;

#[derive(Debug, Serialize, Deserialize)]
pub struct LanguageSettings {
    pub locale: String,
}

#[command]
pub async fn get_current_language() -> Result<String, String> {
    Ok(i18n::get_current_locale())
}

#[command]
pub async fn set_language(locale: String) -> Result<(), String> {
    i18n::set_locale(&locale)
        .map_err(|e| format!("Failed to set language: {}", e))?;
    
    log::info!("Language changed to: {}", locale);
    Ok(())
}

#[command]
pub async fn get_supported_languages() -> Result<Vec<String>, String> {
    Ok(i18n::SUPPORTED_LOCALES.iter().map(|&s| s.to_string()).collect())
}