import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft,
  Terminal as TerminalIcon,
  FolderOpen,
  Copy,
  ChevronDown,
  GitBranch,
  Settings,
  Settings2,
  ChevronUp,
  X,
  Hash,
  Command,
  PanelLeftOpen,
  PanelRightOpen,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  FileText,
  FilePlus,
  FileX,
  Clock,
  Square
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover } from "@/components/ui/popover";
import { useTranslation } from "react-i18next";
import { api, type Session } from "@/lib/api";
import { cn } from "@/lib/utils";
import { open } from "@tauri-apps/plugin-dialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { StreamMessage } from "./StreamMessage";
import { FloatingPromptInput, type FloatingPromptInputRef } from "./FloatingPromptInput";
import { TimelineNavigator } from "./TimelineNavigator";
import { CheckpointSettings } from "./CheckpointSettings";
import { fileSyncManager } from "@/lib/fileSyncManager";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SplitPane } from "@/components/ui/split-pane";
import { WebviewPreview } from "./WebviewPreview";
import { FileExplorerPanelEnhanced } from "./FileExplorerPanelEnhanced";
import { GitPanelEnhanced } from "./GitPanelEnhanced";
import { FileEditorEnhanced } from "./FileEditorEnhanced";
import { SlashCommandsManager } from "./SlashCommandsManager";
import type { ClaudeStreamMessage } from "./AgentExecution";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTrackEvent, useComponentMetrics, useWorkflowTracking, useLayoutManager } from "@/hooks";
// import { GridLayoutContainer, ResponsivePanel } from "@/components/ui/grid-layout";

// 文件变化监控接口
interface FileChange {
  path: string;
  changeType: 'created' | 'modified' | 'deleted' | 'renamed';
  timestamp: number;
  oldPath?: string; // 用于重命名操作
}

// 新增布局组件导入
import { FlexLayoutContainer } from "@/components/layout/FlexLayoutContainer";
import { MainContentArea } from "@/components/layout/MainContentArea";
import { SidePanel } from "@/components/layout/SidePanel";
import { ChatView } from "@/components/layout/ChatView";
import { Terminal } from "@/components/Terminal";

interface ClaudeCodeSessionProps {
  /**
   * Optional session to resume (when clicking from SessionList)
   */
  session?: Session;
  /**
   * Initial project path (for new sessions)
   */
  initialProjectPath?: string;
  /**
   * Callback to go back
   */
  onBack: () => void;
  /**
   * Callback to open hooks configuration
   */
  onProjectSettings?: (projectPath: string) => void;
  /**
   * Optional className for styling
   */
  className?: string;
  /**
   * Callback when streaming state changes
   */
  onStreamingChange?: (isStreaming: boolean, sessionId: string | null) => void;
}

/**
 * ClaudeCodeSession component for interactive Claude Code sessions
 * 
 * @example
 * <ClaudeCodeSession onBack={() => setView('projects')} />
 */
export const ClaudeCodeSession: React.FC<ClaudeCodeSessionProps> = ({
  session,
  initialProjectPath = "",
  onBack,
  onProjectSettings,
  className,
  onStreamingChange,
}) => {
  const { t } = useTranslation();
  const layoutManager = useLayoutManager(initialProjectPath || session?.project_path);
  const { 
    layout, 
    breakpoints, 
    toggleFileExplorer, 
    toggleGitPanel, 
    toggleTimeline,
    setPanelWidth,
    setSplitPosition: setLayoutSplitPosition,
    getResponsiveClasses,
    openFileEditor,
    closeFileEditor,
    openPreview: openLayoutPreview,
    closePreview: closeLayoutPreview,
    openTerminal,
    closeTerminal,
    toggleTerminalMaximize
  } = layoutManager;
  
  const [projectPath, setProjectPath] = useState(initialProjectPath || session?.project_path || "");
  const [messages, setMessages] = useState<ClaudeStreamMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawJsonlOutput, setRawJsonlOutput] = useState<string[]>([]);
  const [copyPopoverOpen, setCopyPopoverOpen] = useState(false);
  const [isFirstPrompt, setIsFirstPrompt] = useState(!session);
  const [totalTokens, setTotalTokens] = useState(0);
  const [extractedSessionInfo, setExtractedSessionInfo] = useState<{ sessionId: string; projectId: string } | null>(null);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);
  const [timelineVersion, setTimelineVersion] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showForkDialog, setShowForkDialog] = useState(false);
  const [showSlashCommandsSettings, setShowSlashCommandsSettings] = useState(false);
  const [forkCheckpointId, setForkCheckpointId] = useState<string | null>(null);
  const [forkSessionName, setForkSessionName] = useState("");
  
  // Queued prompts state
  const [queuedPrompts, setQueuedPrompts] = useState<Array<{ id: string; prompt: string; model: "sonnet" | "opus" | "opus-plan" }>>([]);
  
  // 使用布局管理器的预览功能
  // Note: openLayoutPreview is used directly instead of wrapping in handleOpenPreview
  
  const handleClosePreview = useCallback(() => {
    closeLayoutPreview();
    setIsPreviewMaximized(false);
  }, [closeLayoutPreview]);
  
  // 添加临时状态用于预览提示
  const [showPreviewPrompt, setShowPreviewPrompt] = useState(false);
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  
  // Add collapsed state for queued prompts
  const [queuedPromptsCollapsed, setQueuedPromptsCollapsed] = useState(false);
  
  // 文件监控相关状态
  const [fileChanges, setFileChanges] = useState<FileChange[]>([]);
  const [isFileWatching, setIsFileWatching] = useState(false);
  const [fileMonitorCollapsed, setFileMonitorCollapsed] = useState(false);
  const [fileMonitorExpanded, setFileMonitorExpanded] = useState(false);
  
  // File editor state
  // 移除重复的状态，使用 layout 中的状态
  // const [editingFile, setEditingFile] = useState<string | null>(null); // 移除，使用 layout.editingFile
  
  const parentRef = useRef<HTMLDivElement>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const hasActiveSessionRef = useRef(false);
  const floatingPromptRef = useRef<FloatingPromptInputRef>(null);
  const queuedPromptsRef = useRef<Array<{ id: string; prompt: string; model: "sonnet" | "opus" | "opus-plan" }>>([]);
  const isMountedRef = useRef(true);
  const isListeningRef = useRef(false);
  const sessionStartTime = useRef<number>(Date.now());
  const fileWatcherUnlistenRef = useRef<UnlistenFn | null>(null);
  
  // Session metrics state for enhanced analytics
  const sessionMetrics = useRef({
    firstMessageTime: null as number | null,
    promptsSent: 0,
    toolsExecuted: 0,
    toolsFailed: 0,
    filesCreated: 0,
    filesModified: 0,
    filesDeleted: 0,
    codeBlocksGenerated: 0,
    errorsEncountered: 0,
    lastActivityTime: Date.now(),
    toolExecutionTimes: [] as number[],
    checkpointCount: 0,
    wasResumed: !!session,
    modelChanges: [] as Array<{ from: string; to: string; timestamp: number }>,
  });

  // Analytics tracking
  const trackEvent = useTrackEvent();
  useComponentMetrics('ClaudeCodeSession');
  // const aiTracking = useAIInteractionTracking('sonnet'); // Default model
  const workflowTracking = useWorkflowTracking('claude_session');
  
  // 启动文件监控
  const startFileWatching = useCallback(async () => {
    if (!projectPath || isFileWatching) return;
    
    try {
      console.log('[FileMonitor] Starting file watching for:', projectPath);
      
      // 启动项目目录文件监控
      await api.watchDirectory(projectPath, true); // recursive = true
      
      // 启动 Claude 项目目录监控
      try {
        await api.watchClaudeProjectDirectory(projectPath);
        console.log('[FileMonitor] Claude project directory watching started for:', projectPath);
      } catch (claudeErr) {
        console.warn('[FileMonitor] Failed to start Claude project directory watching:', claudeErr);
        // 不影响主要的文件监控功能
      }
      
      setIsFileWatching(true);
      
      console.log('[FileMonitor] File watching started successfully');
      
      // 监听文件系统变化事件
      const unlisten = await listen<any>('file-system-change', (event) => {
        if (!isMountedRef.current) return;
        
        const { path, change_type } = event.payload;
        console.log('[FileMonitor] File change detected:', { path, change_type });
        
        // 过滤掉隐藏文件和临时文件
        const fileName = path.split('/').pop() || '';
        if (fileName.startsWith('.') || fileName.includes('~') || fileName.endsWith('.tmp')) {
          return;
        }
        
        // 通知文件同步管理器
        fileSyncManager.notifyFileChange(path, change_type);
        
        // 判断是否是 Claude 项目文件变化
        const isClaudeProjectFile = path.includes('/.claude/projects/');
        const displayPath = isClaudeProjectFile 
          ? path.replace(/.*\/\.claude\/projects\/[^/]+\//, '[Claude] ') // 简化 Claude 项目文件路径显示
          : path.replace(projectPath + '/', ''); // 项目文件相对路径
        
        const newChange: FileChange = {
          path: displayPath,
          changeType: change_type,
          timestamp: Date.now(),
        };
        
        setFileChanges(prev => {
          // 限制最多保存100个变化记录
          const updated = [newChange, ...prev].slice(0, 100);
          return updated;
        });
        
        // 如果是 Claude 项目文件变化且文件被修改，重新加载会话历史
        if (isClaudeProjectFile && change_type === 'modified' && session) {
          const fileName = path.split('/').pop() || '';
          // 检查是否是当前会话的 JSONL 文件
          if (fileName === `${session.id}.jsonl`) {
            console.log('[FileMonitor] Claude session file updated, reloading history');
            // 使用 setTimeout 避免频繁刷新
            setTimeout(() => {
              loadSessionHistory();
            }, 500);
          }
        }
      });
      
      fileWatcherUnlistenRef.current = unlisten;
    } catch (err) {
      console.error('[FileMonitor] Failed to start file watching:', err);
      setIsFileWatching(false);
    }
  }, [projectPath, isFileWatching]);
  
  // 停止文件监控
  const stopFileWatching = useCallback(async () => {
    if (!projectPath || !isFileWatching) return;
    
    try {
      console.log('[FileMonitor] Stopping file watching for:', projectPath);
      
      // 停止监听事件
      if (fileWatcherUnlistenRef.current) {
        fileWatcherUnlistenRef.current();
        fileWatcherUnlistenRef.current = null;
      }
      
      // 停止项目目录文件监控
      await api.unwatchDirectory(projectPath);
      
      // 停止 Claude 项目目录监控
      try {
        await api.unwatchClaudeProjectDirectory(projectPath);
        console.log('[FileMonitor] Claude project directory watching stopped for:', projectPath);
      } catch (claudeErr) {
        console.warn('[FileMonitor] Failed to stop Claude project directory watching:', claudeErr);
        // 不影响主要的停止功能
      }
      
      setIsFileWatching(false);
      
      // 清空文件变化记录
      setFileChanges([]);
      
      console.log('[FileMonitor] File watching stopped successfully');
    } catch (err) {
      console.error('[FileMonitor] Failed to stop file watching:', err);
      // 即使后端出错，也要更新前端状态
      setIsFileWatching(false);
      setFileChanges([]);
    }
  }, [projectPath, isFileWatching]);
  
  // 切换文件监控状态
  const toggleFileWatching = useCallback(() => {
    if (isFileWatching) {
      stopFileWatching();
    } else {
      startFileWatching();
    }
  }, [isFileWatching, startFileWatching, stopFileWatching]);
  
  // 清空文件变化历史
  const clearFileChanges = useCallback(() => {
    setFileChanges([]);
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    queuedPromptsRef.current = queuedPrompts;
  }, [queuedPrompts]);

  // Get effective session info (from prop or extracted) - use useMemo to ensure it updates
  const effectiveSession = useMemo(() => {
    if (session) return session;
    if (extractedSessionInfo) {
      return {
        id: extractedSessionInfo.sessionId,
        project_id: extractedSessionInfo.projectId,
        project_path: projectPath,
        created_at: Date.now(),
      } as Session;
    }
    return null;
  }, [session, extractedSessionInfo, projectPath]);

  // Filter out messages that shouldn't be displayed
  const displayableMessages = useMemo(() => {
    return messages.filter((message, index) => {
      // Skip meta messages that don't have meaningful content
      if (message.isMeta && !message.leafUuid && !message.summary) {
        return false;
      }

      // Skip user messages that only contain tool results that are already displayed
      if (message.type === "user" && message.message) {
        if (message.isMeta) return false;

        const msg = message.message;
        if (!msg.content || (Array.isArray(msg.content) && msg.content.length === 0)) {
          return false;
        }

        if (Array.isArray(msg.content)) {
          let hasVisibleContent = false;
          for (const content of msg.content) {
            if (content.type === "text") {
              hasVisibleContent = true;
              break;
            }
            if (content.type === "tool_result") {
              let willBeSkipped = false;
              if (content.tool_use_id) {
                // Look for the matching tool_use in previous assistant messages
                for (let i = index - 1; i >= 0; i--) {
                  const prevMsg = messages[i];
                  if (prevMsg.type === 'assistant' && prevMsg.message?.content && Array.isArray(prevMsg.message.content)) {
                    const toolUse = prevMsg.message.content.find((c: any) => 
                      c.type === 'tool_use' && c.id === content.tool_use_id
                    );
                    if (toolUse) {
                      const toolName = toolUse.name?.toLowerCase();
                      const toolsWithWidgets = [
                        'task', 'edit', 'multiedit', 'todowrite', 'ls', 'read', 
                        'glob', 'bash', 'write', 'grep'
                      ];
                      if (toolsWithWidgets.includes(toolName) || toolUse.name?.startsWith('mcp__')) {
                        willBeSkipped = true;
                      }
                      break;
                    }
                  }
                }
              }
              if (!willBeSkipped) {
                hasVisibleContent = true;
                break;
              }
            }
          }
          if (!hasVisibleContent) {
            return false;
          }
        }
      }
      return true;
    });
  }, [messages]);

  const rowVirtualizer = useVirtualizer({
    count: displayableMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150, // Estimate, will be dynamically measured
    overscan: 5,
  });

  // Debug logging
  useEffect(() => {
    console.log('[ClaudeCodeSession] State update:', {
      projectPath,
      session,
      extractedSessionInfo,
      effectiveSession,
      messagesCount: messages.length,
      isLoading
    });
  }, [projectPath, session, extractedSessionInfo, effectiveSession, messages.length, isLoading]);

  // Load session history if resuming
  useEffect(() => {
    if (session) {
      // Set the claudeSessionId immediately when we have a session
      setClaudeSessionId(session.id);
      
      // Load session history first, then check for active session
      const initializeSession = async () => {
        await loadSessionHistory();
        // After loading history, check if the session is still active
        if (isMountedRef.current) {
          await checkForActiveSession();
        }
      };
      
      initializeSession();
    }
  }, [session]); // Remove hasLoadedSession dependency to ensure it runs on mount

  // Report streaming state changes
  useEffect(() => {
    onStreamingChange?.(isLoading, claudeSessionId);
  }, [isLoading, claudeSessionId, onStreamingChange]);
  
  // 滚动到顶部
  const scrollToTop = useCallback(() => {
    if (parentRef.current) {
      parentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);
  
  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    if (parentRef.current) {
      parentRef.current.scrollTo({ top: parentRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (displayableMessages.length > 0) {
      // 使用setTimeout确保DOM更新后再滚动
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [displayableMessages.length, scrollToBottom]);

  // Calculate total tokens from messages
  useEffect(() => {
    const tokens = messages.reduce((total, msg) => {
      if (msg.message?.usage) {
        return total + msg.message.usage.input_tokens + msg.message.usage.output_tokens;
      }
      if (msg.usage) {
        return total + msg.usage.input_tokens + msg.usage.output_tokens;
      }
      return total;
    }, 0);
    setTotalTokens(tokens);
  }, [messages]);

  const loadSessionHistory = async () => {
    if (!session) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const history = await api.loadSessionHistory(session.id, session.project_id);
      
      // Convert history to messages format
      const loadedMessages: ClaudeStreamMessage[] = history.map(entry => ({
        ...entry,
        type: entry.type || "assistant"
      }));
      
      setMessages(loadedMessages);
      setRawJsonlOutput(history.map(h => JSON.stringify(h)));
      
      // After loading history, we're continuing a conversation
      setIsFirstPrompt(false);
      
      // 加载完成后自动滚动到底部
      setTimeout(() => {
        scrollToBottom();
      }, 200);
    } catch (err) {
      console.error("Failed to load session history:", err);
      setError("Failed to load session history");
    } finally {
      setIsLoading(false);
    }
  };

  const checkForActiveSession = async () => {
    // If we have a session prop, check if it's still active
    if (session) {
      try {
        const activeSessions = await api.listRunningClaudeSessions();
        const activeSession = activeSessions.find((s: any) => {
          if ('process_type' in s && s.process_type && 'ClaudeSession' in s.process_type) {
            return (s.process_type as any).ClaudeSession.session_id === session.id;
          }
          return false;
        });
        
        if (activeSession) {
          // Session is still active, reconnect to its stream
          console.log('[ClaudeCodeSession] Found active session, reconnecting:', session.id);
          // IMPORTANT: Set claudeSessionId before reconnecting
          setClaudeSessionId(session.id);
          
          // Don't add buffered messages here - they've already been loaded by loadSessionHistory
          // Just set up listeners for new messages
          
          // Set up listeners for the active session
          reconnectToSession(session.id);
        }
      } catch (err) {
        console.error('Failed to check for active sessions:', err);
      }
    }
  };

  const reconnectToSession = async (sessionId: string) => {
    console.log('[ClaudeCodeSession] Reconnecting to session:', sessionId);
    
    // Prevent duplicate listeners
    if (isListeningRef.current) {
      console.log('[ClaudeCodeSession] Already listening to session, skipping reconnect');
      return;
    }
    
    // Clean up previous listeners
    unlistenRefs.current.forEach(unlisten => unlisten());
    unlistenRefs.current = [];
    
    // IMPORTANT: Set the session ID before setting up listeners
    setClaudeSessionId(sessionId);
    
    // Mark as listening
    isListeningRef.current = true;
    
    // Set up session-specific listeners
    const outputUnlisten = await listen<string>(`claude-output:${sessionId}`, async (event) => {
      try {
        console.log('[ClaudeCodeSession] Received claude-output on reconnect:', event.payload);
        
        if (!isMountedRef.current) return;
        
        // Store raw JSONL
        setRawJsonlOutput(prev => [...prev, event.payload]);
        
        // Parse and display
        const message = JSON.parse(event.payload) as ClaudeStreamMessage;
        setMessages(prev => [...prev, message]);
      } catch (err) {
        console.error("Failed to parse message:", err, event.payload);
      }
    });

    const errorUnlisten = await listen<string>(`claude-error:${sessionId}`, (event) => {
      console.error("Claude error:", event.payload);
      if (isMountedRef.current) {
        setError(event.payload);
      }
    });

    const completeUnlisten = await listen<boolean>(`claude-complete:${sessionId}`, async (event) => {
      console.log('[ClaudeCodeSession] Received claude-complete on reconnect:', event.payload);
      if (isMountedRef.current) {
        setIsLoading(false);
        hasActiveSessionRef.current = false;
      }
    });

    unlistenRefs.current = [outputUnlisten, errorUnlisten, completeUnlisten];
    
    // Mark as loading to show the session is active
    if (isMountedRef.current) {
      setIsLoading(true);
      hasActiveSessionRef.current = true;
    }
  };

  const handleSelectPath = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Directory"
      });
      
      if (selected) {
        setProjectPath(selected as string);
        setError(null);
      }
    } catch (err) {
      console.error("Failed to select directory:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to select directory: ${errorMessage}`);
    }
  };

  const handleSendPrompt = async (prompt: string, model: "sonnet" | "opus" | "opus-plan") => {
    console.log('[ClaudeCodeSession] handleSendPrompt called with:', { prompt, model, projectPath, claudeSessionId, effectiveSession });
    
    if (!projectPath) {
      setError("Please select a project directory first");
      return;
    }

    // If already loading, queue the prompt
    if (isLoading) {
      const newPrompt = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        prompt,
        model
      };
      setQueuedPrompts(prev => [...prev, newPrompt]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      hasActiveSessionRef.current = true;
      
      // For resuming sessions, ensure we have the session ID
      if (effectiveSession && !claudeSessionId) {
        setClaudeSessionId(effectiveSession.id);
      }
      
      // Only clean up and set up new listeners if not already listening
      if (!isListeningRef.current) {
        // Clean up previous listeners
        unlistenRefs.current.forEach(unlisten => unlisten());
        unlistenRefs.current = [];
        
        // Mark as setting up listeners
        isListeningRef.current = true;
        
        // --------------------------------------------------------------------
        // 1️⃣  Event Listener Setup Strategy
        // --------------------------------------------------------------------
        // Claude Code may emit a *new* session_id even when we pass --resume. If
        // we listen only on the old session-scoped channel we will miss the
        // stream until the user navigates away & back. To avoid this we:
        //   • Always start with GENERIC listeners (no suffix) so we catch the
        //     very first "system:init" message regardless of the session id.
        //   • Once that init message provides the *actual* session_id, we
        //     dynamically switch to session-scoped listeners and stop the
        //     generic ones to prevent duplicate handling.
        // --------------------------------------------------------------------

        console.log('[ClaudeCodeSession] Setting up generic event listeners first');

        let currentSessionId: string | null = claudeSessionId || effectiveSession?.id || null;

        // Helper to attach session-specific listeners **once we are sure**
        const attachSessionSpecificListeners = async (sid: string) => {
          console.log('[ClaudeCodeSession] Attaching session-specific listeners for', sid);

          const specificOutputUnlisten = await listen<string>(`claude-output:${sid}`, (evt) => {
            handleStreamMessage(evt.payload);
          });

          const specificErrorUnlisten = await listen<string>(`claude-error:${sid}`, (evt) => {
            console.error('Claude error (scoped):', evt.payload);
            setError(evt.payload);
          });

          const specificCompleteUnlisten = await listen<boolean>(`claude-complete:${sid}`, (evt) => {
            console.log('[ClaudeCodeSession] Received claude-complete (scoped):', evt.payload);
            processComplete(evt.payload);
          });

          // Replace existing unlisten refs with these new ones (after cleaning up)
          unlistenRefs.current.forEach((u) => u());
          unlistenRefs.current = [specificOutputUnlisten, specificErrorUnlisten, specificCompleteUnlisten];
        };

        // Generic listeners (catch-all)
        const genericOutputUnlisten = await listen<string>('claude-output', async (event) => {
          handleStreamMessage(event.payload);

          // Attempt to extract session_id on the fly (for the very first init)
          try {
            const msg = JSON.parse(event.payload) as ClaudeStreamMessage;
            if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
              if (!currentSessionId || currentSessionId !== msg.session_id) {
                console.log('[ClaudeCodeSession] Detected new session_id from generic listener:', msg.session_id);
                currentSessionId = msg.session_id;
                setClaudeSessionId(msg.session_id);

                // If we haven't extracted session info before, do it now
                if (!extractedSessionInfo) {
                  const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, '-');
                  setExtractedSessionInfo({ sessionId: msg.session_id, projectId });
                }

                // Switch to session-specific listeners
                await attachSessionSpecificListeners(msg.session_id);
              }
            }
          } catch {
            /* ignore parse errors */
          }
        });

        // Helper to process any JSONL stream message string
        function handleStreamMessage(payload: string) {
          try {
            // Don't process if component unmounted
            if (!isMountedRef.current) return;
            
            // Store raw JSONL
            setRawJsonlOutput((prev) => [...prev, payload]);

            const message = JSON.parse(payload) as ClaudeStreamMessage;
            
            // Track enhanced tool execution
            if (message.type === 'assistant' && message.message?.content) {
              const toolUses = message.message.content.filter((c: any) => c.type === 'tool_use');
              toolUses.forEach((toolUse: any) => {
                // Increment tools executed counter
                sessionMetrics.current.toolsExecuted += 1;
                sessionMetrics.current.lastActivityTime = Date.now();
                
                // Track file operations
                const toolName = toolUse.name?.toLowerCase() || '';
                if (toolName.includes('create') || toolName.includes('write')) {
                  sessionMetrics.current.filesCreated += 1;
                } else if (toolName.includes('edit') || toolName.includes('multiedit') || toolName.includes('search_replace')) {
                  sessionMetrics.current.filesModified += 1;
                } else if (toolName.includes('delete')) {
                  sessionMetrics.current.filesDeleted += 1;
                }
                
                // Track tool start - we'll track completion when we get the result
                workflowTracking.trackStep(toolUse.name);
              });
            }
            
            // Track tool results
            if (message.type === 'user' && message.message?.content) {
              const toolResults = message.message.content.filter((c: any) => c.type === 'tool_result');
              toolResults.forEach((result: any) => {
                const isError = result.is_error || false;
                // Note: We don't have execution time here, but we can track success/failure
                if (isError) {
                  sessionMetrics.current.toolsFailed += 1;
                  sessionMetrics.current.errorsEncountered += 1;
                  
                  trackEvent.enhancedError({
                    error_type: 'tool_execution',
                    error_code: 'tool_failed',
                    error_message: result.content,
                    context: `Tool execution failed`,
                    user_action_before_error: 'executing_tool',
                    recovery_attempted: false,
                    recovery_successful: false,
                    error_frequency: 1,
                    stack_trace_hash: undefined
                  });
                }
              });
            }
            
            // Track code blocks generated
            if (message.type === 'assistant' && message.message?.content) {
              const codeBlocks = message.message.content.filter((c: any) => 
                c.type === 'text' && c.text?.includes('```')
              );
              if (codeBlocks.length > 0) {
                // Count code blocks in text content
                codeBlocks.forEach((block: any) => {
                  const matches = (block.text.match(/```/g) || []).length;
                  sessionMetrics.current.codeBlocksGenerated += Math.floor(matches / 2);
                });
              }
            }
            
            // Track errors in system messages
            if (message.type === 'system' && (message.subtype === 'error' || message.error)) {
              sessionMetrics.current.errorsEncountered += 1;
            }
            
            setMessages((prev) => [...prev, message]);
          } catch (err) {
            console.error('Failed to parse message:', err, payload);
          }
        }

        // Helper to handle completion events (both generic and scoped)
        const processComplete = async (success: boolean) => {
          setIsLoading(false);
          hasActiveSessionRef.current = false;
          isListeningRef.current = false; // Reset listening state
          
          // Track enhanced session stopped metrics when session completes
          if (effectiveSession && claudeSessionId) {
            const sessionStartTimeValue = messages.length > 0 ? messages[0].timestamp || Date.now() : Date.now();
            const duration = Date.now() - sessionStartTimeValue;
            const metrics = sessionMetrics.current;
            const timeToFirstMessage = metrics.firstMessageTime 
              ? metrics.firstMessageTime - sessionStartTime.current 
              : undefined;
            const idleTime = Date.now() - metrics.lastActivityTime;
            const avgResponseTime = metrics.toolExecutionTimes.length > 0
              ? metrics.toolExecutionTimes.reduce((a, b) => a + b, 0) / metrics.toolExecutionTimes.length
              : undefined;
            
            trackEvent.enhancedSessionStopped({
              // Basic metrics
              duration_ms: duration,
              messages_count: messages.length,
              reason: success ? 'completed' : 'error',
              
              // Timing metrics
              time_to_first_message_ms: timeToFirstMessage,
              average_response_time_ms: avgResponseTime,
              idle_time_ms: idleTime,
              
              // Interaction metrics
              prompts_sent: metrics.promptsSent,
              tools_executed: metrics.toolsExecuted,
              tools_failed: metrics.toolsFailed,
              files_created: metrics.filesCreated,
              files_modified: metrics.filesModified,
              files_deleted: metrics.filesDeleted,
              
              // Content metrics
              total_tokens_used: totalTokens,
              code_blocks_generated: metrics.codeBlocksGenerated,
              errors_encountered: metrics.errorsEncountered,
              
              // Session context
              model: metrics.modelChanges.length > 0 
                ? metrics.modelChanges[metrics.modelChanges.length - 1].to 
                : 'sonnet',
              has_checkpoints: metrics.checkpointCount > 0,
              checkpoint_count: metrics.checkpointCount,
              was_resumed: metrics.wasResumed,
              
              // Agent context (if applicable)
              agent_type: undefined, // TODO: Pass from agent execution
              agent_name: undefined, // TODO: Pass from agent execution
              agent_success: success,
              
              // Stop context
              stop_source: 'completed',
              final_state: success ? 'success' : 'failed',
              has_pending_prompts: queuedPrompts.length > 0,
              pending_prompts_count: queuedPrompts.length,
            });
          }

          if (effectiveSession && success) {
            try {
              const settings = await api.getCheckpointSettings(
                effectiveSession.id,
                effectiveSession.project_id,
                projectPath
              );

              if (settings.auto_checkpoint_enabled) {
                await api.checkAutoCheckpoint(
                  effectiveSession.id,
                  effectiveSession.project_id,
                  projectPath,
                  prompt
                );
                // Reload timeline to show new checkpoint
                setTimelineVersion((v) => v + 1);
              }
            } catch (err) {
              console.error('Failed to check auto checkpoint:', err);
            }
          }

          // Process queued prompts after completion
          if (queuedPromptsRef.current.length > 0) {
            const [nextPrompt, ...remainingPrompts] = queuedPromptsRef.current;
            setQueuedPrompts(remainingPrompts);
            
            // Small delay to ensure UI updates
            setTimeout(() => {
              handleSendPrompt(nextPrompt.prompt, nextPrompt.model);
            }, 100);
          }
        };

        const genericErrorUnlisten = await listen<string>('claude-error', (evt) => {
          console.error('Claude error:', evt.payload);
          setError(evt.payload);
        });

        const genericCompleteUnlisten = await listen<boolean>('claude-complete', (evt) => {
          console.log('[ClaudeCodeSession] Received claude-complete (generic):', evt.payload);
          processComplete(evt.payload);
        });

        // Store the generic unlisteners for now; they may be replaced later.
        unlistenRefs.current = [genericOutputUnlisten, genericErrorUnlisten, genericCompleteUnlisten];

        // --------------------------------------------------------------------
        // 2️⃣  Auto-checkpoint logic moved after listener setup (unchanged)
        // --------------------------------------------------------------------

        // Add the user message immediately to the UI (after setting up listeners)
        const userMessage: ClaudeStreamMessage = {
          type: "user",
          message: {
            content: [
              {
                type: "text",
                text: prompt
              }
            ]
          }
        };
        setMessages(prev => [...prev, userMessage]);
        
        // Update session metrics
        sessionMetrics.current.promptsSent += 1;
        sessionMetrics.current.lastActivityTime = Date.now();
        if (!sessionMetrics.current.firstMessageTime) {
          sessionMetrics.current.firstMessageTime = Date.now();
        }
        
        // Track model changes
        const lastModel = sessionMetrics.current.modelChanges.length > 0 
          ? sessionMetrics.current.modelChanges[sessionMetrics.current.modelChanges.length - 1].to
          : (sessionMetrics.current.wasResumed ? 'sonnet' : model); // Default to sonnet if resumed
        
        if (lastModel !== model) {
          sessionMetrics.current.modelChanges.push({
            from: lastModel,
            to: model,
            timestamp: Date.now()
          });
        }
        
        // Track enhanced prompt submission
        const codeBlockMatches = prompt.match(/```[\s\S]*?```/g) || [];
        const hasCode = codeBlockMatches.length > 0;
        const conversationDepth = messages.filter(m => m.user_message).length;
        const sessionAge = sessionStartTime.current ? Date.now() - sessionStartTime.current : 0;
        const wordCount = prompt.split(/\s+/).filter(word => word.length > 0).length;
        
        trackEvent.enhancedPromptSubmitted({
          prompt_length: prompt.length,
          model: model,
          has_attachments: false, // TODO: Add attachment support when implemented
          source: 'keyboard', // TODO: Track actual source (keyboard vs button)
          word_count: wordCount,
          conversation_depth: conversationDepth,
          prompt_complexity: wordCount < 20 ? 'simple' : wordCount < 100 ? 'moderate' : 'complex',
          contains_code: hasCode,
          language_detected: hasCode ? codeBlockMatches?.[0]?.match(/```(\w+)/)?.[1] : undefined,
          session_age_ms: sessionAge
        });

        // Execute the appropriate command
        if (effectiveSession && !isFirstPrompt) {
          console.log('[ClaudeCodeSession] Resuming session:', effectiveSession.id);
          trackEvent.sessionResumed(effectiveSession.id);
          trackEvent.modelSelected(model);
          await api.resumeClaudeCode(projectPath, effectiveSession.id, prompt, model);
        } else {
          console.log('[ClaudeCodeSession] Starting new session');
          setIsFirstPrompt(false);
          trackEvent.sessionCreated(model, 'prompt_input');
          trackEvent.modelSelected(model);
          await api.executeClaudeCode(projectPath, prompt, model);
        }
      }
    } catch (err) {
      console.error("Failed to send prompt:", err);
      setError("Failed to send prompt");
      setIsLoading(false);
      hasActiveSessionRef.current = false;
    }
  };

  const handleCopyAsJsonl = async () => {
    const jsonl = rawJsonlOutput.join('\n');
    await navigator.clipboard.writeText(jsonl);
    setCopyPopoverOpen(false);
  };

  const handleCopyAsMarkdown = async () => {
    let markdown = `# Claude Code Session\n\n`;
    markdown += `**Project:** ${projectPath}\n`;
    markdown += `**Date:** ${new Date().toISOString()}\n\n`;
    markdown += `---\n\n`;

    for (const msg of messages) {
      if (msg.type === "system" && msg.subtype === "init") {
        markdown += `## System Initialization\n\n`;
        markdown += `- Session ID: \`${msg.session_id || 'N/A'}\`\n`;
        markdown += `- Model: \`${msg.model || 'default'}\`\n`;
        if (msg.cwd) markdown += `- Working Directory: \`${msg.cwd}\`\n`;
        if (msg.tools?.length) markdown += `- Tools: ${msg.tools.join(', ')}\n`;
        markdown += `\n`;
      } else if (msg.type === "assistant" && msg.message) {
        markdown += `## Assistant\n\n`;
        for (const content of msg.message.content || []) {
          if (content.type === "text") {
            const textContent = typeof content.text === 'string' 
              ? content.text 
              : (content.text?.text || JSON.stringify(content.text || content));
            markdown += `${textContent}\n\n`;
          } else if (content.type === "tool_use") {
            markdown += `### Tool: ${content.name}\n\n`;
            markdown += `\`\`\`json\n${JSON.stringify(content.input, null, 2)}\n\`\`\`\n\n`;
          }
        }
        if (msg.message.usage) {
          markdown += `*Tokens: ${msg.message.usage.input_tokens} in, ${msg.message.usage.output_tokens} out*\n\n`;
        }
      } else if (msg.type === "user" && msg.message) {
        markdown += `## User\n\n`;
        for (const content of msg.message.content || []) {
          if (content.type === "text") {
            const textContent = typeof content.text === 'string' 
              ? content.text 
              : (content.text?.text || JSON.stringify(content.text));
            markdown += `${textContent}\n\n`;
          } else if (content.type === "tool_result") {
            markdown += `### Tool Result\n\n`;
            let contentText = '';
            if (typeof content.content === 'string') {
              contentText = content.content;
            } else if (content.content && typeof content.content === 'object') {
              if (content.content.text) {
                contentText = content.content.text;
              } else if (Array.isArray(content.content)) {
                contentText = content.content
                  .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
                  .join('\n');
              } else {
                contentText = JSON.stringify(content.content, null, 2);
              }
            }
            markdown += `\`\`\`\n${contentText}\n\`\`\`\n\n`;
          }
        }
      } else if (msg.type === "result") {
        markdown += `## Execution Result\n\n`;
        if (msg.result) {
          markdown += `${msg.result}\n\n`;
        }
        if (msg.error) {
          markdown += `**Error:** ${msg.error}\n\n`;
        }
      }
    }

    await navigator.clipboard.writeText(markdown);
    setCopyPopoverOpen(false);
  };

  const handleCheckpointSelect = async () => {
    // Reload messages from the checkpoint
    await loadSessionHistory();
    // Ensure timeline reloads to highlight current checkpoint
    setTimelineVersion((v) => v + 1);
  };
  
  const handleCheckpointCreated = () => {
    // Update checkpoint count in session metrics
    sessionMetrics.current.checkpointCount += 1;
  };

  const handleCancelExecution = async () => {
    if (!claudeSessionId || !isLoading) return;
    
    try {
      const sessionStartTime = messages.length > 0 ? messages[0].timestamp || Date.now() : Date.now();
      const duration = Date.now() - sessionStartTime;
      
      await api.cancelClaudeExecution(claudeSessionId);
      
      // Calculate metrics for enhanced analytics
      const metrics = sessionMetrics.current;
      const timeToFirstMessage = metrics.firstMessageTime 
        ? metrics.firstMessageTime - sessionStartTime.current 
        : undefined;
      const idleTime = Date.now() - metrics.lastActivityTime;
      const avgResponseTime = metrics.toolExecutionTimes.length > 0
        ? metrics.toolExecutionTimes.reduce((a, b) => a + b, 0) / metrics.toolExecutionTimes.length
        : undefined;
      
      // Track enhanced session stopped
      trackEvent.enhancedSessionStopped({
        // Basic metrics
        duration_ms: duration,
        messages_count: messages.length,
        reason: 'user_stopped',
        
        // Timing metrics
        time_to_first_message_ms: timeToFirstMessage,
        average_response_time_ms: avgResponseTime,
        idle_time_ms: idleTime,
        
        // Interaction metrics
        prompts_sent: metrics.promptsSent,
        tools_executed: metrics.toolsExecuted,
        tools_failed: metrics.toolsFailed,
        files_created: metrics.filesCreated,
        files_modified: metrics.filesModified,
        files_deleted: metrics.filesDeleted,
        
        // Content metrics
        total_tokens_used: totalTokens,
        code_blocks_generated: metrics.codeBlocksGenerated,
        errors_encountered: metrics.errorsEncountered,
        
        // Session context
        model: metrics.modelChanges.length > 0 
          ? metrics.modelChanges[metrics.modelChanges.length - 1].to 
          : 'sonnet', // Default to sonnet
        has_checkpoints: metrics.checkpointCount > 0,
        checkpoint_count: metrics.checkpointCount,
        was_resumed: metrics.wasResumed,
        
        // Agent context (if applicable)
        agent_type: undefined, // TODO: Pass from agent execution
        agent_name: undefined, // TODO: Pass from agent execution
        agent_success: undefined, // TODO: Pass from agent execution
        
        // Stop context
        stop_source: 'user_button',
        final_state: 'cancelled',
        has_pending_prompts: queuedPrompts.length > 0,
        pending_prompts_count: queuedPrompts.length,
      });
      
      // Clean up listeners
      unlistenRefs.current.forEach(unlisten => unlisten());
      unlistenRefs.current = [];
      
      // Reset states
      setIsLoading(false);
      hasActiveSessionRef.current = false;
      isListeningRef.current = false;
      setError(null);
      
      // Clear queued prompts
      setQueuedPrompts([]);
      
      // Add a message indicating the session was cancelled
      const cancelMessage: ClaudeStreamMessage = {
        type: "system",
        subtype: "info",
        result: "Session cancelled by user",
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, cancelMessage]);
    } catch (err) {
      console.error("Failed to cancel execution:", err);
      
      // Even if backend fails, we should update UI to reflect stopped state
      // Add error message but still stop the UI loading state
      const errorMessage: ClaudeStreamMessage = {
        type: "system",
        subtype: "error",
        result: `Failed to cancel execution: ${err instanceof Error ? err.message : 'Unknown error'}. The process may still be running in the background.`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
      
      // Clean up listeners anyway
      unlistenRefs.current.forEach(unlisten => unlisten());
      unlistenRefs.current = [];
      
      // Reset states to allow user to continue
      setIsLoading(false);
      hasActiveSessionRef.current = false;
      isListeningRef.current = false;
      setError(null);
    }
  };

  const handleFork = (checkpointId: string) => {
    setForkCheckpointId(checkpointId);
    setForkSessionName(`Fork-${new Date().toISOString().slice(0, 10)}`);
    setShowForkDialog(true);
  };

  const handleConfirmFork = async () => {
    if (!forkCheckpointId || !forkSessionName.trim() || !effectiveSession) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const newSessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      await api.forkFromCheckpoint(
        forkCheckpointId,
        effectiveSession.id,
        effectiveSession.project_id,
        projectPath,
        newSessionId,
        forkSessionName
      );
      
      // Open the new forked session
      // You would need to implement navigation to the new session
      console.log("Forked to new session:", newSessionId);
      
      setShowForkDialog(false);
      setForkCheckpointId(null);
      setForkSessionName("");
    } catch (err) {
      console.error("Failed to fork checkpoint:", err);
      setError("Failed to fork checkpoint");
    } finally {
      setIsLoading(false);
    }
  };

  // 处理URL检测
  const handleLinkDetected = (url: string) => {
    if (!layout.previewUrl && !showPreviewPrompt) {
      openLayoutPreview(url);
      setShowPreviewPrompt(true);
    }
  };
  
  // 监听滚动位置
  useEffect(() => {
    const scrollContainer = parentRef.current;
    if (!scrollContainer) return;
    
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      setIsAtTop(scrollTop < 10);
      setIsAtBottom(scrollTop + clientHeight >= scrollHeight - 10);
      setShowScrollButtons(scrollHeight > clientHeight);
    };
    
    handleScroll(); // 初始检查
    scrollContainer.addEventListener('scroll', handleScroll);
    
    // 监听内容变化
    const observer = new ResizeObserver(handleScroll);
    observer.observe(scrollContainer);
    
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, []);
  
  const handleTogglePreviewMaximize = () => {
    setIsPreviewMaximized(!isPreviewMaximized);
    // 重置分割位置
    if (isPreviewMaximized) {
      setLayoutSplitPosition(50);
    }
  };
  
  const handlePreviewUrlChange = (url: string) => {
    console.log('[ClaudeCodeSession] Preview URL changed to:', url);
    openLayoutPreview(url);
  };

  // Cleanup event listeners and track mount state
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      console.log('[ClaudeCodeSession] Component unmounting, cleaning up listeners');
      isMountedRef.current = false;
      isListeningRef.current = false;
      
      // Track session completion with engagement metrics
      if (effectiveSession) {
        trackEvent.sessionCompleted();
        
        // Track session engagement
        const sessionDuration = sessionStartTime.current ? Date.now() - sessionStartTime.current : 0;
        const messageCount = messages.filter(m => m.user_message).length;
        const toolsUsed = new Set<string>();
        messages.forEach(msg => {
          if (msg.type === 'assistant' && msg.message?.content) {
            const tools = msg.message.content.filter((c: any) => c.type === 'tool_use');
            tools.forEach((tool: any) => toolsUsed.add(tool.name));
          }
        });
        
        // Calculate engagement score (0-100)
        const engagementScore = Math.min(100, 
          (messageCount * 10) + 
          (toolsUsed.size * 5) + 
          (sessionDuration > 300000 ? 20 : sessionDuration / 15000) // 5+ min session gets 20 points
        );
        
        trackEvent.sessionEngagement({
          session_duration_ms: sessionDuration,
          messages_sent: messageCount,
          tools_used: Array.from(toolsUsed),
          files_modified: 0, // TODO: Track file modifications
          engagement_score: Math.round(engagementScore)
        });
      }
      
      // Clean up listeners
      unlistenRefs.current.forEach(unlisten => unlisten());
      unlistenRefs.current = [];
      
      // 清理文件监控
      if (fileWatcherUnlistenRef.current) {
        fileWatcherUnlistenRef.current();
        fileWatcherUnlistenRef.current = null;
      }
      
      // 停止文件监控
      if (projectPath && isFileWatching) {
        api.unwatchDirectory(projectPath).catch(err => {
          console.error("[FileMonitor] Failed to unwatch directory:", err);
        });
      }
      
      // Clear checkpoint manager when session ends
      if (effectiveSession) {
        api.clearCheckpointManager(effectiveSession.id).catch(err => {
          console.error("Failed to clear checkpoint manager:", err);
        });
      }
    };
  }, [effectiveSession, projectPath]);

  const messagesList = (
    <div
      ref={parentRef}
      className="h-full overflow-y-auto relative pb-2"
    >
      <div
        className="relative w-full max-w-5xl mx-auto px-4 pt-3 pb-2"
        style={{
          height: displayableMessages.length === 0 ? '100%' : `${Math.max(rowVirtualizer.getTotalSize(), 100)}px`,
          minHeight: '100px',
        }}
      >
        <AnimatePresence>
          {displayableMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground">
              <TerminalIcon className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm">开始对话或等待消息加载...</p>
            </div>
          ) : (
            rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const message = displayableMessages[virtualItem.index];
            return (
              <motion.div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={(el) => el && rowVirtualizer.measureElement(el)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-x-4 pb-3"
                style={{
                  top: virtualItem.start,
                }}
              >
                <StreamMessage 
                  message={message} 
                  streamMessages={messages}
                  onLinkDetected={handleLinkDetected}
                />
              </motion.div>
            );
          })
          )}
        </AnimatePresence>
      </div>

      {/* Loading indicator under the latest message */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center py-2 mb-4"
        >
          <div className="rotating-symbol text-primary" />
        </motion.div>
      )}

      {/* Error indicator */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive w-full max-w-5xl mx-auto mb-4"
        >
          {error}
        </motion.div>
      )}
      
      {/* 滚动按钮和文件监控小点 */}
      <AnimatePresence>
        {(showScrollButtons || isFileWatching) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed bottom-20 right-6 z-40 flex flex-col gap-2"
          >
            {/* 文件监控小绿点 */}
            {isFileWatching && !fileMonitorExpanded && (
              <div
                onClick={() => setFileMonitorExpanded(true)}
                className="relative cursor-pointer group self-center"
              >
                <div className={cn(
                  "w-4 h-4 rounded-full shadow-lg border-2 border-background transition-all duration-200 group-hover:scale-110",
                  isFileWatching ? "bg-green-500" : "bg-gray-400"
                )}>
                  {/* 脉冲效果 */}
                  {isFileWatching && fileChanges.length > 0 && (
                    <div className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-30" />
                  )}
                </div>
                
                {/* 悬浮提示 */}
                <div className="absolute bottom-full right-0 mb-2 px-2 py-1 bg-background/95 backdrop-blur-sm border rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  文件监控 {fileChanges.length > 0 && `(${fileChanges.length})`}
                </div>
                
                {/* 变化数量小徽章 */}
                {fileChanges.length > 0 && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 text-white text-[8px] rounded-full flex items-center justify-center font-bold">
                    {fileChanges.length > 9 ? '9+' : fileChanges.length}
                  </div>
                )}
              </div>
            )}
            
            {/* 滚动到顶部按钮 */}
            {!isAtTop && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={scrollToTop}
                      className="h-9 w-9 rounded-full shadow-lg bg-background/95 backdrop-blur"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>滚动到顶部</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            {/* 滚动到底部按钮 */}
            {!isAtBottom && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={scrollToBottom}
                      className="h-9 w-9 rounded-full shadow-lg bg-background/95 backdrop-blur"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>滚动到底部</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const projectPathInput = !session && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.1 }}
      className="p-4 border-b border-border flex-shrink-0"
    >
      <Label htmlFor="project-path" className="text-sm font-medium">
        Project Directory
      </Label>
      <div className="flex items-center gap-2 mt-1">
        <Input
          id="project-path"
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
          placeholder="/path/to/your/project"
          className="flex-1"
          disabled={isLoading}
        />
        <Button
          onClick={handleSelectPath}
          size="icon"
          variant="outline"
          disabled={isLoading}
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );

  // If terminal is maximized, render only the Terminal in full screen
  if (layout.activeView === 'terminal' && layout.isTerminalMaximized) {
    return (
      <AnimatePresence>
        <motion.div 
          className="fixed inset-0 z-50 bg-background"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Terminal
            onClose={closeTerminal}
            isMaximized={layout.isTerminalMaximized}
            onToggleMaximize={toggleTerminalMaximize}
            projectPath={projectPath}
            className="h-full w-full"
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  // If preview is maximized, render only the WebviewPreview in full screen
  if (layout.activeView === 'preview' && layout.previewUrl && isPreviewMaximized) {
    return (
      <AnimatePresence>
        <motion.div 
          className="fixed inset-0 z-50 bg-background"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <WebviewPreview
            initialUrl={layout.previewUrl || ''}
            onClose={handleClosePreview}
            isMaximized={isPreviewMaximized}
            onToggleMaximize={handleTogglePreviewMaximize}
            onUrlChange={handlePreviewUrlChange}
            className="h-full"
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-background relative", getResponsiveClasses(), className)}>
      <div className="w-full h-full flex flex-col">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-between p-4 border-b border-border"
        >
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <TerminalIcon className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <h1 className="text-xl font-bold">{t('app.claudeCodeSession')}</h1>
                <p className="text-sm text-muted-foreground">
                  {projectPath ? `${projectPath}` : "No project selected"}
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Token计数器 */}
            {totalTokens > 0 && (
              <div className="flex items-center gap-1.5 text-xs bg-muted/50 rounded-full px-2.5 py-1">
                <Hash className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono">{totalTokens.toLocaleString()}</span>
                <span className="text-muted-foreground">tokens</span>
              </div>
            )}
            
            {/* Terminal Toggle */}
            {projectPath && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={openTerminal}
                      className={cn("h-8 w-8", layout.activeView === 'terminal' && "text-primary")}
                    >
                      <Square className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>终端</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            {/* File Explorer Toggle */}
            {projectPath && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleFileExplorer}
                      className={cn("h-8 w-8", layout.showFileExplorer && "text-primary")}
                    >
                      <PanelLeftOpen className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>File Explorer</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            {/* Git Panel Toggle */}
            {projectPath && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleGitPanel}
                      className={cn("h-8 w-8", layout.showGitPanel && "text-primary")}
                    >
                      <PanelRightOpen className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Git Panel</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            {/* File Monitor Toggle */}
            {projectPath && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleFileWatching}
                      className={cn("h-8 w-8", isFileWatching && "text-primary")}
                    >
                      {isFileWatching ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isFileWatching ? '停止文件监控' : '启动文件监控'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            {projectPath && onProjectSettings && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onProjectSettings(projectPath)}
                      disabled={isLoading}
                      className="h-8 w-8"
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('agents.hooks')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {projectPath && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowSlashCommandsSettings(true)}
                      disabled={isLoading}
                      className="h-8 w-8"
                    >
                      <Command className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('app.commands')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowSettings(!showSettings)}
                      className="h-8 w-8"
                    >
                      <Settings className={cn("h-4 w-4", showSettings && "text-primary")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('checkpoint.checkpointSettingsTitle')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {effectiveSession && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleTimeline}
                        className="h-8 w-8"
                      >
                        <GitBranch className={cn("h-4 w-4", layout.showTimeline && "text-primary")} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('app.timeline')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {messages.length > 0 && (
                <Popover
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <Copy className="h-4 w-4" />
                      {t('app.copyOutput')}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  }
                  content={
                    <div className="w-44 p-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyAsMarkdown}
                        className="w-full justify-start"
                      >
                        {t('app.copyAsMarkdown')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyAsJsonl}
                        className="w-full justify-start"
                      >
                        {t('app.copyAsJsonl')}
                      </Button>
                    </div>
                  }
                  open={copyPopoverOpen}
                  onOpenChange={setCopyPopoverOpen}
                />
              )}
            </div>
          </div>
        </motion.div>

        {/* 使用新的 FlexLayoutContainer 替代 GridLayoutContainer */}
        <FlexLayoutContainer
          className="flex-1 overflow-hidden"
          mainContentId="main-content"
          panels={[
            // 文件浏览器面板
            {
              id: 'file-explorer',
              position: 'left',
              visible: layout.showFileExplorer,
              defaultWidth: layout.fileExplorerWidth,
              minWidth: 200,
              maxWidth: 500,
              resizable: !breakpoints.isMobile,
              content: (
                <FileExplorerPanelEnhanced
                  projectPath={projectPath}
                  isVisible={true}
                  onFileSelect={(path) => {
                    floatingPromptRef.current?.addImage(path);
                  }}
                  onFileOpen={(path) => {
                    openFileEditor(path);
                  }}
                  onToggle={toggleFileExplorer}
                />
              )
            },
            // 主内容区域
            {
              id: 'main-content',
              position: 'center',
              visible: true,
              content: (
                <MainContentArea isEditing={layout.activeView === 'editor'}>
                  {/* 终端始终渲染，通过显示/隐藏控制 */}
                  <div className={cn("absolute inset-0", layout.activeView === 'terminal' ? 'block' : 'hidden')}>
                    <Terminal
                      onClose={closeTerminal}
                      isMaximized={layout.isTerminalMaximized}
                      onToggleMaximize={toggleTerminalMaximize}
                      projectPath={projectPath}
                      className="h-full w-full"
                    />
                  </div>
                  
                  {/* 其他视图 */}
                  <div className={cn("h-full w-full", layout.activeView === 'terminal' ? 'hidden' : 'block')}>
                    {layout.activeView === 'editor' && layout.editingFile ? (
                      // 文件编辑器视图
                      <FileEditorEnhanced
                        filePath={layout.editingFile}
                        onClose={closeFileEditor}
                        className="h-full"
                      />
                    ) : layout.activeView === 'preview' && layout.previewUrl ? (
                    // 预览视图
                    <SplitPane
                      left={
                        <ChatView
                          projectPathInput={projectPathInput}
                          messagesList={messagesList}
                          floatingInput={
                            <div className="w-full max-w-5xl mx-auto px-4">
                              <FloatingPromptInput
                                ref={floatingPromptRef}
                                onSend={handleSendPrompt}
                                onCancel={handleCancelExecution}
                                isLoading={isLoading}
                                disabled={!projectPath}
                                projectPath={projectPath}
                              />
                            </div>
                          }
                        />
                      }
                      right={
                        <WebviewPreview
                          initialUrl={layout.previewUrl}
                          onClose={handleClosePreview}
                          isMaximized={isPreviewMaximized}
                          onToggleMaximize={handleTogglePreviewMaximize}
                          onUrlChange={handlePreviewUrlChange}
                        />
                      }
                      initialSplit={layout.splitPosition}
                      onSplitChange={(position) => {
                        setLayoutSplitPosition(position);
                      }}
                      minLeftWidth={400}
                      minRightWidth={400}
                      className="h-full"
                    />
                    ) : (
                      // 默认聊天视图
                      <ChatView
                        projectPathInput={projectPathInput}
                        messagesList={messagesList}
                        floatingInput={
                          <div className="w-full max-w-5xl mx-auto px-4">
                            <FloatingPromptInput
                              ref={floatingPromptRef}
                              onSend={handleSendPrompt}
                              onCancel={handleCancelExecution}
                              isLoading={isLoading}
                              disabled={!projectPath}
                              projectPath={projectPath}
                            />
                          </div>
                        }
                        floatingElements={
                        <>
                          {/* 文件监控展开面板 */}
                          <AnimatePresence>
                            {isFileWatching && fileMonitorExpanded && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="fixed bottom-20 right-4 z-30 pointer-events-auto w-80"
                              >
                                <div className="bg-background/95 backdrop-blur-md border rounded-lg shadow-lg p-3">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                      <Clock className="h-4 w-4 text-primary" />
                                      <span className="text-sm font-medium">文件变化监控</span>
                                      <div className={cn(
                                        "w-2 h-2 rounded-full",
                                        isFileWatching ? "bg-green-500" : "bg-gray-400"
                                      )} />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setFileMonitorCollapsed(!fileMonitorCollapsed)}
                                        className="h-6 w-6"
                                      >
                                        {fileMonitorCollapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={clearFileChanges}
                                        className="h-6 w-6"
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setFileMonitorExpanded(false)}
                                        className="h-6 w-6"
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                  
                                  {!fileMonitorCollapsed && (
                                    <div className="max-h-64 overflow-y-auto space-y-1">
                                      {fileChanges.map((change, index) => {
                                        const getChangeIcon = () => {
                                          switch (change.changeType) {
                                            case 'created':
                                              return <FilePlus className="h-3 w-3 text-green-500" />;
                                            case 'modified':
                                              return <FileText className="h-3 w-3 text-yellow-500" />;
                                            case 'deleted':
                                              return <FileX className="h-3 w-3 text-red-500" />;
                                            case 'renamed':
                                              return <FileText className="h-3 w-3 text-blue-500" />;
                                            default:
                                              return <FileText className="h-3 w-3 text-gray-500" />;
                                          }
                                        };
                                        
                                        return (
                                          <motion.div
                                            key={`${change.path}-${change.timestamp}`}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: index * 0.02 }}
                                            className="flex items-start gap-2 p-2 bg-muted/30 rounded text-xs"
                                          >
                                            {getChangeIcon()}
                                            <div className="flex-1 min-w-0">
                                              <div className="font-mono text-xs truncate" title={change.path}>
                                                {change.path}
                                              </div>
                                              <div className="text-xs text-muted-foreground">
                                                {change.changeType} • {new Date(change.timestamp).toLocaleTimeString()}
                                              </div>
                                            </div>
                                          </motion.div>
                                        );
                                      })}
                                      
                                      {fileChanges.length === 0 && isFileWatching && (
                                        <div className="text-center py-4 text-muted-foreground text-xs">
                                          监控中，等待文件变化...
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          
                          {/* 排队提示显示 */}
                          <AnimatePresence>
                            {queuedPrompts.length > 0 && (
                              <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                className="absolute bottom-20 left-0 right-0 z-30 pointer-events-auto px-4"
                              >
                                <div className="bg-background/95 backdrop-blur-md border rounded-lg shadow-lg p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="text-xs font-medium text-muted-foreground mb-1">
                                      Queued Prompts ({queuedPrompts.length})
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => setQueuedPromptsCollapsed(prev => !prev)}>
                                      {queuedPromptsCollapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                    </Button>
                                  </div>
                                  {!queuedPromptsCollapsed && queuedPrompts.map((queuedPrompt, index) => (
                                    <motion.div
                                      key={queuedPrompt.id}
                                      initial={{ opacity: 0, x: -20 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      exit={{ opacity: 0, x: 20 }}
                                      transition={{ delay: index * 0.05 }}
                                      className="flex items-start gap-2 bg-muted/50 rounded-md p-2"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
                                          <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                                            {queuedPrompt.model === "opus" ? "Opus" : "Sonnet"}
                                          </span>
                                        </div>
                                        <p className="text-sm line-clamp-2 break-words">{queuedPrompt.prompt}</p>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 flex-shrink-0"
                                        onClick={() => setQueuedPrompts(prev => prev.filter(p => p.id !== queuedPrompt.id))}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </motion.div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </>
                      }
                    />
                    )}
                  </div>
                </MainContentArea>
              )
            },
            // Git 面板
            {
              id: 'git-panel',
              position: 'right',
              visible: layout.showGitPanel,
              defaultWidth: layout.gitPanelWidth,
              minWidth: 200,
              maxWidth: 500,
              resizable: !breakpoints.isMobile,
              content: (
                <GitPanelEnhanced
                  projectPath={projectPath}
                  isVisible={true}
                  onToggle={toggleGitPanel}
                />
              )
            },
            // 时间线面板（仅桌面端）
            ...(layout.showTimeline && effectiveSession && !breakpoints.isMobile ? [{
              id: 'timeline',
              position: 'right' as const,
              visible: true,
              defaultWidth: layout.timelineWidth,
              minWidth: 320,
              maxWidth: 600,
              resizable: true,
              content: (
                <SidePanel
                  title={t('app.sessionTimeline')}
                  onClose={toggleTimeline}
                  position="right"
                >
                  <TimelineNavigator
                    sessionId={effectiveSession.id}
                    projectId={effectiveSession.project_id}
                    projectPath={projectPath}
                    currentMessageIndex={messages.length - 1}
                    onCheckpointSelect={handleCheckpointSelect}
                    onFork={handleFork}
                    onCheckpointCreated={handleCheckpointCreated}
                    refreshVersion={timelineVersion}
                  />
                </SidePanel>
              )
            }] : [])
          ]}
          onPanelResize={(panelId, width) => {
            if (panelId === 'file-explorer') {
              setPanelWidth('fileExplorer', width);
            } else if (panelId === 'git-panel') {
              setPanelWidth('gitPanel', width);
            } else if (panelId === 'timeline') {
              setPanelWidth('timeline', width);
            }
          }}
          savedWidths={{
            'file-explorer': layout.fileExplorerWidth,
            'git-panel': layout.gitPanelWidth,
            'timeline': layout.timelineWidth,
          }}
        />
      </div>

      {/* Fork Dialog */}
      <Dialog open={showForkDialog} onOpenChange={setShowForkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fork Session</DialogTitle>
            <DialogDescription>
              Create a new session branch from the selected checkpoint.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fork-name">New Session Name</Label>
              <Input
                id="fork-name"
                placeholder="e.g., Alternative approach"
                value={forkSessionName}
                onChange={(e) => setForkSessionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isLoading) {
                    handleConfirmFork();
                  }
                }}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowForkDialog(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmFork}
              disabled={isLoading || !forkSessionName.trim()}
            >
              Create Fork
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      {showSettings && effectiveSession && (
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('checkpoint.checkpointSettingsTitle')}</DialogTitle>
              <DialogDescription>
                {t('app.checkpointingWarning')}
              </DialogDescription>
            </DialogHeader>
            <CheckpointSettings
              sessionId={effectiveSession.id}
              projectId={effectiveSession.project_id}
              projectPath={projectPath}
              onClose={() => setShowSettings(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Slash Commands Settings Dialog */}
      {showSlashCommandsSettings && (
        <Dialog open={showSlashCommandsSettings} onOpenChange={setShowSlashCommandsSettings}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>{t('slashCommands.slashCommands')}</DialogTitle>
              <DialogDescription>
                {t('slashCommands.manageProjectCommands')} {projectPath}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto">
              <SlashCommandsManager projectPath={projectPath} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

// Add default export for lazy loading
export default ClaudeCodeSession;
