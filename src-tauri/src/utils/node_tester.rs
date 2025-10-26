/// 通用节点测试器
///
/// 提供统一的节点连通性测试功能，替代分散在各模块的重复实现

use crate::http_client::{self, ClientConfig};
use crate::types::node_test::{NodeTestResult, TestStatus};
use std::time::Instant;

/// 测试单个节点的连通性
///
/// 使用 HEAD 请求测试节点是否可访问，这是最轻量的测试方式
///
/// # Arguments
/// * `url` - 节点 URL
/// * `timeout_ms` - 超时时间（毫秒）
///
/// # Example
/// ```
/// use claudia_lib::utils::node_tester::test_node_connectivity;
///
/// #[tokio::main]
/// async fn main() {
///     let result = test_node_connectivity("https://api.example.com", 5000).await;
///     if result.is_success() {
///         println!("节点可用，响应时间: {}ms", result.response_time().unwrap());
///     }
/// }
/// ```
pub async fn test_node_connectivity(url: &str, timeout_ms: u64) -> NodeTestResult {
    let start = Instant::now();

    // 创建快速客户端
    let client = match http_client::create_client(
        ClientConfig::new()
            .timeout(timeout_ms / 1000)
            .accept_invalid_certs(true), // 节点测速允许自签名证书
    ) {
        Ok(c) => c,
        Err(e) => {
            return NodeTestResult::failure(
                url.to_string(),
                format!("创建 HTTP 客户端失败: {}", e),
            );
        }
    };

    // 使用 HEAD 请求测试连通性
    match client.head(url).send().await {
        Ok(response) => {
            let response_time = start.elapsed().as_millis() as u64;
            let status_code = response.status();

            // 2xx, 3xx, 4xx 都视为成功（说明服务器在线）
            // 只有 5xx 或网络错误才视为失败
            if status_code.is_success()
                || status_code.is_redirection()
                || status_code.is_client_error()
            {
                NodeTestResult::success_with_message(
                    url.to_string(),
                    response_time,
                    format!("连接成功 (HTTP {})", status_code.as_u16()),
                )
            } else {
                NodeTestResult::failure_with_time(
                    url.to_string(),
                    response_time,
                    format!("服务器错误 (HTTP {})", status_code.as_u16()),
                )
            }
        }
        Err(e) => {
            let response_time = start.elapsed().as_millis() as u64;

            // 根据错误类型返回不同的结果
            if e.is_timeout() {
                NodeTestResult::timeout(url.to_string(), response_time)
            } else if e.is_connect() {
                NodeTestResult::failure_with_time(
                    url.to_string(),
                    response_time,
                    format!("无法连接到服务器: {}", e),
                )
            } else {
                NodeTestResult::failure_with_time(
                    url.to_string(),
                    response_time,
                    format!("网络错误: {}", e),
                )
            }
        }
    }
}

/// 批量测试节点连通性（并发）
///
/// 同时测试多个节点，提高测试效率
///
/// # Arguments
/// * `urls` - 节点 URL 列表
/// * `timeout_ms` - 每个节点的超时时间（毫秒）
///
/// # Example
/// ```
/// use claudia_lib::utils::node_tester::test_nodes_batch;
///
/// #[tokio::main]
/// async fn main() {
///     let urls = vec![
///         "https://api1.example.com".to_string(),
///         "https://api2.example.com".to_string(),
///     ];
///     let results = test_nodes_batch(urls, 5000).await;
///     println!("测试完成，成功: {}", results.iter().filter(|r| r.is_success()).count());
/// }
/// ```
pub async fn test_nodes_batch(urls: Vec<String>, timeout_ms: u64) -> Vec<NodeTestResult> {
    // 创建所有测试任务
    let futures: Vec<_> = urls
        .iter()
        .map(|url| test_node_connectivity(url, timeout_ms))
        .collect();

    // 并发执行所有测试
    futures::future::join_all(futures).await
}

/// 批量测试节点连通性（顺序）
///
/// 按顺序测试节点，适用于需要限制并发的场景
///
/// # Arguments
/// * `urls` - 节点 URL 列表
/// * `timeout_ms` - 每个节点的超时时间（毫秒）
pub async fn test_nodes_sequential(urls: Vec<String>, timeout_ms: u64) -> Vec<NodeTestResult> {
    let mut results = Vec::new();

    for url in urls {
        let result = test_node_connectivity(&url, timeout_ms).await;
        results.push(result);
    }

    results
}

/// 查找最快的节点
///
/// 从测试结果中找出响应时间最短的成功节点
///
/// # Example
/// ```
/// use claudia_lib::utils::node_tester::{test_nodes_batch, find_fastest_node};
///
/// #[tokio::main]
/// async fn main() {
///     let urls = vec!["https://api1.com".to_string(), "https://api2.com".to_string()];
///     let results = test_nodes_batch(urls, 5000).await;
///     if let Some(fastest) = find_fastest_node(&results) {
///         println!("最快节点: {}, 响应时间: {}ms", fastest.url, fastest.response_time().unwrap());
///     }
/// }
/// ```
pub fn find_fastest_node(results: &[NodeTestResult]) -> Option<&NodeTestResult> {
    results
        .iter()
        .filter(|r| r.is_success() && r.response_time().is_some())
        .min_by_key(|r| r.response_time().unwrap())
}

/// 过滤成功的节点
pub fn filter_successful_nodes(results: &[NodeTestResult]) -> Vec<&NodeTestResult> {
    results.iter().filter(|r| r.is_success()).collect()
}

/// 过滤失败的节点
pub fn filter_failed_nodes(results: &[NodeTestResult]) -> Vec<&NodeTestResult> {
    results.iter().filter(|r| r.is_failure()).collect()
}

/// 按响应时间排序（从快到慢）
pub fn sort_by_response_time(results: &mut [NodeTestResult]) {
    results.sort_by(|a, b| {
        // 成功的节点优先
        match (a.status, b.status) {
            (TestStatus::Success, TestStatus::Success) => {
                // 都成功，按响应时间排序
                match (a.response_time_ms, b.response_time_ms) {
                    (Some(t1), Some(t2)) => t1.cmp(&t2),
                    (Some(_), None) => std::cmp::Ordering::Less,
                    (None, Some(_)) => std::cmp::Ordering::Greater,
                    (None, None) => std::cmp::Ordering::Equal,
                }
            }
            (TestStatus::Success, _) => std::cmp::Ordering::Less,
            (_, TestStatus::Success) => std::cmp::Ordering::Greater,
            _ => {
                // 都失败，按响应时间排序
                match (a.response_time_ms, b.response_time_ms) {
                    (Some(t1), Some(t2)) => t1.cmp(&t2),
                    (Some(_), None) => std::cmp::Ordering::Less,
                    (None, Some(_)) => std::cmp::Ordering::Greater,
                    (None, None) => std::cmp::Ordering::Equal,
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_invalid_url() {
        let result = test_node_connectivity("invalid-url", 1000).await;
        assert!(result.is_failure());
    }

    #[test]
    fn test_sort_by_response_time() {
        let mut results = vec![
            NodeTestResult::success("http://3".to_string(), 300),
            NodeTestResult::success("http://1".to_string(), 100),
            NodeTestResult::failure("http://4".to_string(), "error".to_string()),
            NodeTestResult::success("http://2".to_string(), 200),
        ];

        sort_by_response_time(&mut results);

        // 成功的节点应该在前面，且按响应时间排序
        assert_eq!(results[0].url, "http://1");
        assert_eq!(results[1].url, "http://2");
        assert_eq!(results[2].url, "http://3");
        assert_eq!(results[3].url, "http://4");
    }

    #[test]
    fn test_find_fastest_node() {
        let results = vec![
            NodeTestResult::success("http://1".to_string(), 200),
            NodeTestResult::success("http://2".to_string(), 100), // 最快
            NodeTestResult::failure("http://3".to_string(), "error".to_string()),
        ];

        let fastest = find_fastest_node(&results);
        assert!(fastest.is_some());
        assert_eq!(fastest.unwrap().url, "http://2");
    }

    #[test]
    fn test_filter_nodes() {
        let results = vec![
            NodeTestResult::success("http://1".to_string(), 100),
            NodeTestResult::failure("http://2".to_string(), "error".to_string()),
            NodeTestResult::success("http://3".to_string(), 200),
        ];

        let successful = filter_successful_nodes(&results);
        assert_eq!(successful.len(), 2);

        let failed = filter_failed_nodes(&results);
        assert_eq!(failed.len(), 1);
    }
}
