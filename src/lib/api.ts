import { invoke } from "@tauri-apps/api/core";
import type { HooksConfiguration } from '@/types/hooks';

/** Process type for tracking in ProcessRegistry */
export type ProcessType =
  | { AgentRun: { agent_id: number; agent_name: string } }
  | { ClaudeSession: { session_id: string } };

/** Information about a running process */
export interface ProcessInfo {
  run_id: number;
  process_type: ProcessType;
  pid: number;
  started_at: string;
  project_path: string;
  task: string;
  model: string;
}

/**
 * Represents a project in the ~/.claude/projects directory
 */
export interface Project {
  /** The project ID (derived from the directory name) */
  id: string;
  /** The original project path (decoded from the directory name) */
  path: string;
  /** List of session IDs (JSONL file names without extension) */
  sessions: string[];
  /** Unix timestamp when the project directory was created */
  created_at: number;
}

/**
 * Represents a session with its metadata
 */
export interface Session {
  /** The session ID (UUID) */
  id: string;
  /** The project ID this session belongs to */
  project_id: string;
  /** The project path */
  project_path: string;
  /** Optional todo data associated with this session */
  todo_data?: any;
  /** Unix timestamp when the session file was created */
  created_at: number;
  /** First user message content (if available) */
  first_message?: string;
  /** Timestamp of the first user message (if available) */
  message_timestamp?: string;
}

/**
 * Represents the settings from ~/.claude/settings.json
 */
export interface ClaudeSettings {
  [key: string]: any;
}

/**
 * Represents the Claude Code version status
 */
export interface ClaudeVersionStatus {
  /** Whether Claude Code is installed and working */
  is_installed: boolean;
  /** The version string if available */
  version?: string;
  /** The full output from the command */
  output: string;
}

/**
 * Represents a CLAUDE.md file found in the project
 */
export interface ClaudeMdFile {
  /** Relative path from the project root */
  relative_path: string;
  /** Absolute path to the file */
  absolute_path: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  modified: number;
}

/**
 * Represents a file or directory entry
 */
export interface FileEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  extension?: string;
}

/**
 * Represents a Claude installation found on the system
 */
export interface ClaudeInstallation {
  /** Full path to the Claude binary */
  path: string;
  /** Version string if available */
  version?: string;
  /** Source of discovery (e.g., "nvm", "system", "homebrew", "which") */
  source: string;
  /** Type of installation */
  installation_type: "System" | "Custom";
}

// Agent API types
export interface Agent {
  id?: number;
  name: string;
  icon: string;
  system_prompt: string;
  default_task?: string;
  model: string;
  hooks?: string; // JSON string of HooksConfiguration
  created_at: string;
  updated_at: string;
}

export interface AgentExport {
  version: number;
  exported_at: string;
  agent: {
    name: string;
    icon: string;
    system_prompt: string;
    default_task?: string;
    model: string;
    hooks?: string;
  };
}

export interface GitHubAgentFile {
  name: string;
  path: string;
  download_url: string;
  size: number;
  sha: string;
}

export interface AgentRun {
  id?: number;
  agent_id: number;
  agent_name: string;
  agent_icon: string;
  task: string;
  model: string;
  project_path: string;
  session_id: string;
  status: string; // 'pending', 'running', 'completed', 'failed', 'cancelled'
  pid?: number;
  process_started_at?: string;
  created_at: string;
  completed_at?: string;
}

export interface AgentRunMetrics {
  duration_ms?: number;
  total_tokens?: number;
  cost_usd?: number;
  message_count?: number;
}

export interface AgentRunWithMetrics {
  id?: number;
  agent_id: number;
  agent_name: string;
  agent_icon: string;
  task: string;
  model: string;
  project_path: string;
  session_id: string;
  status: string; // 'pending', 'running', 'completed', 'failed', 'cancelled'
  pid?: number;
  process_started_at?: string;
  created_at: string;
  completed_at?: string;
  metrics?: AgentRunMetrics;
  output?: string; // Real-time JSONL content
}

// Usage Dashboard types
export interface UsageEntry {
  project: string;
  timestamp: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  cost: number;
}

export interface ModelUsage {
  model: string;
  total_cost: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  session_count: number;
}

export interface DailyUsage {
  date: string;
  total_cost: number;
  total_tokens: number;
  // Detailed per-day breakdowns (backend added)
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  request_count: number;
  models_used: string[];
}

export interface ProjectUsage {
  project_path: string;
  project_name: string;
  total_cost: number;
  total_tokens: number;
  session_count: number;
  last_used: string;
}

export interface UsageStats {
  total_cost: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  total_sessions: number;
  by_model: ModelUsage[];
  by_date: DailyUsage[];
  by_project: ProjectUsage[];
}

/**
 * Represents a checkpoint in the session timeline
 */
export interface Checkpoint {
  id: string;
  sessionId: string;
  projectId: string;
  messageIndex: number;
  timestamp: string;
  description?: string;
  parentCheckpointId?: string;
  metadata: CheckpointMetadata;
}

/**
 * Metadata associated with a checkpoint
 */
export interface CheckpointMetadata {
  totalTokens: number;
  modelUsed: string;
  userPrompt: string;
  fileChanges: number;
  snapshotSize: number;
}

/**
 * Represents a file snapshot at a checkpoint
 */
export interface FileSnapshot {
  checkpointId: string;
  filePath: string;
  content: string;
  hash: string;
  isDeleted: boolean;
  permissions?: number;
  size: number;
}

/**
 * Represents a node in the timeline tree
 */
export interface TimelineNode {
  checkpoint: Checkpoint;
  children: TimelineNode[];
  fileSnapshotIds: string[];
}

/**
 * The complete timeline for a session
 */
export interface SessionTimeline {
  sessionId: string;
  rootNode?: TimelineNode;
  currentCheckpointId?: string;
  autoCheckpointEnabled: boolean;
  checkpointStrategy: CheckpointStrategy;
  totalCheckpoints: number;
}

/**
 * Strategy for automatic checkpoint creation
 */
export type CheckpointStrategy = 'manual' | 'per_prompt' | 'per_tool_use' | 'smart';

/**
 * Result of a checkpoint operation
 */
export interface CheckpointResult {
  checkpoint: Checkpoint;
  filesProcessed: number;
  warnings: string[];
}

/**
 * Diff between two checkpoints
 */
export interface CheckpointDiff {
  fromCheckpointId: string;
  toCheckpointId: string;
  modifiedFiles: FileDiff[];
  addedFiles: string[];
  deletedFiles: string[];
  tokenDelta: number;
}

/**
 * Diff for a single file
 */
export interface FileDiff {
  path: string;
  additions: number;
  deletions: number;
  diffContent?: string;
}

/**
 * Represents an MCP server configuration
 */
export interface MCPServer {
  /** Server name/identifier */
  name: string;
  /** Transport type: "stdio" or "sse" */
  transport: string;
  /** Command to execute (for stdio) */
  command?: string;
  /** Command arguments (for stdio) */
  args: string[];
  /** Environment variables */
  env: Record<string, string>;
  /** URL endpoint (for SSE) */
  url?: string;
  /** Configuration scope: "local", "project", or "user" */
  scope: string;
  /** Whether the server is currently active */
  is_active: boolean;
  /** Server status */
  status: ServerStatus;
}

/**
 * Server status information
 */
export interface ServerStatus {
  /** Whether the server is running */
  running: boolean;
  /** Last error message if any */
  error?: string;
  /** Last checked timestamp */
  last_checked?: number;
}

/**
 * MCP configuration for project scope (.mcp.json)
 */
export interface MCPProjectConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

/**
 * Individual server configuration in .mcp.json
 */
export interface MCPServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * Represents a custom slash command
 */
export interface SlashCommand {
  /** Unique identifier for the command */
  id: string;
  /** Command name (without prefix) */
  name: string;
  /** Full command with prefix (e.g., "/project:optimize") */
  full_command: string;
  /** Command scope: "project" or "user" */
  scope: string;
  /** Optional namespace (e.g., "frontend" in "/project:frontend:component") */
  namespace?: string;
  /** Path to the markdown file */
  file_path: string;
  /** Command content (markdown body) */
  content: string;
  /** Optional description from frontmatter */
  description?: string;
  /** Allowed tools from frontmatter */
  allowed_tools: string[];
  /** Whether the command has bash commands (!) */
  has_bash_commands: boolean;
  /** Whether the command has file references (@) */
  has_file_references: boolean;
  /** Whether the command uses $ARGUMENTS placeholder */
  accepts_arguments: boolean;
}

/**
 * Result of adding a server
 */
export interface AddServerResult {
  success: boolean;
  message: string;
  server_name?: string;
}

/**
 * Import result for multiple servers
 */
export interface ImportResult {
  imported_count: number;
  failed_count: number;
  servers: ImportServerResult[];
}

/**
 * Result for individual server import
 */
export interface ImportServerResult {
  name: string;
  success: boolean;
  error?: string;
}

// ================================
// Relay Station Types
// ================================

/** 中转站适配器类型 */
export type RelayStationAdapter =
  | 'packycode' // PackyCode 平台（默认）
  | 'deepseek'  // DeepSeek v3.1
  | 'glm'       // 智谱GLM
  | 'qwen'      // 千问Qwen
  | 'kimi'      // Kimi k2
  | 'custom';   // 自定义简单配置

/** 认证方式 */
export type AuthMethod =
  | 'bearer_token'  // Bearer Token 认证（推荐）
  | 'api_key'       // API Key 认证
  | 'custom';       // 自定义认证方式

/** 中转站配置 */
export interface RelayStation {
  id: string;                    // 唯一标识符
  name: string;                  // 显示名称
  description?: string;          // 描述信息
  api_url: string;              // API 基础 URL
  adapter: RelayStationAdapter; // 适配器类型
  auth_method: AuthMethod;      // 认证方式
  system_token: string;         // 系统令牌
  user_id?: string;             // 用户 ID（可选）
  adapter_config?: Record<string, any>; // 适配器特定配置
  enabled: boolean;             // 启用状态
  created_at: number;          // 创建时间
  updated_at: number;          // 更新时间
}

/** 创建中转站请求 */
export interface CreateRelayStationRequest {
  name: string;
  description?: string;
  api_url: string;
  adapter: RelayStationAdapter;
  auth_method: AuthMethod;
  system_token: string;
  user_id?: string;
  adapter_config?: Record<string, any>;
  enabled: boolean;
}

/** 更新中转站请求 */
export interface UpdateRelayStationRequest {
  id: string;
  name: string;
  description?: string;
  api_url: string;
  adapter: RelayStationAdapter;
  auth_method: AuthMethod;
  system_token: string;
  user_id?: string;
  adapter_config?: Record<string, any>;
  enabled: boolean;
}

/** 站点信息 */
export interface StationInfo {
  name: string;                              // 站点名称
  announcement?: string;                     // 公告信息
  api_url: string;                          // API 地址
  version?: string;                         // 版本信息
  metadata?: Record<string, any>;           // 扩展元数据
  quota_per_unit?: number;                  // 单位配额（用于价格转换）
}

/** 用户信息 */
export interface UserInfo {
  user_id: string;                          // 用户 ID
  username?: string;                        // 用户名
  email?: string;                          // 邮箱
  balance_remaining?: number;              // 剩余余额（美元）
  amount_used?: number;                    // 已用金额（美元）
  request_count?: number;                  // 请求次数
  status?: string;                         // 账户状态
  metadata?: Record<string, any>;          // 原始数据
}

/** 连接测试结果 */
export interface ConnectionTestResult {
  success: boolean;                // 连接是否成功
  response_time?: number;         // 响应时间（毫秒）
  message: string;                // 结果消息
  error?: string;                 // 错误信息
}

/** 导入结果统计 */
export interface ImportResult {
  total: number;      // 总数
  imported: number;   // 成功导入数
  skipped: number;    // 跳过数（重复）
  failed: number;     // 失败数
  message: string;    // 结果消息
}

/** Token 信息 */
export interface TokenInfo {
  id: string;
  name: string;
  token: string;
  quota?: number;
  used_quota?: number;
  status: string;
  created_at: number;
  updated_at: number;
}

/** Token 分页响应 */
export interface TokenPaginationResponse {
  tokens: TokenInfo[];
  total: number;
  page: number;
  size: number;
}

// ============= PackyCode Nodes =============

/** PackyCode 节点类型 */
export type NodeType =
  | 'direct'     // 直连节点
  | 'backup'     // 备用节点
  | 'emergency'; // 紧急节点

/** PackyCode 节点信息 */
export interface PackycodeNode {
  name: string;                    // 节点名称
  url: string;                     // 节点 URL
  node_type: NodeType;            // 节点类型
  description: string;            // 节点描述
  response_time?: number;         // 响应时间（毫秒）
  available?: boolean;            // 是否可用
}

/** 节点测速结果 */
export interface NodeSpeedTestResult {
  node: PackycodeNode;            // 节点信息
  response_time: number;          // 响应时间
  success: boolean;               // 是否成功
  error?: string;                 // 错误信息
}

/** PackyCode 用户额度信息 */
export interface PackycodeUserQuota {
  daily_budget_usd: number;              // 日预算（美元）
  daily_spent_usd: number;               // 日已使用（美元）
  monthly_budget_usd: number;            // 月预算（美元）
  monthly_spent_usd: number;             // 月已使用（美元）
  balance_usd: number;                   // 账户余额（美元）
  total_spent_usd: number;               // 总消费（美元）
  plan_type: string;                     // 计划类型 (pro, basic, etc.)
  plan_expires_at?: string;              // 计划过期时间
  username?: string;                     // 用户名
  email?: string;                        // 邮箱
  opus_enabled?: boolean;                // 是否启用Opus模型
}

/**
 * API client for interacting with the Rust backend
 */
export const api = {
  /**
   * Lists all projects in the ~/.claude/projects directory
   * @returns Promise resolving to an array of projects
   */
  async listProjects(): Promise<Project[]> {
    try {
      return await invoke<Project[]>("list_projects");
    } catch (error) {
      console.error("Failed to list projects:", error);
      throw error;
    }
  },

  /**
   * Retrieves sessions for a specific project
   * @param projectId - The ID of the project to retrieve sessions for
   * @returns Promise resolving to an array of sessions
   */
  async getProjectSessions(projectId: string): Promise<Session[]> {
    try {
      return await invoke<Session[]>('get_project_sessions', { projectId });
    } catch (error) {
      console.error("Failed to get project sessions:", error);
      throw error;
    }
  },

  /**
   * Fetch list of agents from GitHub repository
   * @returns Promise resolving to list of available agents on GitHub
   */
  async fetchGitHubAgents(): Promise<GitHubAgentFile[]> {
    try {
      return await invoke<GitHubAgentFile[]>('fetch_github_agents');
    } catch (error) {
      console.error("Failed to fetch GitHub agents:", error);
      throw error;
    }
  },

  /**
   * Fetch and preview a specific agent from GitHub
   * @param downloadUrl - The download URL for the agent file
   * @returns Promise resolving to the agent export data
   */
  async fetchGitHubAgentContent(downloadUrl: string): Promise<AgentExport> {
    try {
      return await invoke<AgentExport>('fetch_github_agent_content', { downloadUrl });
    } catch (error) {
      console.error("Failed to fetch GitHub agent content:", error);
      throw error;
    }
  },

  /**
   * Import an agent directly from GitHub
   * @param downloadUrl - The download URL for the agent file
   * @returns Promise resolving to the imported agent
   */
  async importAgentFromGitHub(downloadUrl: string): Promise<Agent> {
    try {
      return await invoke<Agent>('import_agent_from_github', { downloadUrl });
    } catch (error) {
      console.error("Failed to import agent from GitHub:", error);
      throw error;
    }
  },

  /**
   * Reads the Claude settings file
   * @returns Promise resolving to the settings object
   */
  async getClaudeSettings(): Promise<ClaudeSettings> {
    try {
      const result = await invoke<{ data: ClaudeSettings }>("get_claude_settings");
      console.log("Raw result from get_claude_settings:", result);

      // The Rust backend returns ClaudeSettings { data: ... }
      // We need to extract the data field
      if (result && typeof result === 'object' && 'data' in result) {
        return result.data;
      }

      // If the result is already the settings object, return it
      return result as ClaudeSettings;
    } catch (error) {
      console.error("Failed to get Claude settings:", error);
      throw error;
    }
  },

  /**
   * Opens a new Claude Code session
   * @param path - Optional path to open the session in
   * @returns Promise resolving when the session is opened
   */
  async openNewSession(path?: string): Promise<string> {
    try {
      return await invoke<string>("open_new_session", { path });
    } catch (error) {
      console.error("Failed to open new session:", error);
      throw error;
    }
  },

  /**
   * Reads the CLAUDE.md system prompt file
   * @returns Promise resolving to the system prompt content
   */
  async getSystemPrompt(): Promise<string> {
    try {
      return await invoke<string>("get_system_prompt");
    } catch (error) {
      console.error("Failed to get system prompt:", error);
      throw error;
    }
  },

  /**
   * Checks if Claude Code is installed and gets its version
   * @returns Promise resolving to the version status
   */
  async checkClaudeVersion(): Promise<ClaudeVersionStatus> {
    try {
      return await invoke<ClaudeVersionStatus>("check_claude_version");
    } catch (error) {
      console.error("Failed to check Claude version:", error);
      throw error;
    }
  },

  /**
   * Saves the CLAUDE.md system prompt file
   * @param content - The new content for the system prompt
   * @returns Promise resolving when the file is saved
   */
  async saveSystemPrompt(content: string): Promise<string> {
    try {
      return await invoke<string>("save_system_prompt", { content });
    } catch (error) {
      console.error("Failed to save system prompt:", error);
      throw error;
    }
  },

  /**
   * Saves the Claude settings file
   * @param settings - The settings object to save
   * @returns Promise resolving when the settings are saved
   */
  async saveClaudeSettings(settings: ClaudeSettings): Promise<string> {
    try {
      return await invoke<string>("save_claude_settings", { settings });
    } catch (error) {
      console.error("Failed to save Claude settings:", error);
      throw error;
    }
  },

  /**
   * Finds all CLAUDE.md files in a project directory
   * @param projectPath - The absolute path to the project
   * @returns Promise resolving to an array of CLAUDE.md files
   */
  async findClaudeMdFiles(projectPath: string): Promise<ClaudeMdFile[]> {
    try {
      return await invoke<ClaudeMdFile[]>("find_claude_md_files", { projectPath });
    } catch (error) {
      console.error("Failed to find CLAUDE.md files:", error);
      throw error;
    }
  },

  /**
   * Reads a specific CLAUDE.md file
   * @param filePath - The absolute path to the file
   * @returns Promise resolving to the file content
   */
  async readClaudeMdFile(filePath: string): Promise<string> {
    try {
      return await invoke<string>("read_claude_md_file", { filePath });
    } catch (error) {
      console.error("Failed to read CLAUDE.md file:", error);
      throw error;
    }
  },

  /**
   * Saves a specific CLAUDE.md file
   * @param filePath - The absolute path to the file
   * @param content - The new content for the file
   * @returns Promise resolving when the file is saved
   */
  async saveClaudeMdFile(filePath: string, content: string): Promise<string> {
    try {
      return await invoke<string>("save_claude_md_file", { filePath, content });
    } catch (error) {
      console.error("Failed to save CLAUDE.md file:", error);
      throw error;
    }
  },

  // Agent API methods

  /**
   * Lists all CC agents
   * @returns Promise resolving to an array of agents
   */
  async listAgents(): Promise<Agent[]> {
    try {
      return await invoke<Agent[]>('list_agents');
    } catch (error) {
      console.error("Failed to list agents:", error);
      throw error;
    }
  },

  /**
   * Creates a new agent
   * @param name - The agent name
   * @param icon - The icon identifier
   * @param system_prompt - The system prompt for the agent
   * @param default_task - Optional default task
   * @param model - Optional model (defaults to 'sonnet')
   * @param hooks - Optional hooks configuration as JSON string
   * @returns Promise resolving to the created agent
   */
  async createAgent(
    name: string,
    icon: string,
    system_prompt: string,
    default_task?: string,
    model?: string,
    hooks?: string
  ): Promise<Agent> {
    try {
      return await invoke<Agent>('create_agent', {
        name,
        icon,
        systemPrompt: system_prompt,
        defaultTask: default_task,
        model,
        hooks
      });
    } catch (error) {
      console.error("Failed to create agent:", error);
      throw error;
    }
  },

  /**
   * Updates an existing agent
   * @param id - The agent ID
   * @param name - The updated name
   * @param icon - The updated icon
   * @param system_prompt - The updated system prompt
   * @param default_task - Optional default task
   * @param model - Optional model
   * @param hooks - Optional hooks configuration as JSON string
   * @returns Promise resolving to the updated agent
   */
  async updateAgent(
    id: number,
    name: string,
    icon: string,
    system_prompt: string,
    default_task?: string,
    model?: string,
    hooks?: string
  ): Promise<Agent> {
    try {
      return await invoke<Agent>('update_agent', {
        id,
        name,
        icon,
        systemPrompt: system_prompt,
        defaultTask: default_task,
        model,
        hooks
      });
    } catch (error) {
      console.error("Failed to update agent:", error);
      throw error;
    }
  },

  /**
   * Deletes an agent
   * @param id - The agent ID to delete
   * @returns Promise resolving when the agent is deleted
   */
  async deleteAgent(id: number): Promise<void> {
    try {
      return await invoke('delete_agent', { id });
    } catch (error) {
      console.error("Failed to delete agent:", error);
      throw error;
    }
  },

  /**
   * Gets a single agent by ID
   * @param id - The agent ID
   * @returns Promise resolving to the agent
   */
  async getAgent(id: number): Promise<Agent> {
    try {
      return await invoke<Agent>('get_agent', { id });
    } catch (error) {
      console.error("Failed to get agent:", error);
      throw error;
    }
  },

  /**
   * Exports a single agent to JSON format
   * @param id - The agent ID to export
   * @returns Promise resolving to the JSON string
   */
  async exportAgent(id: number): Promise<string> {
    try {
      return await invoke<string>('export_agent', { id });
    } catch (error) {
      console.error("Failed to export agent:", error);
      throw error;
    }
  },

  /**
   * Imports an agent from JSON data
   * @param jsonData - The JSON string containing the agent export
   * @returns Promise resolving to the imported agent
   */
  async importAgent(jsonData: string): Promise<Agent> {
    try {
      return await invoke<Agent>('import_agent', { jsonData });
    } catch (error) {
      console.error("Failed to import agent:", error);
      throw error;
    }
  },

  /**
   * Imports an agent from a file
   * @param filePath - The path to the JSON file
   * @returns Promise resolving to the imported agent
   */
  async importAgentFromFile(filePath: string): Promise<Agent> {
    try {
      return await invoke<Agent>('import_agent_from_file', { filePath });
    } catch (error) {
      console.error("Failed to import agent from file:", error);
      throw error;
    }
  },

  /**
   * Executes an agent
   * @param agentId - The agent ID to execute
   * @param projectPath - The project path to run the agent in
   * @param task - The task description
   * @param model - Optional model override
   * @returns Promise resolving to the run ID when execution starts
   */
  async executeAgent(agentId: number, projectPath: string, task: string, model?: string): Promise<number> {
    try {
      return await invoke<number>('execute_agent', { agentId, projectPath, task, model });
    } catch (error) {
      console.error("Failed to execute agent:", error);
      // Return a sentinel value to indicate error
      throw new Error(`Failed to execute agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Lists agent runs with metrics
   * @param agentId - Optional agent ID to filter runs
   * @returns Promise resolving to an array of agent runs with metrics
   */
  async listAgentRuns(agentId?: number): Promise<AgentRunWithMetrics[]> {
    try {
      return await invoke<AgentRunWithMetrics[]>('list_agent_runs', { agentId });
    } catch (error) {
      console.error("Failed to list agent runs:", error);
      // Return empty array instead of throwing to prevent UI crashes
      return [];
    }
  },

  /**
   * Gets a single agent run by ID with metrics
   * @param id - The run ID
   * @returns Promise resolving to the agent run with metrics
   */
  async getAgentRun(id: number): Promise<AgentRunWithMetrics> {
    try {
      return await invoke<AgentRunWithMetrics>('get_agent_run', { id });
    } catch (error) {
      console.error("Failed to get agent run:", error);
      throw new Error(`Failed to get agent run: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Gets a single agent run by ID with real-time metrics from JSONL
   * @param id - The run ID
   * @returns Promise resolving to the agent run with metrics
   */
  async getAgentRunWithRealTimeMetrics(id: number): Promise<AgentRunWithMetrics> {
    try {
      return await invoke<AgentRunWithMetrics>('get_agent_run_with_real_time_metrics', { id });
    } catch (error) {
      console.error("Failed to get agent run with real-time metrics:", error);
      throw new Error(`Failed to get agent run with real-time metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Lists all currently running agent sessions
   * @returns Promise resolving to list of running agent sessions
   */
  async listRunningAgentSessions(): Promise<AgentRun[]> {
    try {
      return await invoke<AgentRun[]>('list_running_sessions');
    } catch (error) {
      console.error("Failed to list running agent sessions:", error);
      throw new Error(`Failed to list running agent sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Kills a running agent session
   * @param runId - The run ID to kill
   * @returns Promise resolving to whether the session was successfully killed
   */
  async killAgentSession(runId: number): Promise<boolean> {
    try {
      return await invoke<boolean>('kill_agent_session', { runId });
    } catch (error) {
      console.error("Failed to kill agent session:", error);
      throw new Error(`Failed to kill agent session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Gets the status of a specific agent session
   * @param runId - The run ID to check
   * @returns Promise resolving to the session status or null if not found
   */
  async getSessionStatus(runId: number): Promise<string | null> {
    try {
      return await invoke<string | null>('get_session_status', { runId });
    } catch (error) {
      console.error("Failed to get session status:", error);
      throw new Error(`Failed to get session status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Cleanup finished processes and update their status
   * @returns Promise resolving to list of run IDs that were cleaned up
   */
  async cleanupFinishedProcesses(): Promise<number[]> {
    try {
      return await invoke<number[]>('cleanup_finished_processes');
    } catch (error) {
      console.error("Failed to cleanup finished processes:", error);
      throw new Error(`Failed to cleanup finished processes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Get real-time output for a running session (with live output fallback)
   * @param runId - The run ID to get output for
   * @returns Promise resolving to the current session output (JSONL format)
   */
  async getSessionOutput(runId: number): Promise<string> {
    try {
      return await invoke<string>('get_session_output', { runId });
    } catch (error) {
      console.error("Failed to get session output:", error);
      throw new Error(`Failed to get session output: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Get live output directly from process stdout buffer
   * @param runId - The run ID to get live output for
   * @returns Promise resolving to the current live output
   */
  async getLiveSessionOutput(runId: number): Promise<string> {
    try {
      return await invoke<string>('get_live_session_output', { runId });
    } catch (error) {
      console.error("Failed to get live session output:", error);
      throw new Error(`Failed to get live session output: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Start streaming real-time output for a running session
   * @param runId - The run ID to stream output for
   * @returns Promise that resolves when streaming starts
   */
  async streamSessionOutput(runId: number): Promise<void> {
    try {
      return await invoke<void>('stream_session_output', { runId });
    } catch (error) {
      console.error("Failed to start streaming session output:", error);
      throw new Error(`Failed to start streaming session output: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Loads the JSONL history for a specific session
   */
  async loadSessionHistory(sessionId: string, projectId: string): Promise<any[]> {
    return invoke("load_session_history", { sessionId, projectId });
  },

  /**
   * Loads the JSONL history for a specific agent session
   * Similar to loadSessionHistory but searches across all project directories
   * @param sessionId - The session ID (UUID)
   * @returns Promise resolving to array of session messages
   */
  async loadAgentSessionHistory(sessionId: string): Promise<any[]> {
    try {
      return await invoke<any[]>('load_agent_session_history', { sessionId });
    } catch (error) {
      console.error("Failed to load agent session history:", error);
      throw error;
    }
  },

  /**
   * Executes a new interactive Claude Code session with streaming output
   */
  async executeClaudeCode(projectPath: string, prompt: string, model: string): Promise<void> {
    return invoke("execute_claude_code", { projectPath, prompt, model });
  },

  /**
   * Continues an existing Claude Code conversation with streaming output
   */
  async continueClaudeCode(projectPath: string, prompt: string, model: string): Promise<void> {
    return invoke("continue_claude_code", { projectPath, prompt, model });
  },

  /**
   * Resumes an existing Claude Code session by ID with streaming output
   */
  async resumeClaudeCode(projectPath: string, sessionId: string, prompt: string, model: string): Promise<void> {
    return invoke("resume_claude_code", { projectPath, sessionId, prompt, model });
  },

  /**
   * Cancels the currently running Claude Code execution
   * @param sessionId - Optional session ID to cancel a specific session
   */
  async cancelClaudeExecution(sessionId?: string): Promise<void> {
    return invoke("cancel_claude_execution", { sessionId });
  },

  /**
   * Lists all currently running Claude sessions
   * @returns Promise resolving to list of running Claude sessions
   */
  async listRunningClaudeSessions(): Promise<any[]> {
    return invoke("list_running_claude_sessions");
  },

  /**
   * Gets live output from a Claude session
   * @param sessionId - The session ID to get output for
   * @returns Promise resolving to the current live output
   */
  async getClaudeSessionOutput(sessionId: string): Promise<string> {
    return invoke("get_claude_session_output", { sessionId });
  },

  /**
   * Lists files and directories in a given path
   */
  async listDirectoryContents(directoryPath: string): Promise<FileEntry[]> {
    return invoke("list_directory_contents", { directoryPath });
  },

  /**
   * Searches for files and directories matching a pattern
   */
  async searchFiles(basePath: string, query: string): Promise<FileEntry[]> {
    return invoke("search_files", { basePath, query });
  },

  /**
   * Gets overall usage statistics
   * @param days - Optional number of days to look back
   * @returns Promise resolving to usage statistics
   */
  async getUsageStats(days?: number): Promise<UsageStats> {
    try {
      // 使用缓存版本的API，它会自动更新缓存
      return await invoke<UsageStats>("usage_get_stats_cached", { days });
    } catch (error) {
      console.error("Failed to get cached usage stats, falling back to direct scan:", error);
      // 如果缓存版本失败，回退到原版本
      try {
        return await invoke<UsageStats>("get_usage_stats", { days });
      } catch (fallbackError) {
        console.error("Fallback to original API also failed:", fallbackError);
        throw error;
      }
    }
  },

  /**
   * Gets usage statistics filtered by date range
   * @param startDate - Start date (ISO format)
   * @param endDate - End date (ISO format)
   * @returns Promise resolving to usage statistics
   */
  async getUsageByDateRange(startDate: string, endDate: string): Promise<UsageStats> {
    try {
      return await invoke<UsageStats>("get_usage_by_date_range", { startDate, endDate });
    } catch (error) {
      console.error("Failed to get usage by date range:", error);
      throw error;
    }
  },

  /**
   * Gets usage statistics grouped by session
   * @param since - Optional start date (YYYYMMDD)
   * @param until - Optional end date (YYYYMMDD)
   * @param order - Optional sort order ('asc' or 'desc')
   * @returns Promise resolving to an array of session usage data
   */
  async getSessionStats(
    since?: string,
    until?: string,
    order?: "asc" | "desc"
  ): Promise<ProjectUsage[]> {
    try {
      return await invoke<ProjectUsage[]>("get_session_stats", {
        since,
        until,
        order,
      });
    } catch (error) {
      console.error("Failed to get session stats:", error);
      throw error;
    }
  },

  /**
   * Gets detailed usage entries with optional filtering
   * @param limit - Optional limit for number of entries
   * @returns Promise resolving to array of usage entries
   */
  async getUsageDetails(limit?: number): Promise<UsageEntry[]> {
    try {
      return await invoke<UsageEntry[]>("get_usage_details", { limit });
    } catch (error) {
      console.error("Failed to get usage details:", error);
      throw error;
    }
  },

  /**
   * Clears the usage cache and forces recalculation
   * @returns Promise resolving to success message
   */
  async clearUsageCache(): Promise<string> {
    try {
      return await invoke<string>("usage_clear_cache");
    } catch (error) {
      console.error("Failed to clear usage cache:", error);
      throw error;
    }
  },

  /**
   * Force scan for usage data updates
   * @returns Promise resolving to scan result
   */
  async forceUsageScan(): Promise<any> {
    try {
      return await invoke("usage_force_scan");
    } catch (error) {
      console.error("Failed to force usage scan:", error);
      throw error;
    }
  },

  /**
   * Check if there are usage data updates available
   * @returns Promise resolving to boolean indicating if updates are available
   */
  async checkUsageUpdates(): Promise<boolean> {
    try {
      return await invoke<boolean>("usage_check_updates");
    } catch (error) {
      console.error("Failed to check usage updates:", error);
      throw error;
    }
  },

  /**
   * Creates a checkpoint for the current session state
   */
  async createCheckpoint(
    sessionId: string,
    projectId: string,
    projectPath: string,
    messageIndex?: number,
    description?: string
  ): Promise<CheckpointResult> {
    return invoke("create_checkpoint", {
      sessionId,
      projectId,
      projectPath,
      messageIndex,
      description
    });
  },

  /**
   * Restores a session to a specific checkpoint
   */
  async restoreCheckpoint(
    checkpointId: string,
    sessionId: string,
    projectId: string,
    projectPath: string
  ): Promise<CheckpointResult> {
    return invoke("restore_checkpoint", {
      checkpointId,
      sessionId,
      projectId,
      projectPath
    });
  },

  /**
   * Lists all checkpoints for a session
   */
  async listCheckpoints(
    sessionId: string,
    projectId: string,
    projectPath: string
  ): Promise<Checkpoint[]> {
    return invoke("list_checkpoints", {
      sessionId,
      projectId,
      projectPath
    });
  },

  /**
   * Forks a new timeline branch from a checkpoint
   */
  async forkFromCheckpoint(
    checkpointId: string,
    sessionId: string,
    projectId: string,
    projectPath: string,
    newSessionId: string,
    description?: string
  ): Promise<CheckpointResult> {
    return invoke("fork_from_checkpoint", {
      checkpointId,
      sessionId,
      projectId,
      projectPath,
      newSessionId,
      description
    });
  },

  /**
   * Gets the timeline for a session
   */
  async getSessionTimeline(
    sessionId: string,
    projectId: string,
    projectPath: string
  ): Promise<SessionTimeline> {
    return invoke("get_session_timeline", {
      sessionId,
      projectId,
      projectPath
    });
  },

  /**
   * Updates checkpoint settings for a session
   */
  async updateCheckpointSettings(
    sessionId: string,
    projectId: string,
    projectPath: string,
    autoCheckpointEnabled: boolean,
    checkpointStrategy: CheckpointStrategy
  ): Promise<void> {
    return invoke("update_checkpoint_settings", {
      sessionId,
      projectId,
      projectPath,
      autoCheckpointEnabled,
      checkpointStrategy
    });
  },

  /**
   * Gets diff between two checkpoints
   */
  async getCheckpointDiff(
    fromCheckpointId: string,
    toCheckpointId: string,
    sessionId: string,
    projectId: string
  ): Promise<CheckpointDiff> {
    try {
      return await invoke<CheckpointDiff>("get_checkpoint_diff", {
        fromCheckpointId,
        toCheckpointId,
        sessionId,
        projectId
      });
    } catch (error) {
      console.error("Failed to get checkpoint diff:", error);
      throw error;
    }
  },

  /**
   * Tracks a message for checkpointing
   */
  async trackCheckpointMessage(
    sessionId: string,
    projectId: string,
    projectPath: string,
    message: string
  ): Promise<void> {
    try {
      await invoke("track_checkpoint_message", {
        sessionId,
        projectId,
        projectPath,
        message
      });
    } catch (error) {
      console.error("Failed to track checkpoint message:", error);
      throw error;
    }
  },

  /**
   * Checks if auto-checkpoint should be triggered
   */
  async checkAutoCheckpoint(
    sessionId: string,
    projectId: string,
    projectPath: string,
    message: string
  ): Promise<boolean> {
    try {
      return await invoke<boolean>("check_auto_checkpoint", {
        sessionId,
        projectId,
        projectPath,
        message
      });
    } catch (error) {
      console.error("Failed to check auto checkpoint:", error);
      throw error;
    }
  },

  /**
   * Triggers cleanup of old checkpoints
   */
  async cleanupOldCheckpoints(
    sessionId: string,
    projectId: string,
    projectPath: string,
    keepCount: number
  ): Promise<number> {
    try {
      return await invoke<number>("cleanup_old_checkpoints", {
        sessionId,
        projectId,
        projectPath,
        keepCount
      });
    } catch (error) {
      console.error("Failed to cleanup old checkpoints:", error);
      throw error;
    }
  },

  /**
   * Gets checkpoint settings for a session
   */
  async getCheckpointSettings(
    sessionId: string,
    projectId: string,
    projectPath: string
  ): Promise<{
    auto_checkpoint_enabled: boolean;
    checkpoint_strategy: CheckpointStrategy;
    total_checkpoints: number;
    current_checkpoint_id?: string;
  }> {
    try {
      return await invoke("get_checkpoint_settings", {
        sessionId,
        projectId,
        projectPath
      });
    } catch (error) {
      console.error("Failed to get checkpoint settings:", error);
      throw error;
    }
  },

  /**
   * Clears checkpoint manager for a session (cleanup on session end)
   */
  async clearCheckpointManager(sessionId: string): Promise<void> {
    try {
      await invoke("clear_checkpoint_manager", { sessionId });
    } catch (error) {
      console.error("Failed to clear checkpoint manager:", error);
      throw error;
    }
  },

  /**
   * Tracks a batch of messages for a session for checkpointing
   */
  trackSessionMessages: (
    sessionId: string,
    projectId: string,
    projectPath: string,
    messages: string[]
  ): Promise<void> =>
    invoke("track_session_messages", { sessionId, projectId, projectPath, messages }),

  /**
   * Adds a new MCP server
   */
  async mcpAdd(
    name: string,
    transport: string,
    command?: string,
    args: string[] = [],
    env: Record<string, string> = {},
    url?: string,
    scope: string = "local"
  ): Promise<AddServerResult> {
    try {
      return await invoke<AddServerResult>("mcp_add", {
        name,
        transport,
        command,
        args,
        env,
        url,
        scope
      });
    } catch (error) {
      console.error("Failed to add MCP server:", error);
      throw error;
    }
  },

  /**
   * Lists all configured MCP servers
   */
  async mcpList(): Promise<MCPServer[]> {
    try {
      console.log("API: Calling mcp_list...");
      const result = await invoke<MCPServer[]>("mcp_list");
      console.log("API: mcp_list returned:", result);
      return result;
    } catch (error) {
      console.error("API: Failed to list MCP servers:", error);
      throw error;
    }
  },

  /**
   * Gets details for a specific MCP server
   */
  async mcpGet(name: string): Promise<MCPServer> {
    try {
      return await invoke<MCPServer>("mcp_get", { name });
    } catch (error) {
      console.error("Failed to get MCP server:", error);
      throw error;
    }
  },

  /**
   * Removes an MCP server
   */
  async mcpRemove(name: string): Promise<string> {
    try {
      return await invoke<string>("mcp_remove", { name });
    } catch (error) {
      console.error("Failed to remove MCP server:", error);
      throw error;
    }
  },

  /**
   * Adds an MCP server from JSON configuration
   */
  async mcpAddJson(name: string, jsonConfig: string, scope: string = "local"): Promise<AddServerResult> {
    try {
      return await invoke<AddServerResult>("mcp_add_json", { name, jsonConfig, scope });
    } catch (error) {
      console.error("Failed to add MCP server from JSON:", error);
      throw error;
    }
  },

  /**
   * Imports MCP servers from Claude Desktop
   */
  async mcpAddFromClaudeDesktop(scope: string = "local"): Promise<ImportResult> {
    try {
      return await invoke<ImportResult>("mcp_add_from_claude_desktop", { scope });
    } catch (error) {
      console.error("Failed to import from Claude Desktop:", error);
      throw error;
    }
  },

  /**
   * Starts Claude Code as an MCP server
   */
  async mcpServe(): Promise<string> {
    try {
      return await invoke<string>("mcp_serve");
    } catch (error) {
      console.error("Failed to start MCP server:", error);
      throw error;
    }
  },

  /**
   * Tests connection to an MCP server
   */
  async mcpTestConnection(name: string): Promise<string> {
    try {
      return await invoke<string>("mcp_test_connection", { name });
    } catch (error) {
      console.error("Failed to test.md MCP connection:", error);
      throw error;
    }
  },

  /**
   * Resets project-scoped server approval choices
   */
  async mcpResetProjectChoices(): Promise<string> {
    try {
      return await invoke<string>("mcp_reset_project_choices");
    } catch (error) {
      console.error("Failed to reset project choices:", error);
      throw error;
    }
  },

  /**
   * Gets the status of MCP servers
   */
  async mcpGetServerStatus(): Promise<Record<string, ServerStatus>> {
    try {
      return await invoke<Record<string, ServerStatus>>("mcp_get_server_status");
    } catch (error) {
      console.error("Failed to get server status:", error);
      throw error;
    }
  },

  /**
   * Reads .mcp.json from the current project
   */
  async mcpReadProjectConfig(projectPath: string): Promise<MCPProjectConfig> {
    try {
      return await invoke<MCPProjectConfig>("mcp_read_project_config", { projectPath });
    } catch (error) {
      console.error("Failed to read project MCP config:", error);
      throw error;
    }
  },

  /**
   * Saves .mcp.json to the current project
   */
  async mcpSaveProjectConfig(projectPath: string, config: MCPProjectConfig): Promise<string> {
    try {
      return await invoke<string>("mcp_save_project_config", { projectPath, config });
    } catch (error) {
      console.error("Failed to save project MCP config:", error);
      throw error;
    }
  },

  /**
   * Export configuration for MCP server
   */
  async mcpExportServers(): Promise<{
    servers: Array<{
      name: string;
      transport: string;
      command?: string;
      args: string[];
      env: Record<string, string>;
      url?: string;
      scope: string;
    }>;
    format: string;
  }> {
    try {
      return await invoke("mcp_export_servers");
    } catch (error) {
      console.error("Failed to export MCP servers:", error);
      throw error;
    }
  },

  /**
   * Get the stored Claude binary path from settings
   * @returns Promise resolving to the path if set, null otherwise
   */
  async getClaudeBinaryPath(): Promise<string | null> {
    try {
      return await invoke<string | null>("get_claude_binary_path");
    } catch (error) {
      console.error("Failed to get Claude binary path:", error);
      throw error;
    }
  },

  /**
   * Set the Claude binary path in settings
   * @param path - The absolute path to the Claude binary
   * @returns Promise resolving when the path is saved
   */
  async setClaudeBinaryPath(path: string): Promise<void> {
    try {
      return await invoke<void>("set_claude_binary_path", { path });
    } catch (error) {
      console.error("Failed to set Claude binary path:", error);
      throw error;
    }
  },

  /**
   * List all available Claude installations on the system
   * @returns Promise resolving to an array of Claude installations
   */
  async listClaudeInstallations(): Promise<ClaudeInstallation[]> {
    try {
      return await invoke<ClaudeInstallation[]>("list_claude_installations");
    } catch (error) {
      console.error("Failed to list Claude installations:", error);
      throw error;
    }
  },

  // Storage API methods

  /**
   * Lists all tables in the SQLite database
   * @returns Promise resolving to an array of table information
   */
  async storageListTables(): Promise<any[]> {
    try {
      return await invoke<any[]>("storage_list_tables");
    } catch (error) {
      console.error("Failed to list tables:", error);
      throw error;
    }
  },

  /**
   * Reads table data with pagination
   * @param tableName - Name of the table to read
   * @param page - Page number (1-indexed)
   * @param pageSize - Number of rows per page
   * @param searchQuery - Optional search query
   * @returns Promise resolving to table data with pagination info
   */
  async storageReadTable(
    tableName: string,
    page: number,
    pageSize: number,
    searchQuery?: string
  ): Promise<any> {
    try {
      return await invoke<any>("storage_read_table", {
        tableName,
        page,
        pageSize,
        searchQuery,
      });
    } catch (error) {
      console.error("Failed to read table:", error);
      throw error;
    }
  },

  /**
   * Updates a row in a table
   * @param tableName - Name of the table
   * @param primaryKeyValues - Map of primary key column names to values
   * @param updates - Map of column names to new values
   * @returns Promise resolving when the row is updated
   */
  async storageUpdateRow(
    tableName: string,
    primaryKeyValues: Record<string, any>,
    updates: Record<string, any>
  ): Promise<void> {
    try {
      return await invoke<void>("storage_update_row", {
        tableName,
        primaryKeyValues,
        updates,
      });
    } catch (error) {
      console.error("Failed to update row:", error);
      throw error;
    }
  },

  /**
   * Deletes a row from a table
   * @param tableName - Name of the table
   * @param primaryKeyValues - Map of primary key column names to values
   * @returns Promise resolving when the row is deleted
   */
  async storageDeleteRow(
    tableName: string,
    primaryKeyValues: Record<string, any>
  ): Promise<void> {
    try {
      return await invoke<void>("storage_delete_row", {
        tableName,
        primaryKeyValues,
      });
    } catch (error) {
      console.error("Failed to delete row:", error);
      throw error;
    }
  },

  /**
   * Inserts a new row into a table
   * @param tableName - Name of the table
   * @param values - Map of column names to values
   * @returns Promise resolving to the last insert row ID
   */
  async storageInsertRow(
    tableName: string,
    values: Record<string, any>
  ): Promise<number> {
    try {
      return await invoke<number>("storage_insert_row", {
        tableName,
        values,
      });
    } catch (error) {
      console.error("Failed to insert row:", error);
      throw error;
    }
  },

  /**
   * Executes a raw SQL query
   * @param query - SQL query string
   * @returns Promise resolving to query result
   */
  async storageExecuteSql(query: string): Promise<any> {
    try {
      return await invoke<any>("storage_execute_sql", { query });
    } catch (error) {
      console.error("Failed to execute SQL:", error);
      throw error;
    }
  },

  /**
   * Resets the entire database
   * @returns Promise resolving when the database is reset
   */
  async storageResetDatabase(): Promise<void> {
    try {
      return await invoke<void>("storage_reset_database");
    } catch (error) {
      console.error("Failed to reset database:", error);
      throw error;
    }
  },

  // Theme settings helpers

  /**
   * Gets a setting from the app_settings table
   * @param key - The setting key to retrieve
   * @returns Promise resolving to the setting value or null if not found
   */
  async getSetting(key: string): Promise<string | null> {
    try {
      // Use storageReadTable to safely query the app_settings table
      const result = await this.storageReadTable('app_settings', 1, 1000);
      const setting = result?.data?.find((row: any) => row.key === key);
      return setting?.value || null;
    } catch (error) {
      console.error(`Failed to get setting ${key}:`, error);
      return null;
    }
  },

  /**
   * Saves a setting to the app_settings table (insert or update)
   * @param key - The setting key
   * @param value - The setting value
   * @returns Promise resolving when the setting is saved
   */
  async saveSetting(key: string, value: string): Promise<void> {
    try {
      // Try to update first
      try {
        await this.storageUpdateRow(
          'app_settings',
          { key },
          { value }
        );
      } catch (updateError) {
        // If update fails (row doesn't exist), insert new row
        await this.storageInsertRow('app_settings', { key, value });
      }
    } catch (error) {
      console.error(`Failed to save setting ${key}:`, error);
      throw error;
    }
  },

  /**
   * Get hooks configuration for a specific scope
   * @param scope - The configuration scope: 'user', 'project', or 'local'
   * @param projectPath - Project path (required for project and local scopes)
   * @returns Promise resolving to the hooks configuration
   */
  async getHooksConfig(scope: 'user' | 'project' | 'local', projectPath?: string): Promise<HooksConfiguration> {
    try {
      return await invoke<HooksConfiguration>("get_hooks_config", { scope, projectPath });
    } catch (error) {
      console.error("Failed to get hooks config:", error);
      throw error;
    }
  },

  /**
   * Update hooks configuration for a specific scope
   * @param scope - The configuration scope: 'user', 'project', or 'local'
   * @param hooks - The hooks configuration to save
   * @param projectPath - Project path (required for project and local scopes)
   * @returns Promise resolving to success message
   */
  async updateHooksConfig(
    scope: 'user' | 'project' | 'local',
    hooks: HooksConfiguration,
    projectPath?: string
  ): Promise<string> {
    try {
      return await invoke<string>("update_hooks_config", { scope, projectPath, hooks });
    } catch (error) {
      console.error("Failed to update hooks config:", error);
      throw error;
    }
  },

  /**
   * Validate a hook command syntax
   * @param command - The shell command to validate
   * @returns Promise resolving to validation result
   */
  async validateHookCommand(command: string): Promise<{ valid: boolean; message: string }> {
    try {
      return await invoke<{ valid: boolean; message: string }>("validate_hook_command", { command });
    } catch (error) {
      console.error("Failed to validate hook command:", error);
      throw error;
    }
  },

  /**
   * Get merged hooks configuration (respecting priority)
   * @param projectPath - The project path
   * @returns Promise resolving to merged hooks configuration
   */
  async getMergedHooksConfig(projectPath: string): Promise<HooksConfiguration> {
    try {
      const [userHooks, projectHooks, localHooks] = await Promise.all([
        this.getHooksConfig('user'),
        this.getHooksConfig('project', projectPath),
        this.getHooksConfig('local', projectPath)
      ]);

      // Import HooksManager for merging
      const { HooksManager } = await import('@/lib/hooksManager');
      return HooksManager.mergeConfigs(userHooks, projectHooks, localHooks);
    } catch (error) {
      console.error("Failed to get merged hooks config:", error);
      throw error;
    }
  },

  // Slash Commands API methods

  /**
   * Lists all available slash commands
   * @param projectPath - Optional project path to include project-specific commands
   * @returns Promise resolving to array of slash commands
   */
  async slashCommandsList(projectPath?: string): Promise<SlashCommand[]> {
    try {
      return await invoke<SlashCommand[]>("slash_commands_list", { projectPath });
    } catch (error) {
      console.error("Failed to list slash commands:", error);
      throw error;
    }
  },

  /**
   * Gets a single slash command by ID
   * @param commandId - Unique identifier of the command
   * @returns Promise resolving to the slash command
   */
  async slashCommandGet(commandId: string): Promise<SlashCommand> {
    try {
      return await invoke<SlashCommand>("slash_command_get", { commandId });
    } catch (error) {
      console.error("Failed to get slash command:", error);
      throw error;
    }
  },

  /**
   * Creates or updates a slash command
   * @param scope - Command scope: "project" or "user"
   * @param name - Command name (without prefix)
   * @param namespace - Optional namespace for organization
   * @param content - Markdown content of the command
   * @param description - Optional description
   * @param allowedTools - List of allowed tools for this command
   * @param projectPath - Required for project scope commands
   * @returns Promise resolving to the saved command
   */
  async slashCommandSave(
    scope: string,
    name: string,
    namespace: string | undefined,
    content: string,
    description: string | undefined,
    allowedTools: string[],
    projectPath?: string
  ): Promise<SlashCommand> {
    try {
      return await invoke<SlashCommand>("slash_command_save", {
        scope,
        name,
        namespace,
        content,
        description,
        allowedTools,
        projectPath
      });
    } catch (error) {
      console.error("Failed to save slash command:", error);
      throw error;
    }
  },

  /**
   * Deletes a slash command
   * @param commandId - Unique identifier of the command to delete
   * @param projectPath - Optional project path for deleting project commands
   * @returns Promise resolving to deletion message
   */
  async slashCommandDelete(commandId: string, projectPath?: string): Promise<string> {
    try {
      return await invoke<string>("slash_command_delete", { commandId, projectPath });
    } catch (error) {
      console.error("Failed to delete slash command:", error);
      throw error;
    }
  },

  // ================================
  // Language Settings
  // ================================

  /**
   * Gets the current language setting
   * @returns Promise resolving to the current language locale
   */
  async getCurrentLanguage(): Promise<string> {
    try {
      return await invoke<string>("get_current_language");
    } catch (error) {
      console.error("Failed to get current language:", error);
      throw error;
    }
  },

  /**
   * Sets the language setting
   * @param locale - Language locale to set (e.g., 'en-US', 'zh-CN')
   * @returns Promise resolving when language is set
   */
  async setLanguage(locale: string): Promise<void> {
    try {
      await invoke<void>("set_language", { locale });
    } catch (error) {
      console.error("Failed to set language:", error);
      throw error;
    }
  },

  /**
   * Gets the list of supported languages
   * @returns Promise resolving to array of supported language locales
   */
  async getSupportedLanguages(): Promise<string[]> {
    try {
      return await invoke<string[]>("get_supported_languages");
    } catch (error) {
      console.error("Failed to get supported languages:", error);
      throw error;
    }
  },

  // ================================
  // Relay Stations
  // ================================

  /**
   * Lists all relay stations
   * @returns Promise resolving to array of relay stations
   */
  async relayStationsList(): Promise<RelayStation[]> {
    try {
      return await invoke<RelayStation[]>("relay_stations_list");
    } catch (error) {
      console.error("Failed to list relay stations:", error);
      throw error;
    }
  },

  /**
   * Gets a single relay station by ID
   * @param id - The relay station ID
   * @returns Promise resolving to the relay station
   */
  async relayStationGet(id: string): Promise<RelayStation> {
    try {
      return await invoke<RelayStation>("relay_station_get", { id });
    } catch (error) {
      console.error("Failed to get relay station:", error);
      throw error;
    }
  },

  /**
   * Creates a new relay station
   * @param request - The relay station creation request
   * @returns Promise resolving to the created relay station
   */
  async relayStationCreate(request: CreateRelayStationRequest): Promise<RelayStation> {
    try {
      return await invoke<RelayStation>("relay_station_create", { request });
    } catch (error) {
      console.error("Failed to create relay station:", error);
      throw error;
    }
  },

  /**
   * Updates an existing relay station
   * @param request - The relay station update request
   * @returns Promise resolving to the updated relay station
   */
  async relayStationUpdate(request: UpdateRelayStationRequest): Promise<RelayStation> {
    try {
      return await invoke<RelayStation>("relay_station_update", { request });
    } catch (error) {
      console.error("Failed to update relay station:", error);
      throw error;
    }
  },

  /**
   * Deletes a relay station
   * @param id - The relay station ID
   * @returns Promise resolving to success message
   */
  async relayStationDelete(id: string): Promise<string> {
    try {
      return await invoke<string>("relay_station_delete", { id });
    } catch (error) {
      console.error("Failed to delete relay station:", error);
      throw error;
    }
  },

  /**
   * Toggles relay station enable status (ensures only one station is enabled)
   * @param id - The relay station ID
   * @param enabled - Whether to enable or disable the station
   * @returns Promise resolving to success message
   */
  async relayStationToggleEnable(id: string, enabled: boolean): Promise<string> {
    try {
      return await invoke<string>("relay_station_toggle_enable", { id, enabled });
    } catch (error) {
      console.error("Failed to toggle relay station enable status:", error);
      throw error;
    }
  },

  /**
   * Syncs relay station config to Claude settings.json
   * @returns Promise resolving to sync result message
   */
  async relayStationSyncConfig(): Promise<string> {
    try {
      return await invoke<string>("relay_station_sync_config");
    } catch (error) {
      console.error("Failed to sync relay station config:", error);
      throw error;
    }
  },

  /**
   * Restores Claude config from backup
   * @returns Promise resolving to restore result message
   */
  async relayStationRestoreConfig(): Promise<string> {
    try {
      return await invoke<string>("relay_station_restore_config");
    } catch (error) {
      console.error("Failed to restore config:", error);
      throw error;
    }
  },

  /**
   * Flush system DNS cache
   * @returns Promise resolving to success message
   */
  async flushDns(): Promise<string> {
    try {
      return await invoke<string>("flush_dns");
    } catch (error) {
      console.error("Failed to flush DNS:", error);
      throw error;
    }
  },

  /**
   * Gets current API config from Claude settings
   * @returns Promise resolving to current config info
   */
  async relayStationGetCurrentConfig(): Promise<Record<string, string | null>> {
    try {
      return await invoke<Record<string, string | null>>("relay_station_get_current_config");
    } catch (error) {
      console.error("Failed to get current config:", error);
      throw error;
    }
  },

  /**
   * Exports all relay stations configuration
   * @returns Promise resolving to array of relay stations
   */
  async relayStationsExport(): Promise<RelayStation[]> {
    try {
      return await invoke<RelayStation[]>("relay_stations_export");
    } catch (error) {
      console.error("Failed to export relay stations:", error);
      throw error;
    }
  },

  /**
   * Imports relay stations configuration
   * @param stations - Array of relay stations to import
   * @param clearExisting - Whether to clear existing stations before import
   * @returns Promise resolving to success message
   */
  async relayStationsImport(stations: CreateRelayStationRequest[], clearExisting: boolean = false): Promise<ImportResult> {
    try {
      return await invoke<ImportResult>("relay_stations_import", {
        request: {
          stations,
          clear_existing: clearExisting
        }
      });
    } catch (error) {
      console.error("Failed to import relay stations:", error);
      throw error;
    }
  },

  /**
   * Gets relay station information
   * @param stationId - The relay station ID
   * @returns Promise resolving to station information
   */
  async relayStationGetInfo(stationId: string): Promise<StationInfo> {
    try {
      return await invoke<StationInfo>("relay_station_get_info", { stationId });
    } catch (error) {
      console.error("Failed to get station info:", error);
      throw error;
    }
  },

  /**
   * Gets user information from relay station
   * @param stationId - The relay station ID
   * @param userId - The user ID
   * @returns Promise resolving to user information
   */
  async relayStationGetUserInfo(stationId: string, userId: string): Promise<UserInfo> {
    try {
      return await invoke<UserInfo>("relay_station_get_user_info", { stationId, userId });
    } catch (error) {
      console.error("Failed to get user info:", error);
      throw error;
    }
  },

  /**
   * Tests relay station connection
   * @param stationId - The relay station ID
   * @returns Promise resolving to connection test.md result
   */
  async relayStationTestConnection(stationId: string): Promise<ConnectionTestResult> {
    try {
      return await invoke<ConnectionTestResult>("relay_station_test_connection", { stationId });
    } catch (error) {
      console.error("Failed to test.md connection:", error);
      throw error;
    }
  },

  /**
   * Gets usage logs from relay station
   * @param stationId - The relay station ID
   * @param userId - The user ID
   * @param page - Page number (optional)
   * @param size - Page size (optional)
   * @returns Promise resolving to usage logs
   */
  async relayStationGetUsageLogs(
    stationId: string,
    userId: string,
    page?: number,
    size?: number
  ): Promise<any> {
    try {
      return await invoke<any>("relay_station_get_usage_logs", { stationId, userId, page, size });
    } catch (error) {
      console.error("Failed to get usage logs:", error);
      throw error;
    }
  },

  /**
   * Lists tokens from relay station
   * @param stationId - The relay station ID
   * @param page - Page number (optional)
   * @param size - Page size (optional)
   * @returns Promise resolving to token pagination response
   */
  async relayStationListTokens(
    stationId: string,
    page?: number,
    size?: number
  ): Promise<TokenPaginationResponse> {
    try {
      return await invoke<TokenPaginationResponse>("relay_station_list_tokens", { stationId, page, size });
    } catch (error) {
      console.error("Failed to list tokens:", error);
      throw error;
    }
  },

  /**
   * Creates a new token on relay station
   * @param stationId - The relay station ID
   * @param name - Token name
   * @param quota - Token quota (optional)
   * @returns Promise resolving to created token info
   */
  async relayStationCreateToken(
    stationId: string,
    name: string,
    quota?: number
  ): Promise<TokenInfo> {
    try {
      return await invoke<TokenInfo>("relay_station_create_token", { stationId, name, quota });
    } catch (error) {
      console.error("Failed to create token:", error);
      throw error;
    }
  },

  /**
   * Updates a token on relay station
   * @param stationId - The relay station ID
   * @param tokenId - The token ID
   * @param name - New token name (optional)
   * @param quota - New token quota (optional)
   * @returns Promise resolving to updated token info
   */
  async relayStationUpdateToken(
    stationId: string,
    tokenId: string,
    name?: string,
    quota?: number
  ): Promise<TokenInfo> {
    try {
      return await invoke<TokenInfo>("relay_station_update_token", { stationId, tokenId, name, quota });
    } catch (error) {
      console.error("Failed to update token:", error);
      throw error;
    }
  },

  /**
   * Deletes a token from relay station
   * @param stationId - The relay station ID
   * @param tokenId - The token ID
   * @returns Promise resolving to success message
   */
  async relayStationDeleteToken(stationId: string, tokenId: string): Promise<string> {
    try {
      return await invoke<string>("relay_station_delete_token", { stationId, tokenId });
    } catch (error) {
      console.error("Failed to delete token:", error);
      throw error;
    }
  },

  /**
   * Updates the display order of relay stations
   * @author yovinchen
   * @param stationIds - Array of station IDs in the new order
   * @returns Promise resolving when order is updated
   */
  async relayStationUpdateOrder(stationIds: string[]): Promise<void> {
    try {
      return await invoke<void>("relay_station_update_order", { stationIds });
    } catch (error) {
      console.error("Failed to update relay station order:", error);
      throw error;
    }
  },

  // ============= PackyCode Nodes =============

  /**
   * Tests all PackyCode nodes and returns speed test.md results
   * @returns Promise resolving to array of node speed test.md results
   */
  async testAllPackycodeNodes(): Promise<NodeSpeedTestResult[]> {
    try {
      return await invoke<NodeSpeedTestResult[]>("test_all_packycode_nodes");
    } catch (error) {
      console.error("Failed to test.md PackyCode nodes:", error);
      throw error;
    }
  },

  /**
   * Automatically selects the best PackyCode node based on speed
   * @returns Promise resolving to the best node
   */
  async autoSelectBestNode(): Promise<PackycodeNode> {
    try {
      return await invoke<PackycodeNode>("auto_select_best_node");
    } catch (error) {
      console.error("Failed to auto-select best node:", error);
      throw error;
    }
  },

  /**
   * Gets all available PackyCode nodes
   * @returns Promise resolving to array of PackyCode nodes
   */
  async getPackycodeNodes(): Promise<PackycodeNode[]> {
    try {
      return await invoke<PackycodeNode[]>("get_packycode_nodes");
    } catch (error) {
      console.error("Failed to get PackyCode nodes:", error);
      throw error;
    }
  },

  /**
   * Gets PackyCode user quota information
   * @param stationId - The relay station ID
   * @returns Promise resolving to the user quota information
   */
  async getPackycodeUserQuota(stationId: string): Promise<PackycodeUserQuota> {
    try {
      return await invoke<PackycodeUserQuota>("packycode_get_user_quota", { stationId });
    } catch (error) {
      console.error("Failed to get PackyCode user quota:", error);
      throw error;
    }
  },

  // ============= File System Watching =============

  /**
   * Starts watching a directory for file system changes
   * @param directoryPath - The directory path to watch
   * @param recursive - Whether to watch subdirectories recursively
   * @returns Promise resolving when watching starts
   */
  async watchDirectory(directoryPath: string, recursive: boolean = true): Promise<void> {
    try {
      return await invoke<void>("watch_directory", { path: directoryPath, recursive });
    } catch (error) {
      console.error("Failed to watch directory:", error);
      throw error;
    }
  },

  /**
   * Stops watching a directory for file system changes
   * @param directoryPath - The directory path to stop watching
   * @returns Promise resolving when watching stops
   */
  async unwatchDirectory(directoryPath: string): Promise<void> {
    try {
      return await invoke<void>("unwatch_directory", { path: directoryPath });
    } catch (error) {
      console.error("Failed to unwatch directory:", error);
      throw error;
    }
  },

  // ============= Claude Project Directory Watching =============

  /**
   * Starts watching Claude project directory for the given project path
   * @param projectPath - The project path to find the corresponding Claude directory
   * @returns Promise resolving when watching starts
   */
  async watchClaudeProjectDirectory(projectPath: string): Promise<void> {
    try {
      return await invoke<void>("watch_claude_project_directory", { projectPath });
    } catch (error) {
      console.error("Failed to watch Claude project directory:", error);
      throw error;
    }
  },

  /**
   * Stops watching Claude project directory for the given project path
   * @param projectPath - The project path to find the corresponding Claude directory
   * @returns Promise resolving when watching stops
   */
  async unwatchClaudeProjectDirectory(projectPath: string): Promise<void> {
    try {
      return await invoke<void>("unwatch_claude_project_directory", { projectPath });
    } catch (error) {
      console.error("Failed to unwatch Claude project directory:", error);
      throw error;
    }
  },

  // ============= Terminal API =============

  /**
   * Creates a new terminal session using Zellij
   * @param workingDirectory - The working directory for the terminal session
   * @returns Promise resolving to the session ID
   */
  async createTerminalSession(workingDirectory: string): Promise<string> {
    try {
      return await invoke<string>("create_terminal_session", { workingDirectory });
    } catch (error) {
      console.error("Failed to create terminal session:", error);
      throw error;
    }
  },

  /**
   * Sends input to a terminal session
   * @param sessionId - The terminal session ID
   * @param input - The input data to send
   * @returns Promise resolving when input is sent
   */
  async sendTerminalInput(sessionId: string, input: string): Promise<void> {
    try {
      return await invoke<void>("send_terminal_input", { sessionId, input });
    } catch (error) {
      console.error("Failed to send terminal input:", error);
      throw error;
    }
  },

  /**
   * Listen to terminal output for a session
   * @param sessionId - The terminal session ID
   * @param callback - Callback function to handle output
   * @returns Promise resolving to unlisten function
   */
  async listenToTerminalOutput(sessionId: string, callback: (data: string) => void): Promise<() => void> {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten = await listen<string>(`terminal-output:${sessionId}`, (event) => {
        callback(event.payload);
      });
      return unlisten;
    } catch (error) {
      console.error("Failed to listen to terminal output:", error);
      throw error;
    }
  },

  /**
   * Closes a terminal session
   * @param sessionId - The terminal session ID to close
   * @returns Promise resolving when session is closed
   */
  async closeTerminalSession(sessionId: string): Promise<void> {
    try {
      return await invoke<void>("close_terminal_session", { sessionId });
    } catch (error) {
      console.error("Failed to close terminal session:", error);
      throw error;
    }
  },

  /**
   * Lists all active terminal sessions
   * @returns Promise resolving to array of active terminal session IDs
   */
  async listTerminalSessions(): Promise<string[]> {
    try {
      return await invoke<string[]>("list_terminal_sessions");
    } catch (error) {
      console.error("Failed to list terminal sessions:", error);
      throw error;
    }
  },

  /**
   * Resizes a terminal session
   * @param sessionId - The terminal session ID
   * @param cols - Number of columns
   * @param rows - Number of rows
   * @returns Promise resolving when resize is complete
   */
  async resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void> {
    try {
      return await invoke<void>("resize_terminal", { sessionId, cols, rows });
    } catch (error) {
      console.error("Failed to resize terminal:", error);
      throw error;
    }
  },

  /**
   * Cleanup orphaned terminal sessions
   * @returns Promise resolving to the number of sessions cleaned up
   */
  async cleanupTerminalSessions(): Promise<number> {
    try {
      return await invoke<number>("cleanup_terminal_sessions");
    } catch (error) {
      console.error("Failed to cleanup terminal sessions:", error);
      throw error;
    }
  },

  /**
   * Get all model mappings
   * @author yovinchen
   */
  async getModelMappings(): Promise<ModelMapping[]> {
    try {
      return await invoke<ModelMapping[]>("get_model_mappings");
    } catch (error) {
      console.error("Failed to get model mappings:", error);
      throw error;
    }
  },

  /**
   * Update a model mapping
   * @author yovinchen
   */
  async updateModelMapping(alias: string, modelName: string): Promise<void> {
    try {
      await invoke("update_model_mapping", { alias, modelName });
    } catch (error) {
      console.error("Failed to update model mapping:", error);
      throw error;
    }
  }
};

// CCR (Claude Code Router) Related Interfaces
export interface CcrServiceStatus {
  is_running: boolean;
  port?: number;
  endpoint?: string;
  has_ccr_binary: boolean;
  ccr_version?: string;
  process_id?: number;
  raw_output?: string;
}

export interface CcrServiceInfo {
  status: CcrServiceStatus;
  message: string;
}

// CCR API methods
export const ccrApi = {
  /**
   * Check if CCR is installed
   */
  async checkInstallation(): Promise<boolean> {
    try {
      return await invoke<boolean>("check_ccr_installation");
    } catch (error) {
      console.error("Failed to check CCR installation:", error);
      throw error;
    }
  },

  /**
   * Get CCR version
   */
  async getVersion(): Promise<string> {
    try {
      return await invoke<string>("get_ccr_version");
    } catch (error) {
      console.error("Failed to get CCR version:", error);
      throw error;
    }
  },

  /**
   * Get CCR service status
   */
  async getServiceStatus(): Promise<CcrServiceStatus> {
    try {
      return await invoke<CcrServiceStatus>("get_ccr_service_status");
    } catch (error) {
      console.error("Failed to get CCR service status:", error);
      throw error;
    }
  },

  /**
   * Start CCR service
   */
  async startService(): Promise<CcrServiceInfo> {
    try {
      return await invoke<CcrServiceInfo>("start_ccr_service");
    } catch (error) {
      console.error("Failed to start CCR service:", error);
      throw error;
    }
  },

  /**
   * Stop CCR service
   */
  async stopService(): Promise<CcrServiceInfo> {
    try {
      return await invoke<CcrServiceInfo>("stop_ccr_service");
    } catch (error) {
      console.error("Failed to stop CCR service:", error);
      throw error;
    }
  },

  /**
   * Restart CCR service
   */
  async restartService(): Promise<CcrServiceInfo> {
    try {
      return await invoke<CcrServiceInfo>("restart_ccr_service");
    } catch (error) {
      console.error("Failed to restart CCR service:", error);
      throw error;
    }
  },

  /**
   * Open CCR UI
   */
  async openUI(): Promise<string> {
    try {
      return await invoke<string>("open_ccr_ui");
    } catch (error) {
      console.error("Failed to open CCR UI:", error);
      throw error;
    }
  },

  /**
   * Get CCR config file path
   */
  async getConfigPath(): Promise<string> {
    try {
      return await invoke<string>("get_ccr_config_path");
    } catch (error) {
      console.error("Failed to get CCR config path:", error);
      throw error;
    }
  }
};

/**
 * Model mapping structure
 * @author yovinchen
 */
export interface ModelMapping {
  alias: string;
  model_name: string;
  updated_at: string;
}
