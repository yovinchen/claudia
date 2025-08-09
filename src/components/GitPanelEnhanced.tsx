import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  GitMerge,
  X,
  RefreshCw,
  Loader2,
  AlertCircle,
  FileText,
  FilePlus,
  FileX,
  FileDiff,
  GripVertical,
  Check,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Maximize2,
  Minimize2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
  status?: string;
  staged?: boolean;
  expanded?: boolean;
}

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileStatus[];
  modified: GitFileStatus[];
  untracked: GitFileStatus[];
  conflicted: GitFileStatus[];
  is_clean: boolean;
  remote_url: string | null;
}

interface GitCommit {
  hash: string;
  short_hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
  files_changed: number;
  insertions: number;
  deletions: number;
}

interface GitPanelEnhancedProps {
  projectPath: string;
  isVisible: boolean;
  onToggle: () => void;
  onFileSelect?: (path: string) => void;
  className?: string;
}

// 获取文件状态图标
const getFileStatusIcon = (status: 'modified' | 'staged' | 'untracked' | 'conflicted') => {
  switch (status) {
    case 'modified':
      return <FileDiff className="h-4 w-4 text-yellow-500" />;
    case 'staged':
      return <Check className="h-4 w-4 text-green-500" />;
    case 'untracked':
      return <FilePlus className="h-4 w-4 text-blue-500" />;
    case 'conflicted':
      return <FileX className="h-4 w-4 text-red-500" />;
    default:
      return <FileText className="h-4 w-4 text-muted-foreground" />;
  }
};

// 获取文件状态标签
const getFileStatusBadge = (status: string) => {
  switch (status) {
    case 'modified':
      return <Badge variant="outline" className="text-yellow-600 border-yellow-600">M</Badge>;
    case 'added':
      return <Badge variant="outline" className="text-green-600 border-green-600">A</Badge>;
    case 'deleted':
      return <Badge variant="outline" className="text-red-600 border-red-600">D</Badge>;
    case 'renamed':
      return <Badge variant="outline" className="text-blue-600 border-blue-600">R</Badge>;
    case 'untracked':
      return <Badge variant="outline" className="text-gray-600 border-gray-600">U</Badge>;
    case 'conflicted':
      return <Badge variant="outline" className="text-orange-600 border-orange-600">C</Badge>;
    default:
      return null;
  }
};

export const GitPanelEnhanced: React.FC<GitPanelEnhancedProps> = ({
  projectPath,
  isVisible,
  onToggle,
  onFileSelect,
  className,
}) => {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("changes");
  const [width, setWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 处理拖拽调整宽度
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const windowWidth = window.innerWidth;
      const newWidth = windowWidth - e.clientX;
      
      if (newWidth >= 200 && newWidth <= 600) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // 加载 Git 状态
  const loadGitStatus = useCallback(async () => {
    if (!projectPath) return;

    try {
      setLoading(true);
      setError(null);
      
      const status = await invoke<GitStatus>("get_git_status", {
        path: projectPath,  // 修改参数名为 path
      });
      
      setGitStatus(status);
    } catch (err) {
      console.error("Failed to load git status:", err);
      setError(err instanceof Error ? err.message : "Failed to load git status");
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  // 加载提交历史
  const loadCommits = useCallback(async () => {
    if (!projectPath) return;

    try {
      const commitList = await invoke<GitCommit[]>("get_git_commits", {
        projectPath: projectPath,  // 使用驼峰命名
        limit: 20,
      });
      
      setCommits(commitList);
    } catch (err) {
      console.error("Failed to load commits:", err);
    }
  }, [projectPath]);

  // 自动刷新
  useEffect(() => {
    if (!isVisible) {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      return;
    }

    loadGitStatus();
    loadCommits();

    // 每5秒刷新一次
    refreshIntervalRef.current = setInterval(() => {
      loadGitStatus();
      if (activeTab === 'history') {
        loadCommits();
      }
    }, 5000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [isVisible, projectPath, activeTab, loadGitStatus, loadCommits]);

  // 处理文件点击
  const handleFileClick = (filePath: string) => {
    if (onFileSelect) {
      const fullPath = `${projectPath}/${filePath}`;
      onFileSelect(fullPath);
    }
  };

  // 切换节点展开状态
  const toggleExpand = useCallback((path: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // 构建文件树结构（不依赖于 expandedNodes）
  const buildFileTree = (files: GitFileStatus[]): FileTreeNode[] => {
    const root: FileTreeNode = {
      name: 'root',
      path: '',
      type: 'directory',
      children: []
    };

    files.forEach(file => {
      const parts = file.path.split('/');
      let currentNode = root;

      // 遍历路径的每个部分，构建树结构
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLastPart = i === parts.length - 1;
        const currentPath = parts.slice(0, i + 1).join('/');

        if (isLastPart) {
          // 添加文件节点
          if (!currentNode.children) {
            currentNode.children = [];
          }
          currentNode.children.push({
            name: part,
            path: file.path,
            type: 'file',
            status: file.status,
            staged: file.staged
          });
        } else {
          // 查找或创建目录节点
          if (!currentNode.children) {
            currentNode.children = [];
          }
          
          let dirNode = currentNode.children.find(
            child => child.type === 'directory' && child.name === part
          );
          
          if (!dirNode) {
            dirNode = {
              name: part,
              path: currentPath,
              type: 'directory',
              children: []
            };
            currentNode.children.push(dirNode);
          }
          
          currentNode = dirNode;
        }
      }
    });

    // 排序：目录在前，文件在后，按名称字母顺序
    const sortNodes = (nodes: FileTreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.type === 'directory' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });
      
      nodes.forEach(node => {
        if (node.children) {
          sortNodes(node.children);
        }
      });
    };

    if (root.children) {
      sortNodes(root.children);
    }

    return root.children || [];
  };

  // 展开所有节点（从指定节点开始）
  const expandAll = useCallback((startPath?: string) => {
    const nodesToExpand = new Set<string>();
    
    const collectNodes = (nodes: FileTreeNode[], parentPath: string = '') => {
      nodes.forEach(node => {
        if (node.type === 'directory') {
          const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
          nodesToExpand.add(node.path);
          if (node.children) {
            collectNodes(node.children, fullPath);
          }
        }
      });
    };
    
    if (startPath) {
      // 找到指定节点并展开其子节点
      const findAndExpand = (nodes: FileTreeNode[]): boolean => {
        for (const node of nodes) {
          if (node.path === startPath && node.type === 'directory') {
            nodesToExpand.add(node.path);
            if (node.children) {
              collectNodes(node.children, node.path);
            }
            return true;
          }
          if (node.children && findAndExpand(node.children)) {
            return true;
          }
        }
        return false;
      };
      
      // 先构建完整的树
      const allTrees = [];
      if (gitStatus) {
        if (gitStatus.staged.length > 0) allTrees.push(...buildFileTree(gitStatus.staged));
        if (gitStatus.modified.length > 0) allTrees.push(...buildFileTree(gitStatus.modified));
        if (gitStatus.untracked.length > 0) allTrees.push(...buildFileTree(gitStatus.untracked));
        if (gitStatus.conflicted.length > 0) allTrees.push(...buildFileTree(gitStatus.conflicted));
      }
      
      findAndExpand(allTrees);
    } else {
      // 展开所有节点
      if (gitStatus) {
        const allTrees = [];
        if (gitStatus.staged.length > 0) allTrees.push(...buildFileTree(gitStatus.staged));
        if (gitStatus.modified.length > 0) allTrees.push(...buildFileTree(gitStatus.modified));
        if (gitStatus.untracked.length > 0) allTrees.push(...buildFileTree(gitStatus.untracked));
        if (gitStatus.conflicted.length > 0) allTrees.push(...buildFileTree(gitStatus.conflicted));
        collectNodes(allTrees);
      }
    }
    
    setExpandedNodes(nodesToExpand);
  }, [gitStatus]);

  // 收起所有节点（从指定节点开始）
  const collapseAll = useCallback((startPath?: string) => {
    if (startPath) {
      const nodesToRemove = new Set<string>();
      
      const collectNodes = (nodes: FileTreeNode[]): boolean => {
        for (const node of nodes) {
          if (node.path === startPath && node.type === 'directory') {
            const collectChildren = (n: FileTreeNode) => {
              if (n.type === 'directory') {
                nodesToRemove.add(n.path);
                if (n.children) {
                  n.children.forEach(collectChildren);
                }
              }
            };
            collectChildren(node);
            return true;
          }
          if (node.children && collectNodes(node.children)) {
            return true;
          }
        }
        return false;
      };
      
      // 构建完整的树
      const allTrees = [];
      if (gitStatus) {
        if (gitStatus.staged.length > 0) allTrees.push(...buildFileTree(gitStatus.staged));
        if (gitStatus.modified.length > 0) allTrees.push(...buildFileTree(gitStatus.modified));
        if (gitStatus.untracked.length > 0) allTrees.push(...buildFileTree(gitStatus.untracked));
        if (gitStatus.conflicted.length > 0) allTrees.push(...buildFileTree(gitStatus.conflicted));
      }
      
      collectNodes(allTrees);
      
      setExpandedNodes(prev => {
        const next = new Set(prev);
        nodesToRemove.forEach(path => next.delete(path));
        return next;
      });
    } else {
      setExpandedNodes(new Set());
    }
  }, [gitStatus]);


  // 渲染文件树节点
  const renderFileTreeNode = (node: FileTreeNode, depth = 0, statusType: 'modified' | 'staged' | 'untracked' | 'conflicted') => {
    const isExpanded = node.type === 'directory' && expandedNodes.has(node.path);
    const isDirectory = node.type === 'directory';
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedPath === node.path;

    return (
      <div key={node.path}>
        <div
          className={cn(
            "flex items-center gap-1 px-2 py-1 hover:bg-accent rounded-sm cursor-pointer group",
            isSelected && "bg-accent"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            setSelectedPath(node.path);
            if (isDirectory) {
              toggleExpand(node.path);
            } else {
              handleFileClick(node.path);
            }
          }}
        >
          {isDirectory && hasChildren && (
            <div className="w-4 h-4 flex items-center justify-center">
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </div>
          )}
          
          {isDirectory ? (
            isExpanded ? (
              <FolderOpen className="h-4 w-4 text-blue-500 flex-shrink-0" />
            ) : (
              <Folder className="h-4 w-4 text-blue-500 flex-shrink-0" />
            )
          ) : (
            <>
              {node.status && getFileStatusBadge(node.status)}
              <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0 ml-1" />
            </>
          )}
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm truncate flex-1">
                  {node.name}
                </span>
              </TooltipTrigger>
              {(node.name.length > 30 || (!isDirectory && node.path.length > 40)) && (
                <TooltipContent side="right">
                  <p className="max-w-xs break-all">{node.path}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>

        {isDirectory && isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderFileTreeNode(child, depth + 1, statusType))}
          </div>
        )}
      </div>
    );
  };

  // 渲染文件列表（树形结构）
  const renderFileList = (files: GitFileStatus[], statusType: 'modified' | 'staged' | 'untracked' | 'conflicted') => {
    if (files.length === 0) return null;

    const fileTree = buildFileTree(files);

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground sticky top-0 bg-background z-10">
          {getFileStatusIcon(statusType)}
          <span>
            {statusType === 'modified' && '已修改'}
            {statusType === 'staged' && '已暂存'}
            {statusType === 'untracked' && '未跟踪'}
            {statusType === 'conflicted' && '冲突'}
          </span>
          <Badge variant="secondary" className="ml-auto">
            {files.length}
          </Badge>
        </div>
        
        <div className="space-y-0.5">
          {fileTree.map((node) => renderFileTreeNode(node, 0, statusType))}
        </div>
      </div>
    );
  };

  // 渲染提交历史
  const renderCommitHistory = () => {
    if (commits.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <GitCommit className="h-8 w-8 mb-2" />
          <p className="text-sm">暂无提交记录</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {commits.map((commit) => (
          <div
            key={commit.hash}
            className="p-3 border rounded-lg hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-start gap-2">
              <GitCommit className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {commit.message}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {commit.author}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {commit.date}
                  </span>
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                    {commit.short_hash || commit.hash.substring(0, 7)}
                  </code>
                  {commit.files_changed > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {commit.files_changed} files
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // 计算变更统计
  const changeStats = gitStatus ? {
    total: gitStatus.staged.length + gitStatus.modified.length + gitStatus.untracked.length + gitStatus.conflicted.length,
    staged: gitStatus.staged.length,
    modified: gitStatus.modified.length,
    untracked: gitStatus.untracked.length,
    conflicted: gitStatus.conflicted.length,
  } : null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={panelRef}
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 300, opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{ width: `${width}px` }}
          className={cn(
            "fixed right-0 top-[172px] bottom-0 bg-background border-l shadow-lg z-40",
            "flex flex-col",
            className
          )}
        >
          {/* 拖拽手柄 */}
          <div
            ref={resizeHandleRef}
            className="absolute left-0 top-0 bottom-0 w-1 hover:w-2 bg-transparent hover:bg-primary/20 cursor-col-resize transition-all"
            onMouseDown={() => setIsResizing(true)}
          >
            <div className="absolute left-0 top-1/2 -translate-y-1/2">
              <GripVertical className="h-6 w-6 text-muted-foreground/50" />
            </div>
          </div>

          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-medium text-sm">Git</h3>
              {gitStatus && (
                <Badge variant="outline" className="text-xs">
                  {gitStatus.branch}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* 展开/收起按钮 */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => expandAll(selectedPath || undefined)}
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{selectedPath ? '展开当前文件夹' : '展开所有文件夹'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => collapseAll(selectedPath || undefined)}
                    >
                      <Minimize2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{selectedPath ? '收起当前文件夹' : '收起所有文件夹'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              {changeStats && changeStats.total > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {changeStats.total} 变更
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={loadGitStatus}
                disabled={loading}
                className="h-7 w-7"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggle}
                className="h-7 w-7"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Branch Info */}
          {gitStatus && (gitStatus.ahead > 0 || gitStatus.behind > 0) && (
            <div className="px-3 py-2 border-b bg-muted/50">
              <div className="flex items-center gap-3 text-xs">
                {gitStatus.ahead > 0 && (
                  <div className="flex items-center gap-1">
                    <GitPullRequest className="h-3 w-3 text-green-500" />
                    <span>{gitStatus.ahead} ahead</span>
                  </div>
                )}
                {gitStatus.behind > 0 && (
                  <div className="flex items-center gap-1">
                    <GitMerge className="h-3 w-3 text-blue-500" />
                    <span>{gitStatus.behind} behind</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="w-full rounded-none border-b">
              <TabsTrigger value="changes" className="flex-1 gap-2">
                <FileDiff className="h-4 w-4" />
                变更
                {changeStats && changeStats.total > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {changeStats.total}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1 gap-2">
                <GitCommit className="h-4 w-4" />
                历史
              </TabsTrigger>
            </TabsList>

            {/* Content */}
            {error ? (
              <div className="flex flex-col items-center justify-center flex-1 p-4">
                <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                <p className="text-sm text-center text-muted-foreground">{error}</p>
              </div>
            ) : loading && !gitStatus ? (
              <div className="flex items-center justify-center flex-1">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <>
                <TabsContent value="changes" className="flex-1 m-0">
                  <ScrollArea className="h-full">
                    <div className="p-2 space-y-4">
                      {gitStatus && (
                        <>
                          {renderFileList(gitStatus.staged, 'staged')}
                          {renderFileList(gitStatus.modified, 'modified')}
                          {renderFileList(gitStatus.untracked, 'untracked')}
                          {renderFileList(gitStatus.conflicted, 'conflicted')}
                          
                          {changeStats?.total === 0 && (
                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                              <Check className="h-8 w-8 mb-2 text-green-500" />
                              <p className="text-sm">工作区干净</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="history" className="flex-1 m-0">
                  <ScrollArea className="h-full">
                    <div className="p-2">
                      {renderCommitHistory()}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </>
            )}
          </Tabs>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GitPanelEnhanced;