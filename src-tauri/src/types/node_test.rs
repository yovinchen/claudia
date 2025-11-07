/// 节点测试数据结构
///
/// 统一的节点连通性测试结果类型，用于替代分散在各模块的重复定义

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 节点测试状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TestStatus {
    /// 测试成功
    Success,
    /// 测试失败
    Failure,
    /// 超时
    Timeout,
}

impl TestStatus {
    /// 判断测试是否成功
    pub fn is_success(&self) -> bool {
        matches!(self, TestStatus::Success)
    }

    /// 判断测试是否失败
    #[allow(dead_code)]
    pub fn is_failure(&self) -> bool {
        !self.is_success()
    }

    /// 转换为字符串
    #[allow(dead_code)]
    pub fn as_str(&self) -> &'static str {
        match self {
            TestStatus::Success => "success",
            TestStatus::Failure => "failure",
            TestStatus::Timeout => "timeout",
        }
    }
}

/// 统一的节点测试结果
///
/// 整合了之前分散在 relay_adapters.rs, api_nodes.rs, packycode_nodes.rs 中的
/// ConnectionTestResult 和 NodeTestResult
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeTestResult {
    /// 节点 ID（可选，用于数据库查询）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,

    /// 节点名称（可选，用于显示）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node_name: Option<String>,

    /// 节点 URL
    pub url: String,

    /// 测试状态
    pub status: TestStatus,

    /// 响应时间（毫秒）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_time_ms: Option<u64>,

    /// 状态消息
    pub message: String,

    /// 错误详情（失败时提供）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_details: Option<String>,

    /// 额外元数据（用于扩展）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

impl NodeTestResult {
    /// 创建成功的测试结果
    ///
    /// # Example
    /// ```
    /// use claudia_lib::types::node_test::NodeTestResult;
    ///
    /// let result = NodeTestResult::success(
    ///     "https://api.example.com".to_string(),
    ///     150
    /// );
    /// assert!(result.status.is_success());
    /// assert_eq!(result.response_time_ms, Some(150));
    /// ```
    #[allow(dead_code)]
    pub fn success(url: String, response_time: u64) -> Self {
        Self {
            node_id: None,
            node_name: None,
            url,
            status: TestStatus::Success,
            response_time_ms: Some(response_time),
            message: "连接成功".to_string(),
            error_details: None,
            metadata: None,
        }
    }

    /// 创建成功的测试结果（带自定义消息）
    pub fn success_with_message(url: String, response_time: u64, message: String) -> Self {
        Self {
            node_id: None,
            node_name: None,
            url,
            status: TestStatus::Success,
            response_time_ms: Some(response_time),
            message,
            error_details: None,
            metadata: None,
        }
    }

    /// 创建失败的测试结果
    ///
    /// # Example
    /// ```
    /// use claudia_lib::types::node_test::NodeTestResult;
    ///
    /// let result = NodeTestResult::failure(
    ///     "https://api.example.com".to_string(),
    ///     "Connection refused".to_string()
    /// );
    /// assert!(result.status.is_failure());
    /// ```
    pub fn failure(url: String, error: String) -> Self {
        Self {
            node_id: None,
            node_name: None,
            url,
            status: TestStatus::Failure,
            response_time_ms: None,
            message: "连接失败".to_string(),
            error_details: Some(error),
            metadata: None,
        }
    }

    /// 创建失败的测试结果（带响应时间）
    pub fn failure_with_time(url: String, response_time: u64, error: String) -> Self {
        Self {
            node_id: None,
            node_name: None,
            url,
            status: TestStatus::Failure,
            response_time_ms: Some(response_time),
            message: "连接失败".to_string(),
            error_details: Some(error),
            metadata: None,
        }
    }

    /// 创建超时的测试结果
    ///
    /// # Example
    /// ```
    /// use claudia_lib::types::node_test::NodeTestResult;
    ///
    /// let result = NodeTestResult::timeout(
    ///     "https://api.example.com".to_string(),
    ///     5000
    /// );
    /// assert_eq!(result.status, TestStatus::Timeout);
    /// ```
    pub fn timeout(url: String, timeout_ms: u64) -> Self {
        Self {
            node_id: None,
            node_name: None,
            url,
            status: TestStatus::Timeout,
            response_time_ms: Some(timeout_ms),
            message: "连接超时".to_string(),
            error_details: Some(format!("请求超过 {} 毫秒未响应", timeout_ms)),
            metadata: None,
        }
    }

    /// 设置节点 ID
    #[allow(dead_code)]
    pub fn with_node_id(mut self, node_id: String) -> Self {
        self.node_id = Some(node_id);
        self
    }

    /// 设置节点名称
    #[allow(dead_code)]
    pub fn with_node_name(mut self, node_name: String) -> Self {
        self.node_name = Some(node_name);
        self
    }

    /// 设置元数据
    #[allow(dead_code)]
    pub fn with_metadata(mut self, metadata: HashMap<String, serde_json::Value>) -> Self {
        self.metadata = Some(metadata);
        self
    }

    /// 添加单个元数据项
    #[allow(dead_code)]
    pub fn add_metadata(mut self, key: String, value: serde_json::Value) -> Self {
        if self.metadata.is_none() {
            self.metadata = Some(HashMap::new());
        }
        if let Some(ref mut meta) = self.metadata {
            meta.insert(key, value);
        }
        self
    }

    /// 判断测试是否成功
    pub fn is_success(&self) -> bool {
        self.status.is_success()
    }

    /// 判断测试是否失败
    #[allow(dead_code)]
    pub fn is_failure(&self) -> bool {
        self.status.is_failure()
    }

    /// 获取响应时间（如果有）
    #[allow(dead_code)]
    pub fn response_time(&self) -> Option<u64> {
        self.response_time_ms
    }

    /// 获取错误信息（如果有）
    #[allow(dead_code)]
    pub fn error(&self) -> Option<&str> {
        self.error_details.as_deref()
    }
}

/// 批量测试结果统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchTestSummary {
    /// 总测试数
    pub total: usize,
    /// 成功数
    pub success: usize,
    /// 失败数
    pub failure: usize,
    /// 超时数
    pub timeout: usize,
    /// 平均响应时间（毫秒）
    pub avg_response_time: Option<f64>,
    /// 最快响应时间（毫秒）
    pub min_response_time: Option<u64>,
    /// 最慢响应时间（毫秒）
    pub max_response_time: Option<u64>,
}

impl BatchTestSummary {
    /// 从测试结果列表生成统计摘要
    #[allow(dead_code)]
    pub fn from_results(results: &[NodeTestResult]) -> Self {
        let total = results.len();
        let success = results.iter().filter(|r| r.is_success()).count();
        let timeout = results
            .iter()
            .filter(|r| r.status == TestStatus::Timeout)
            .count();
        let failure = total - success;

        let response_times: Vec<u64> = results
            .iter()
            .filter_map(|r| r.response_time_ms)
            .collect();

        let avg_response_time = if !response_times.is_empty() {
            let sum: u64 = response_times.iter().sum();
            Some(sum as f64 / response_times.len() as f64)
        } else {
            None
        };

        let min_response_time = response_times.iter().copied().min();
        let max_response_time = response_times.iter().copied().max();

        Self {
            total,
            success,
            failure,
            timeout,
            avg_response_time,
            min_response_time,
            max_response_time,
        }
    }

    /// 获取成功率（百分比）
    #[allow(dead_code)]
    pub fn success_rate(&self) -> f64 {
        if self.total == 0 {
            0.0
        } else {
            (self.success as f64 / self.total as f64) * 100.0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_success_result() {
        let result = NodeTestResult::success("https://api.example.com".to_string(), 150);
        assert!(result.is_success());
        assert_eq!(result.response_time(), Some(150));
        assert!(result.error().is_none());
        assert_eq!(result.status, TestStatus::Success);
    }

    #[test]
    fn test_failure_result() {
        let result = NodeTestResult::failure(
            "https://api.example.com".to_string(),
            "Connection refused".to_string(),
        );
        assert!(result.is_failure());
        assert_eq!(result.error(), Some("Connection refused"));
        assert_eq!(result.status, TestStatus::Failure);
    }

    #[test]
    fn test_timeout_result() {
        let result = NodeTestResult::timeout("https://api.example.com".to_string(), 5000);
        assert_eq!(result.status, TestStatus::Timeout);
        assert!(result.error().is_some());
    }

    #[test]
    fn test_builder_pattern() {
        let result = NodeTestResult::success("https://api.example.com".to_string(), 100)
            .with_node_id("node-123".to_string())
            .with_node_name("Test Node".to_string())
            .add_metadata("region".to_string(), serde_json::json!("us-west"));

        assert_eq!(result.node_id, Some("node-123".to_string()));
        assert_eq!(result.node_name, Some("Test Node".to_string()));
        assert!(result.metadata.is_some());
    }

    #[test]
    fn test_batch_summary() {
        let results = vec![
            NodeTestResult::success("http://1".to_string(), 100),
            NodeTestResult::success("http://2".to_string(), 200),
            NodeTestResult::failure("http://3".to_string(), "error".to_string()),
            NodeTestResult::timeout("http://4".to_string(), 5000),
        ];

        let summary = BatchTestSummary::from_results(&results);
        assert_eq!(summary.total, 4);
        assert_eq!(summary.success, 2);
        assert_eq!(summary.failure, 2);
        assert_eq!(summary.timeout, 1);
        assert_eq!(summary.success_rate(), 50.0);
        assert!(summary.avg_response_time.is_some());
    }

    #[test]
    fn test_test_status() {
        assert!(TestStatus::Success.is_success());
        assert!(!TestStatus::Failure.is_success());
        assert!(TestStatus::Failure.is_failure());
        assert_eq!(TestStatus::Success.as_str(), "success");
        assert_eq!(TestStatus::Timeout.as_str(), "timeout");
    }
}
