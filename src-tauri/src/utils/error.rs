/// 错误处理工具模块
///
/// 提供统一的错误转换函数，减少样板代码

use anyhow::Result;

/// 将 anyhow::Result 转换为 Result<T, String>
///
/// 这是最常用的错误转换函数，用于 Tauri 命令的返回值
///
/// # Example
/// ```
/// use claudia_lib::utils::error::to_string_error;
/// use anyhow::Result;
///
/// fn some_operation() -> Result<String> {
///     Ok("success".to_string())
/// }
///
/// #[tauri::command]
/// async fn my_command() -> Result<String, String> {
///     to_string_error(some_operation())
/// }
/// ```
pub fn to_string_error<T>(result: Result<T>) -> Result<T, String> {
    result.map_err(|e| e.to_string())
}

/// 将 anyhow::Result 转换为 Result<T, String>，并添加上下文信息
///
/// # Example
/// ```
/// use claudia_lib::utils::error::to_string_error_ctx;
/// use anyhow::Result;
///
/// fn database_operation() -> Result<String> {
///     Ok("data".to_string())
/// }
///
/// #[tauri::command]
/// async fn get_data() -> Result<String, String> {
///     to_string_error_ctx(
///         database_operation(),
///         "获取数据失败"
///     )
/// }
/// ```
pub fn to_string_error_ctx<T>(result: Result<T>, context: &str) -> Result<T, String> {
    result.map_err(|e| format!("{}: {}", context, e))
}

/// 将 rusqlite::Error 转换为用户友好的错误消息
///
/// # Example
/// ```
/// use claudia_lib::utils::error::db_error_to_string;
/// use rusqlite::{Connection, Error};
///
/// fn query_database() -> Result<String, String> {
///     let conn = Connection::open("test.db")
///         .map_err(db_error_to_string)?;
///     // ...
///     Ok("result".to_string())
/// }
/// ```
pub fn db_error_to_string(e: rusqlite::Error) -> String {
    match e {
        rusqlite::Error::QueryReturnedNoRows => "查询未返回任何行".to_string(),
        rusqlite::Error::SqliteFailure(err, msg) => {
            let code = err.extended_code;
            let description = msg.unwrap_or_else(|| "未知数据库错误".to_string());
            format!("数据库错误 (代码 {}): {}", code, description)
        }
        rusqlite::Error::InvalidColumnType(idx, name, type_) => {
            format!("列类型错误: 列 {} (索引 {}) 的类型为 {:?}", name, idx, type_)
        }
        rusqlite::Error::InvalidColumnIndex(idx) => {
            format!("无效的列索引: {}", idx)
        }
        rusqlite::Error::InvalidColumnName(name) => {
            format!("无效的列名: {}", name)
        }
        rusqlite::Error::ExecuteReturnedResults => "执行语句返回了结果（应使用查询）".to_string(),
        rusqlite::Error::InvalidQuery => "无效的查询语句".to_string(),
        _ => format!("数据库错误: {}", e),
    }
}

/// 将 reqwest::Error 转换为用户友好的错误消息
///
/// # Example
/// ```
/// use claudia_lib::utils::error::http_error_to_string;
/// use reqwest::Error;
///
/// async fn fetch_data(url: &str) -> Result<String, String> {
///     let response = reqwest::get(url)
///         .await
///         .map_err(http_error_to_string)?;
///     response.text().await.map_err(http_error_to_string)
/// }
/// ```
pub fn http_error_to_string(e: reqwest::Error) -> String {
    if e.is_timeout() {
        format!("请求超时: {}", e)
    } else if e.is_connect() {
        format!("连接失败: {}", e)
    } else if e.is_status() {
        format!(
            "HTTP 错误: {}",
            e.status()
                .map(|s| s.to_string())
                .unwrap_or_else(|| "未知状态".to_string())
        )
    } else if e.is_decode() {
        format!("解码响应失败: {}", e)
    } else if e.is_request() {
        format!("构建请求失败: {}", e)
    } else {
        format!("HTTP 请求错误: {}", e)
    }
}

/// 将 serde_json::Error 转换为用户友好的错误消息
pub fn json_error_to_string(e: serde_json::Error) -> String {
    format!("JSON 解析错误: {}", e)
}

/// 将 std::io::Error 转换为用户友好的错误消息
pub fn io_error_to_string(e: std::io::Error) -> String {
    use std::io::ErrorKind;

    match e.kind() {
        ErrorKind::NotFound => format!("文件或目录不存在: {}", e),
        ErrorKind::PermissionDenied => format!("权限不足: {}", e),
        ErrorKind::AlreadyExists => format!("文件或目录已存在: {}", e),
        ErrorKind::WouldBlock => "操作将会阻塞".to_string(),
        ErrorKind::InvalidInput => format!("无效的输入: {}", e),
        ErrorKind::InvalidData => format!("无效的数据: {}", e),
        ErrorKind::TimedOut => "操作超时".to_string(),
        ErrorKind::WriteZero => "无法写入数据".to_string(),
        ErrorKind::Interrupted => "操作被中断".to_string(),
        ErrorKind::UnexpectedEof => "意外的文件结束".to_string(),
        _ => format!("IO 错误: {}", e),
    }
}

/// 组合多个错误消息
///
/// # Example
/// ```
/// use claudia_lib::utils::error::combine_errors;
///
/// let errors = vec![
///     "错误 1: 连接失败".to_string(),
///     "错误 2: 超时".to_string(),
/// ];
/// let combined = combine_errors(&errors);
/// // 输出: "发生 2 个错误: 错误 1: 连接失败; 错误 2: 超时"
/// ```
pub fn combine_errors(errors: &[String]) -> String {
    if errors.is_empty() {
        "无错误".to_string()
    } else if errors.len() == 1 {
        errors[0].clone()
    } else {
        format!("发生 {} 个错误: {}", errors.len(), errors.join("; "))
    }
}

/// 创建带前缀的错误消息
pub fn prefixed_error(prefix: &str, error: &str) -> String {
    format!("{}: {}", prefix, error)
}

/// 为错误添加建议
pub fn error_with_suggestion(error: &str, suggestion: &str) -> String {
    format!("{}。建议: {}", error, suggestion)
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::anyhow;

    #[test]
    fn test_to_string_error() {
        let result: Result<String> = Err(anyhow!("测试错误"));
        let converted = to_string_error(result);
        assert!(converted.is_err());
        assert_eq!(converted.unwrap_err(), "测试错误");
    }

    #[test]
    fn test_to_string_error_ctx() {
        let result: Result<String> = Err(anyhow!("原始错误"));
        let converted = to_string_error_ctx(result, "操作失败");
        assert!(converted.is_err());
        assert_eq!(converted.unwrap_err(), "操作失败: 原始错误");
    }

    #[test]
    fn test_db_error_to_string() {
        let error = rusqlite::Error::QueryReturnedNoRows;
        assert_eq!(db_error_to_string(error), "查询未返回任何行");
    }

    #[test]
    fn test_combine_errors() {
        let errors = vec!["错误1".to_string(), "错误2".to_string()];
        let combined = combine_errors(&errors);
        assert!(combined.contains("错误1"));
        assert!(combined.contains("错误2"));
        assert!(combined.contains("2 个错误"));
    }

    #[test]
    fn test_prefixed_error() {
        let error = prefixed_error("数据库", "连接失败");
        assert_eq!(error, "数据库: 连接失败");
    }

    #[test]
    fn test_error_with_suggestion() {
        let error = error_with_suggestion("无法连接到服务器", "检查网络连接");
        assert_eq!(error, "无法连接到服务器。建议: 检查网络连接");
    }

    #[test]
    fn test_io_error_conversions() {
        let error = std::io::Error::new(std::io::ErrorKind::NotFound, "文件不存在");
        let converted = io_error_to_string(error);
        assert!(converted.contains("文件或目录不存在"));
    }
}
