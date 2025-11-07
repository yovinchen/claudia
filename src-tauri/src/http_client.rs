/// 公共 HTTP 客户端模块
///
/// 提供统一的 HTTP 客户端创建接口，消除代码重复
/// 支持多种预设配置和自定义配置

use anyhow::Result;
use reqwest::Client;
use std::time::Duration;

/// HTTP 客户端配置
#[derive(Debug, Clone)]
pub struct ClientConfig {
    /// 超时时间（秒）
    pub timeout_secs: u64,
    /// 是否接受无效证书（用于开发/测试）
    pub accept_invalid_certs: bool,
    /// 是否使用系统代理
    pub use_proxy: bool,
    /// 自定义 User-Agent
    pub user_agent: Option<String>,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            timeout_secs: 10,
            accept_invalid_certs: false,
            use_proxy: true,
            user_agent: Some("Claudia/1.0".to_string()),
        }
    }
}

impl ClientConfig {
    /// 创建新的配置
    pub fn new() -> Self {
        Self::default()
    }

    /// 设置超时时间
    pub fn timeout(mut self, secs: u64) -> Self {
        self.timeout_secs = secs;
        self
    }

    /// 设置是否接受无效证书
    pub fn accept_invalid_certs(mut self, accept: bool) -> Self {
        self.accept_invalid_certs = accept;
        self
    }

    /// 设置是否使用代理
    pub fn use_proxy(mut self, use_proxy: bool) -> Self {
        self.use_proxy = use_proxy;
        self
    }

    /// 设置 User-Agent
    pub fn user_agent(mut self, user_agent: impl Into<String>) -> Self {
        self.user_agent = Some(user_agent.into());
        self
    }
}

/// 创建 HTTP 客户端（使用自定义配置）
///
/// # Example
/// ```
/// use claudia_lib::http_client::{ClientConfig, create_client};
///
/// let config = ClientConfig::new()
///     .timeout(5)
///     .accept_invalid_certs(true);
/// let client = create_client(config)?;
/// ```
pub fn create_client(config: ClientConfig) -> Result<Client> {
    let mut builder = Client::builder().timeout(Duration::from_secs(config.timeout_secs));

    if config.accept_invalid_certs {
        builder = builder.danger_accept_invalid_certs(true);
    }

    if !config.use_proxy {
        builder = builder.no_proxy();
    }

    if let Some(user_agent) = config.user_agent {
        builder = builder.user_agent(user_agent);
    }

    Ok(builder.build()?)
}

/// 创建默认 HTTP 客户端
///
/// 配置:
/// - 超时: 10 秒
/// - 接受无效证书: 否
/// - 使用代理: 是
/// - User-Agent: "Claudia/1.0"
///
/// # Example
/// ```
/// use claudia_lib::http_client::default_client;
///
/// let client = default_client()?;
/// ```
pub fn default_client() -> Result<Client> {
    create_client(ClientConfig::default())
}

/// 创建快速客户端（用于节点测速）
///
/// 配置:
/// - 超时: 3 秒
/// - 接受无效证书: 是
/// - 使用代理: 是
/// - User-Agent: "Claudia/1.0"
///
/// # Example
/// ```
/// use claudia_lib::http_client::fast_client;
///
/// let client = fast_client()?;
/// ```
#[allow(dead_code)]
pub fn fast_client() -> Result<Client> {
    create_client(
        ClientConfig::default()
            .timeout(3)
            .accept_invalid_certs(true),
    )
}

/// 创建安全客户端（用于 PackyCode API）
///
/// 配置:
/// - 超时: 30 秒
/// - 接受无效证书: 否
/// - 使用代理: 否（禁用代理）
/// - User-Agent: "Claudia"
///
/// # Example
/// ```
/// use claudia_lib::http_client::secure_client;
///
/// let client = secure_client()?;
/// ```
pub fn secure_client() -> Result<Client> {
    create_client(
        ClientConfig::default()
            .timeout(30)
            .use_proxy(false)
            .user_agent("Claudia"),
    )
}

/// 创建长超时客户端（用于大文件传输等）
///
/// 配置:
/// - 超时: 60 秒
/// - 接受无效证书: 否
/// - 使用代理: 是
/// - User-Agent: "Claudia/1.0"
#[allow(dead_code)]
pub fn long_timeout_client() -> Result<Client> {
    create_client(ClientConfig::default().timeout(60))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = ClientConfig::default();
        assert_eq!(config.timeout_secs, 10);
        assert!(!config.accept_invalid_certs);
        assert!(config.use_proxy);
        assert_eq!(config.user_agent, Some("Claudia/1.0".to_string()));
    }

    #[test]
    fn test_config_builder() {
        let config = ClientConfig::new()
            .timeout(5)
            .accept_invalid_certs(true)
            .use_proxy(false)
            .user_agent("TestAgent");

        assert_eq!(config.timeout_secs, 5);
        assert!(config.accept_invalid_certs);
        assert!(!config.use_proxy);
        assert_eq!(config.user_agent, Some("TestAgent".to_string()));
    }

    #[test]
    fn test_create_default_client() {
        let result = default_client();
        assert!(result.is_ok());
    }

    #[test]
    fn test_create_fast_client() {
        let result = fast_client();
        assert!(result.is_ok());
    }

    #[test]
    fn test_create_secure_client() {
        let result = secure_client();
        assert!(result.is_ok());
    }

    #[test]
    fn test_create_custom_client() {
        let config = ClientConfig::new().timeout(15).use_proxy(false);
        let result = create_client(config);
        assert!(result.is_ok());
    }
}
