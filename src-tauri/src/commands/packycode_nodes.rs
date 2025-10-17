use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use tauri::command;

/// PackyCode 节点类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeType {
    Direct,    // 直连节点
    Backup,    // 备用节点
    Emergency, // 紧急节点（非紧急情况不要使用）
}

/// PackyCode 节点信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackycodeNode {
    pub name: String,
    pub url: String,
    pub node_type: NodeType,
    pub description: String,
    pub response_time: Option<u64>, // 响应时间（毫秒）
    pub available: Option<bool>,    // 是否可用
}

/// 节点测速结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeSpeedTestResult {
    pub node: PackycodeNode,
    pub response_time: u64,
    pub success: bool,
    pub error: Option<String>,
}

/// 获取所有 PackyCode 节点
pub fn get_all_nodes() -> Vec<PackycodeNode> {
    vec![
        // 公交车节点 (Bus Service)
        PackycodeNode {
            name: "公交车默认节点".to_string(),
            url: "https://api.packycode.com".to_string(),
            node_type: NodeType::Direct,
            description: "默认公交车直连节点".to_string(),
            response_time: None,
            available: None,
        },
        PackycodeNode {
            name: "公交车 HK-CN2".to_string(),
            url: "https://api-hk-cn2.packycode.com".to_string(),
            node_type: NodeType::Direct,
            description: "香港 CN2 线路（公交车）".to_string(),
            response_time: None,
            available: None,
        },
        PackycodeNode {
            name: "公交车 HK-G".to_string(),
            url: "https://api-hk-g.packycode.com".to_string(),
            node_type: NodeType::Direct,
            description: "香港 G 线路（公交车）".to_string(),
            response_time: None,
            available: None,
        },
        PackycodeNode {
            name: "公交车 CF-Pro".to_string(),
            url: "https://api-cf-pro.packycode.com".to_string(),
            node_type: NodeType::Direct,
            description: "CloudFlare Pro 线路（公交车）".to_string(),
            response_time: None,
            available: None,
        },
        PackycodeNode {
            name: "公交车 US-CN2".to_string(),
            url: "https://api-us-cn2.packycode.com".to_string(),
            node_type: NodeType::Direct,
            description: "美国 CN2 线路（公交车）".to_string(),
            response_time: None,
            available: None,
        },
        // 滴滴车节点 (Taxi Service)
        PackycodeNode {
            name: "滴滴车默认节点".to_string(),
            url: "https://share-api.packycode.com".to_string(),
            node_type: NodeType::Direct,
            description: "默认滴滴车直连节点".to_string(),
            response_time: None,
            available: None,
        },
        PackycodeNode {
            name: "滴滴车 HK-CN2".to_string(),
            url: "https://share-api-hk-cn2.packycode.com".to_string(),
            node_type: NodeType::Direct,
            description: "香港 CN2 线路（滴滴车）".to_string(),
            response_time: None,
            available: None,
        },
        PackycodeNode {
            name: "滴滴车 HK-G".to_string(),
            url: "https://share-api-hk-g.packycode.com".to_string(),
            node_type: NodeType::Direct,
            description: "香港 G 线路（滴滴车）".to_string(),
            response_time: None,
            available: None,
        },
        PackycodeNode {
            name: "滴滴车 CF-Pro".to_string(),
            url: "https://share-api-cf-pro.packycode.com".to_string(),
            node_type: NodeType::Direct,
            description: "CloudFlare Pro 线路（滴滴车）".to_string(),
            response_time: None,
            available: None,
        },
        PackycodeNode {
            name: "滴滴车 US-CN2".to_string(),
            url: "https://share-api-us-cn2.packycode.com".to_string(),
            node_type: NodeType::Direct,
            description: "美国 CN2 线路（滴滴车）".to_string(),
            response_time: None,
            available: None,
        },
    ]
}

/// 测试单个节点速度（仅测试网络延时，不需要认证）
async fn test_node_speed(node: &PackycodeNode) -> NodeSpeedTestResult {
    let client = Client::builder()
        .timeout(Duration::from_secs(3)) // 减少超时时间
        .danger_accept_invalid_certs(true) // 接受自签名证书
        .build()
        .unwrap_or_else(|_| Client::new());

    let start_time = Instant::now();

    // 使用 GET 请求到根路径，这是最简单的 ping 测试
    // 不需要 token，只测试网络延迟
    let url = format!("{}/", node.url.trim_end_matches('/'));

    match client
        .get(&url)
        .timeout(Duration::from_secs(3))
        .send()
        .await
    {
        Ok(_response) => {
            let response_time = start_time.elapsed().as_millis() as u64;

            // 只要能连接到服务器就算成功（不管状态码）
            // 因为我们只是测试延迟，不是测试 API 功能
            let success = response_time < 3000; // 小于 3 秒就算成功

            NodeSpeedTestResult {
                node: PackycodeNode {
                    response_time: Some(response_time),
                    available: Some(success),
                    ..node.clone()
                },
                response_time,
                success,
                error: if success {
                    None
                } else {
                    Some("响应时间过长".to_string())
                },
            }
        }
        Err(e) => {
            let response_time = start_time.elapsed().as_millis() as u64;

            // 如果是超时错误，特别标记
            let error_msg = if e.is_timeout() {
                "连接超时".to_string()
            } else if e.is_connect() {
                "无法连接".to_string()
            } else {
                format!("网络错误: {}", e)
            };

            NodeSpeedTestResult {
                node: PackycodeNode {
                    response_time: Some(response_time),
                    available: Some(false),
                    ..node.clone()
                },
                response_time,
                success: false,
                error: Some(error_msg),
            }
        }
    }
}

/// 测试所有节点速度（不需要 token，只测试延迟）
#[command]
pub async fn test_all_packycode_nodes() -> Result<Vec<NodeSpeedTestResult>, String> {
    let nodes = get_all_nodes();
    let mut results = Vec::new();

    // 并发测试所有节点
    let futures: Vec<_> = nodes.iter().map(|node| test_node_speed(node)).collect();

    // 等待所有测试完成
    for (i, future) in futures.into_iter().enumerate() {
        let result = future.await;
        log::info!(
            "节点 {} 测速结果: {}ms, 成功: {}",
            nodes[i].name,
            result.response_time,
            result.success
        );
        results.push(result);
    }

    // 按响应时间排序（成功的节点优先，然后按延迟排序）
    results.sort_by(|a, b| match (a.success, b.success) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.response_time.cmp(&b.response_time),
    });

    Ok(results)
}

/// 自动选择最快的节点（仅从直连和备用中选择，不需要 token）
#[command]
pub async fn auto_select_best_node() -> Result<PackycodeNode, String> {
    let nodes = get_all_nodes();
    let mut best_node: Option<(PackycodeNode, u64)> = None;

    // 只测试直连和备用节点，过滤掉紧急节点
    let test_nodes: Vec<_> = nodes
        .into_iter()
        .filter(|n| matches!(n.node_type, NodeType::Direct | NodeType::Backup))
        .collect();

    log::info!("开始测试 {} 个节点...", test_nodes.len());

    // 并发测试所有节点
    let futures: Vec<_> = test_nodes
        .iter()
        .map(|node| test_node_speed(node))
        .collect();

    // 收集结果并找出最佳节点
    for (i, future) in futures.into_iter().enumerate() {
        let result = future.await;

        log::info!(
            "节点 {} - 延迟: {}ms, 可用: {}",
            test_nodes[i].name,
            result.response_time,
            result.success
        );

        if result.success {
            match &best_node {
                None => {
                    log::info!("初始最佳节点: {}", result.node.name);
                    best_node = Some((result.node, result.response_time));
                }
                Some((_, best_time)) if result.response_time < *best_time => {
                    log::info!(
                        "发现更快节点: {} ({}ms < {}ms)",
                        result.node.name,
                        result.response_time,
                        best_time
                    );
                    best_node = Some((result.node, result.response_time));
                }
                _ => {}
            }
        }
    }

    match best_node {
        Some((node, time)) => {
            log::info!("最佳节点选择: {} (延迟: {}ms)", node.name, time);
            Ok(node)
        }
        None => {
            log::error!("没有找到可用的节点");
            Err("没有找到可用的节点".to_string())
        }
    }
}

/// 获取节点列表（不测速）
#[command]
pub fn get_packycode_nodes() -> Vec<PackycodeNode> {
    get_all_nodes()
}
