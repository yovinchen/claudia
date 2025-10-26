import { RelayStationAdapter } from '@/lib/api';

/**
 * API 节点数据结构
 */
export interface ApiNode {
  id: string;
  name: string;
  url: string;
  adapter: RelayStationAdapter;
  description?: string;
  enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 创建节点请求
 */
export interface CreateApiNodeRequest {
  name: string;
  url: string;
  adapter: RelayStationAdapter;
  description?: string;
}

/**
 * 更新节点请求
 */
export interface UpdateApiNodeRequest {
  name?: string;
  url?: string;
  description?: string;
  enabled?: boolean;
}

/**
 * 节点测试结果
 */
export interface NodeTestResult {
  node_id: string;
  url: string;
  name: string;
  response_time: number | null;
  status: 'testing' | 'success' | 'failed';
  error?: string;
}
