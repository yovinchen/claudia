use anyhow::Result;
use serde::{Deserialize, Serialize};
use tauri::command;

// 导入公共模块
use crate::types::node_test::{NodeTestResult, TestStatus};
use crate::utils::node_tester;

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
async fn test_node_speed(node: &PackycodeNode) -> NodeTestResult {
    let url = format!("{}/", node.url.trim_end_matches('/'));
    let mut result = node_tester::test_node_connectivity(&url, 3000).await;

    // 添加节点名称
    result.node_name = Some(node.name.clone());

    result
}

/// 测试所有节点速度（不需要 token，只测试延迟）
#[command]
pub async fn test_all_packycode_nodes() -> Result<Vec<NodeTestResult>, String> {
    let nodes = get_all_nodes();
    let urls: Vec<String> = nodes
        .iter()
        .map(|n| format!("{}/", n.url.trim_end_matches('/')))
        .collect();

    // 使用公共批量测试
    let mut results = node_tester::test_nodes_batch(urls, 3000).await;

    // 添加节点名称
    for (i, result) in results.iter_mut().enumerate() {
        if let Some(node) = nodes.get(i) {
            result.node_name = Some(node.name.clone());
        }
    }

    // 按响应时间排序（成功的节点优先）
    node_tester::sort_by_response_time(&mut results);

    Ok(results)
}

/// 自动选择最快的节点（仅从直连和备用中选择，不需要 token）
#[command]
pub async fn auto_select_best_node() -> Result<PackycodeNode, String> {
    let nodes = get_all_nodes();

    // 只测试直连和备用节点，过滤掉紧急节点
    let test_nodes: Vec<_> = nodes
        .into_iter()
        .filter(|n| matches!(n.node_type, NodeType::Direct | NodeType::Backup))
        .collect();

    log::info!("开始测试 {} 个节点...", test_nodes.len());

    // 提取 URL 列表
    let urls: Vec<String> = test_nodes
        .iter()
        .map(|n| format!("{}/", n.url.trim_end_matches('/')))
        .collect();

    // 使用公共批量测试
    let results = node_tester::test_nodes_batch(urls, 3000).await;

    // 查找最快的节点
    if let Some(fastest) = node_tester::find_fastest_node(&results) {
        // 根据 URL 找到对应的节点
        let best_node = test_nodes
            .into_iter()
            .find(|n| {
                let node_url = format!("{}/", n.url.trim_end_matches('/'));
                node_url == fastest.url
            })
            .ok_or_else(|| "未找到匹配的节点".to_string())?;

        log::info!(
            "最佳节点选择: {} (延迟: {}ms)",
            best_node.name,
            fastest.response_time_ms.unwrap_or(0)
        );

        Ok(best_node)
    } else {
        log::error!("没有找到可用的节点");
        Err("没有找到可用的节点".to_string())
    }
}

/// 获取节点列表（不测速）
#[command]
pub fn get_packycode_nodes() -> Vec<PackycodeNode> {
    get_all_nodes()
}
