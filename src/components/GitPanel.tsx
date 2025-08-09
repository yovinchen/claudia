import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import {
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  FileText,
  FilePlus,
  FileMinus,
  FileEdit,
  X,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileStatus[];
  modified: GitFileStatus[];
  untracked: GitFileStatus[];
  conflicted: GitFileStatus[];
  is_clean: boolean;
  remote_url?: string;
}

interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

interface GitCommitInfo {
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

interface GitBranchInfo {
  name: string;
  is_current: boolean;
  remote?: string;
  last_commit?: string;
}

interface GitPanelProps {
  projectPath: string;
  isVisible: boolean;
  onToggle: () => void;
  width?: number;
  className?: string;
  refreshInterval?: number;
}

// 获取文件状态图标
const getFileStatusIcon = (status: string) => {
  switch (status) {
    case "added":
      return <FilePlus className="h-3 w-3 text-green-500" />;
    case "modified":
      return <FileEdit className="h-3 w-3 text-yellow-500" />;
    case "deleted":
      return <FileMinus className="h-3 w-3 text-red-500" />;
    case "renamed":
      return <FileEdit className="h-3 w-3 text-blue-500" />;
    case "untracked":
      return <Circle className="h-3 w-3 text-gray-500" />;
    case "conflicted":
      return <AlertCircle className="h-3 w-3 text-red-600" />;
    default:
      return <FileText className="h-3 w-3 text-muted-foreground" />;
  }
};

// 格式化日期
const formatDate = (dateStr: string, t: (key: string, opts?: any) => string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor(diff / (1000 * 60));

  if (days > 7) {
    return date.toLocaleDateString();
  } else if (days > 0) {
    return t('app.daysAgo', { count: days });
  } else if (hours > 0) {
    return t('app.hoursAgo', { count: hours });
  } else if (minutes > 0) {
    return t('app.minutesAgo', { count: minutes });
  } else {
    return t('app.justNow');
  }
};

export const GitPanel: React.FC<GitPanelProps> = ({
  projectPath,
  isVisible,
  onToggle,
  width = 320,
  className,
  refreshInterval = 5000,
}) => {
  const { t } = useTranslation();
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [selectedTab, setSelectedTab] = useState<"status" | "history" | "branches">("status");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 获取 Git 状态
  const fetchGitStatus = useCallback(async () => {
    if (!projectPath) return;
    
    try {
      setError(null);
      const status = await invoke<GitStatus>("get_git_status", {
        path: projectPath,
      });
      setGitStatus(status);
    } catch (err) {
      console.error("Failed to fetch git status:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch git status");
      setGitStatus(null);
    }
  }, [projectPath]);

  // 获取提交历史
  const fetchCommitHistory = useCallback(async () => {
    if (!projectPath) return;
    
    try {
      const history = await invoke<GitCommitInfo[]>("get_git_history", {
        path: projectPath,
        limit: 50,
      });
      setCommits(history);
    } catch (err) {
      console.error("Failed to fetch commit history:", err);
    }
  }, [projectPath]);

  // 获取分支列表
  const fetchBranches = useCallback(async () => {
    if (!projectPath) return;
    
    try {
      const branchList = await invoke<GitBranchInfo[]>("get_git_branches", {
        path: projectPath,
      });
      setBranches(branchList);
    } catch (err) {
      console.error("Failed to fetch branches:", err);
    }
  }, [projectPath]);

  // 刷新所有数据
  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([
      fetchGitStatus(),
      fetchCommitHistory(),
      fetchBranches(),
    ]);
    setIsRefreshing(false);
  }, [fetchGitStatus, fetchCommitHistory, fetchBranches]);

  // 初始加载和定时刷新
  useEffect(() => {
    if (!projectPath || !isVisible) return;
    
    setLoading(true);
    refreshAll().finally(() => setLoading(false));
    
    // 定时刷新状态
    const interval = setInterval(() => {
      fetchGitStatus();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [projectPath, isVisible, refreshInterval, refreshAll, fetchGitStatus]);

  // 渲染状态视图
  const renderStatusView = () => {
    if (!gitStatus) {
      return (
        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
          <GitBranch className="h-8 w-8 mb-2" />
          <p className="text-sm">{t('app.noGitRepository')}</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Branch Info */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{gitStatus.branch}</span>
            </div>
            <div className="flex items-center gap-2">
              {gitStatus.ahead > 0 && (
                <Badge variant="outline" className="text-xs">
                  ↑ {gitStatus.ahead}
                </Badge>
              )}
              {gitStatus.behind > 0 && (
                <Badge variant="outline" className="text-xs">
                  ↓ {gitStatus.behind}
                </Badge>
              )}
            </div>
          </div>
          {gitStatus.remote_url && (
            <p className="text-xs text-muted-foreground truncate">
              {gitStatus.remote_url}
            </p>
          )}
        </div>

        {/* Status Summary */}
        {gitStatus.is_clean ? (
          <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-md">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm">{t('app.workingTreeClean')}</span>
          </div>
        ) : (
          <div className="space-y-2">
            {gitStatus.staged.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-green-600">
                  {t('app.staged')} ({gitStatus.staged.length})
                </p>
                {gitStatus.staged.map((file) => (
                  <div
                    key={`staged-${file.path}`}
                    className="flex items-center gap-2 px-2 py-1 hover:bg-accent rounded-sm text-xs"
                  >
                    {getFileStatusIcon(file.status)}
                    <span className="truncate">{file.path}</span>
                  </div>
                ))}
              </div>
            )}

            {gitStatus.modified.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-yellow-600">
                  {t('app.modified')} ({gitStatus.modified.length})
                </p>
                {gitStatus.modified.map((file) => (
                  <div
                    key={`modified-${file.path}`}
                    className="flex items-center gap-2 px-2 py-1 hover:bg-accent rounded-sm text-xs"
                  >
                    {getFileStatusIcon(file.status)}
                    <span className="truncate">{file.path}</span>
                  </div>
                ))}
              </div>
            )}

            {gitStatus.untracked.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-600">
                  {t('app.untracked')} ({gitStatus.untracked.length})
                </p>
                {gitStatus.untracked.slice(0, 10).map((file) => (
                  <div
                    key={`untracked-${file.path}`}
                    className="flex items-center gap-2 px-2 py-1 hover:bg-accent rounded-sm text-xs"
                  >
                    {getFileStatusIcon(file.status)}
                    <span className="truncate">{file.path}</span>
                  </div>
                ))}
                {gitStatus.untracked.length > 10 && (
                  <p className="text-xs text-muted-foreground pl-2">
                    {t('app.andMore', { count: gitStatus.untracked.length - 10 })}
                  </p>
                )}
              </div>
            )}

            {gitStatus.conflicted.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-red-600">
                  {t('app.conflicted')} ({gitStatus.conflicted.length})
                </p>
                {gitStatus.conflicted.map((file) => (
                  <div
                    key={`conflicted-${file.path}`}
                    className="flex items-center gap-2 px-2 py-1 hover:bg-accent rounded-sm text-xs"
                  >
                    {getFileStatusIcon(file.status)}
                    <span className="truncate">{file.path}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // 渲染历史视图
  const renderHistoryView = () => {
    if (commits.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
          <GitCommit className="h-8 w-8 mb-2" />
          <p className="text-sm">{t('app.noCommitsFound')}</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {commits.map((commit) => (
          <div
            key={commit.hash}
            className="p-3 border rounded-md hover:bg-accent transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {commit.message}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs text-muted-foreground">
                    {commit.short_hash}
                  </code>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">
                    {commit.author}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(commit.date, t)}
                  </span>
                  {commit.files_changed > 0 && (
                    <>
                      <span className="text-xs text-muted-foreground">•</span>
                      <div className="flex items-center gap-2 text-xs">
                        <span>{commit.files_changed} {t('app.filesChanged')}</span>
                        <span className="text-green-600">+{commit.insertions}</span>
                        <span className="text-red-600">-{commit.deletions}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // 渲染分支视图
  const renderBranchesView = () => {
    if (branches.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
          <GitMerge className="h-8 w-8 mb-2" />
          <p className="text-sm">{t('app.noBranchesFound')}</p>
        </div>
      );
    }

    const localBranches = branches.filter(b => !b.remote);
    const remoteBranches = branches.filter(b => b.remote);

    return (
      <div className="space-y-4">
        {localBranches.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              {t('app.localBranches')}
            </p>
            {localBranches.map((branch) => (
              <div
                key={branch.name}
                className={cn(
                  "flex items-center justify-between p-2 rounded-md hover:bg-accent",
                  branch.is_current && "bg-accent"
                )}
              >
                <div className="flex items-center gap-2">
                  <GitBranch className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm">{branch.name}</span>
                  {branch.is_current && (
                    <Badge variant="secondary" className="text-xs">
                      {t('app.current')}
                    </Badge>
                  )}
                </div>
                {branch.last_commit && (
                  <code className="text-xs text-muted-foreground">
                    {branch.last_commit.slice(0, 7)}
                  </code>
                )}
              </div>
            ))}
          </div>
        )}

        {remoteBranches.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              {t('app.remoteBranches')}
            </p>
            {remoteBranches.map((branch) => (
              <div
                key={branch.name}
                className="flex items-center justify-between p-2 rounded-md hover:bg-accent"
              >
                <div className="flex items-center gap-2">
                  <GitPullRequest className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {branch.name}
                  </span>
                </div>
                {branch.last_commit && (
                  <code className="text-xs text-muted-foreground">
                    {branch.last_commit.slice(0, 7)}
                  </code>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className={cn(
            "fixed right-0 top-[172px] bottom-0 bg-background border-l border-border shadow-xl z-20",
            className
          )}
          style={{ width: `${width}px` }}
        >
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-3 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{t('app.gitPanel')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={refreshAll}
                          disabled={isRefreshing}
                          className="h-6 w-6"
                        >
                          {isRefreshing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('app.refresh')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggle}
                    className="h-6 w-6"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <Tabs
              value={selectedTab}
              onValueChange={(v) => setSelectedTab(v as typeof selectedTab)}
              className="flex-1 flex flex-col"
            >
              <TabsList className="grid w-full grid-cols-3 rounded-none border-b">
                <TabsTrigger value="status" className="text-xs">
                  {t('app.gitStatus')}
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs">
                  {t('app.gitHistory')}
                </TabsTrigger>
                <TabsTrigger value="branches" className="text-xs">
                  {t('app.gitBranches')}
                </TabsTrigger>
              </TabsList>

              {error ? (
                <div className="flex flex-col items-center justify-center h-32 p-4">
                  <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                  <p className="text-sm text-muted-foreground text-center">{error}</p>
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <>
                  <TabsContent value="status" className="flex-1 mt-0">
                    <ScrollArea className="h-full p-3">
                      {renderStatusView()}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="history" className="flex-1 mt-0">
                    <ScrollArea className="h-full p-3">
                      {renderHistoryView()}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="branches" className="flex-1 mt-0">
                    <ScrollArea className="h-full p-3">
                      {renderBranchesView()}
                    </ScrollArea>
                  </TabsContent>
                </>
              )}
            </Tabs>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Add default export
export default GitPanel;
