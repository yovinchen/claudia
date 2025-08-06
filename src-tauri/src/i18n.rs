use std::sync::{Arc, Mutex, OnceLock};

// 支持的语言
pub const SUPPORTED_LOCALES: &[&str] = &["en-US", "zh-CN"];

// 简化的 I18n 实现，避免线程安全问题
pub struct SimpleI18n {
    current_locale: Arc<Mutex<String>>,
}

impl SimpleI18n {
    pub fn new() -> Self {
        Self {
            current_locale: Arc::new(Mutex::new("en-US".to_string())),
        }
    }

    pub fn set_locale(&self, locale: &str) {
        if SUPPORTED_LOCALES.contains(&locale) {
            if let Ok(mut current) = self.current_locale.lock() {
                *current = locale.to_string();
            }
        }
    }

    pub fn get_current_locale(&self) -> String {
        match self.current_locale.lock() {
            Ok(locale) => locale.clone(),
            Err(_) => "en-US".to_string(),
        }
    }

    pub fn t(&self, key: &str) -> String {
        let locale = self.get_current_locale();
        
        // 简单的翻译映射，避免复杂的 FluentBundle
        match (locale.as_str(), key) {
            // 英文翻译
            ("en-US", "error-failed-to-create") => "Failed to create".to_string(),
            ("en-US", "error-failed-to-update") => "Failed to update".to_string(),
            ("en-US", "error-failed-to-delete") => "Failed to delete".to_string(),
            ("en-US", "agent-not-found") => "Agent not found".to_string(),
            ("en-US", "claude-not-installed") => "Claude Code is not installed".to_string(),
            
            // 中文翻译
            ("zh-CN", "error-failed-to-create") => "创建失败".to_string(),
            ("zh-CN", "error-failed-to-update") => "更新失败".to_string(),
            ("zh-CN", "error-failed-to-delete") => "删除失败".to_string(),
            ("zh-CN", "agent-not-found") => "未找到智能体".to_string(),
            ("zh-CN", "claude-not-installed") => "未安装 Claude Code".to_string(),
            
            // 默认情况
            _ => key.to_string(),
        }
    }
}

// 全局实例
static GLOBAL_I18N: OnceLock<SimpleI18n> = OnceLock::new();

fn get_i18n() -> &'static SimpleI18n {
    GLOBAL_I18N.get_or_init(|| SimpleI18n::new())
}

// 便捷函数用于全局访问
pub fn t(key: &str) -> String {
    get_i18n().t(key)
}

pub fn set_locale(locale: &str) -> Result<(), Box<dyn std::error::Error>> {
    get_i18n().set_locale(locale);
    Ok(())
}

pub fn get_current_locale() -> String {
    get_i18n().get_current_locale()
}