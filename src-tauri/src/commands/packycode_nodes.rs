use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use reqwest::Client;
use tauri::command;
use anyhow::Result;

/// PackyCode 节点类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeType {
    Direct,     // 直连节点
    Backup,     // 备用节点
    Emergency,  // 紧急节点（非紧急情况不要使用）
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
        // 直连节点
        PackycodeNode {
            name: "直连1".to_string(),
            url: "https://api.packycode.com".to_string(),
            node_type: NodeType::Direct,
            description: "默认直连节点".to_string(),
            response_time: None,
            available: None,
        },
        PackycodeNode {
            name: "直连2 (HK-CN2)".to_string(),
            url: "https://api-hk-cn2.packycode.com".to_string(),
            node_type: NodeType::Direct,
            description: "香港 CN2 线路".to_string(),
            response_time: None,
            available: None,
        },
        PackycodeNode {
            name: "直连3 (US-CMIN2)".to_string(),
            url: "https://api-us-cmin2.packycode.com".to_string(),
            node_type: NodeType::Direct,
            description: "美国 CMIN2 线路".to_string(),
            response_time: None,
            available: None,
        },
        PackycodeNode {
            name: "直连4 (US-4837)".to_string(),
            url: "https://api-us-4837.packycode.com".to_string(),
            node_type: NodeType::Direct,
            description: "美国 4837 线路".to_string(),
            response_time: None,
            available: None,
        },
        // 备用节点
        PackycodeNode {
            name: "备用1 (US-CN2)".to_string(),
            url: "https://api-us-cn2.packycode.com".to_string(),
            node_type: NodeType::Backup,
            description: "美国 CN2 备用线路".to_string(),
            response_time: None,
            available: None,
        },
        PackycodeNode {
            name: "备用2 (CF-Pro)".to_string(),
            url: "https://api-cf-pro.packycode.com".to_string(),
            node_type: NodeType::Backup,
            description: "CloudFlare Pro 备用线路".to_string(),
            response_time: None,
            available: None,
        },
        // 紧急节点
        PackycodeNode {
            name: "测试节点1".to_string(),
            url: "https://api-test.packyme.com".to_string(),
            node_type: NodeType::Emergency,
            description: "测试节点（非紧急情况勿用）".to_string(),
            response_time: None,
            available: None,
        },
        PackycodeNode {
            name: "测试节点2".to_string(),
            url: "https://api-test-custom.packycode.com".to_string(),
            node_type: NodeType::Emergency,
            description: "自定义测试节点（非紧急情况勿用）".to_string(),
            response_time: None,
            available: None,
        },
        PackycodeNode {
            name: "测试节点3".to_string(),
            url: "https://api-tmp-test.dzz.ai".to_string(),
            node_type: NodeType::Emergency,
            description: "临时测试节点（非紧急情况勿用）".to_string(),
            response_time: None,
            available: None,
        },
    ]
}

/// 测试单个节点速度（仅测试网络延时，不需要认证）
async fn test_node_speed(node: &PackycodeNode, _token: &str) -> NodeSpeedTestResult {
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| Client::new());
    
    let start_time = Instant::now();
    
    // 只需要测试服务器的可达性和延时，使用简单的 HEAD 请求
    match client
        .head(&node.url)
        .send()
        .await
    {
        Ok(_response) => {
            let response_time = start_time.elapsed().as_millis() as u64;
            
            // 只要能连接到服务器就算成功，不管返回什么状态码
            NodeSpeedTestResult {
                node: PackycodeNode {
                    response_time: Some(response_time),
                    available: Some(true),
                    ..node.clone()
                },
                response_time,
                success: true,
                error: None,
            }
        }
        Err(e) => {
            let response_time = start_time.elapsed().as_millis() as u64;
            NodeSpeedTestResult {
                node: PackycodeNode {
                    response_time: Some(response_time),
                    available: Some(false),
                    ..node.clone()
                },
                response_time,
                success: false,
                error: Some(format!("连接失败: {}", e.to_string())),
            }
        }
    }
}

/// 测试所有节点速度
#[command]
pub async fn test_all_packycode_nodes(token: String) -> Result<Vec<NodeSpeedTestResult>, String> {
    let nodes = get_all_nodes();
    let mut results = Vec::new();
    
    for node in nodes {
        let result = test_node_speed(&node, &token).await;
        results.push(result);
    }
    
    // 按响应时间排序
    results.sort_by(|a, b| {
        match (a.success, b.success) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.response_time.cmp(&b.response_time),
        }
    });
    
    Ok(results)
}

/// 自动选择最快的节点（仅从直连和备用中选择）
#[command]
pub async fn auto_select_best_node(token: String) -> Result<PackycodeNode, String> {
    let nodes = get_all_nodes();
    let mut best_node: Option<(PackycodeNode, u64)> = None;
    
    // 只测试直连和备用节点
    for node in nodes.iter().filter(|n| matches!(n.node_type, NodeType::Direct | NodeType::Backup)) {
        let result = test_node_speed(node, &token).await;
        
        if result.success {
            match &best_node {
                None => best_node = Some((result.node, result.response_time)),
                Some((_, best_time)) if result.response_time < *best_time => {
                    best_node = Some((result.node, result.response_time));
                }
                _ => {}
            }
        }
    }
    
    best_node
        .map(|(node, _)| node)
        .ok_or_else(|| "No available nodes found".to_string())
}

/// 获取节点列表（不测速）
#[command]
pub fn get_packycode_nodes() -> Vec<PackycodeNode> {
    get_all_nodes()
}