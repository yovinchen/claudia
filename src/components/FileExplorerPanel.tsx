import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Folder,
  FolderOpen,
  File,
  FileText,
  FileCode,
  FileJson,
  FileImage,
  Search,
  ChevronRight,
  ChevronDown,
  X,
  RefreshCw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface FileNode {
  name: string;
  path: string;
  file_type: "file" | "directory";
  children?: FileNode[];
  size?: number;
  modified?: number;
  expanded?: boolean;
}

interface FileExplorerPanelProps {
  projectPath: string;
  isVisible: boolean;
  onFileSelect?: (path: string) => void;
  onFileOpen?: (path: string) => void;
  onToggle: () => void;
  width?: number;
  className?: string;
}

// 获取文件图标
const getFileIcon = (filename: string) => {
  const ext = filename.split(".").pop()?.toLowerCase();

  const iconMap: Record<string, React.ReactNode> = {
    // 代码文件
    ts: <FileCode className="h-4 w-4 text-blue-500" />,
    tsx: <FileCode className="h-4 w-4 text-blue-500" />,
    js: <FileCode className="h-4 w-4 text-yellow-500" />,
    jsx: <FileCode className="h-4 w-4 text-yellow-500" />,
    py: <FileCode className="h-4 w-4 text-green-500" />,
    rs: <FileCode className="h-4 w-4 text-orange-500" />,
    go: <FileCode className="h-4 w-4 text-cyan-500" />,
    java: <FileCode className="h-4 w-4 text-red-500" />,
    cpp: <FileCode className="h-4 w-4 text-purple-500" />,
    c: <FileCode className="h-4 w-4 text-purple-500" />,

    // 配置文件
    json: <FileJson className="h-4 w-4 text-yellow-600" />,
    yaml: <FileText className="h-4 w-4 text-pink-500" />,
    yml: <FileText className="h-4 w-4 text-pink-500" />,
    toml: <FileText className="h-4 w-4 text-gray-500" />,
    xml: <FileText className="h-4 w-4 text-orange-500" />,

    // 文档文件
    md: <FileText className="h-4 w-4 text-gray-600" />,
    txt: <FileText className="h-4 w-4 text-gray-500" />,
    pdf: <FileText className="h-4 w-4 text-red-600" />,

    // 图片文件
    png: <FileImage className="h-4 w-4 text-green-600" />,
    jpg: <FileImage className="h-4 w-4 text-green-600" />,
    jpeg: <FileImage className="h-4 w-4 text-green-600" />,
    gif: <FileImage className="h-4 w-4 text-green-600" />,
    svg: <FileImage className="h-4 w-4 text-purple-600" />,
    ico: <FileImage className="h-4 w-4 text-blue-600" />,
  };

  return iconMap[ext || ""] || <File className="h-4 w-4 text-muted-foreground" />;
};

export const FileExplorerPanel: React.FC<FileExplorerPanelProps> = ({
  projectPath,
  isVisible,
  onFileSelect,
  onFileOpen,
  onToggle,
  width = 280,
  className,
}) => {
  const { t } = useTranslation();
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // 文件点击处理状态
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const [lastClickPath, setLastClickPath] = useState<string | null>(null);
  
  // 键盘导航状态
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [flattenedNodes, setFlattenedNodes] = useState<FileNode[]>([]);

  const unlistenRef = React.useRef<UnlistenFn | null>(null);

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

  // 打开文件
  const handleOpenFile = useCallback((node: FileNode) => {
    if (node.file_type === "file") {
      if (onFileOpen) {
        onFileOpen(node.path);
      }
    }
  }, [onFileOpen]);

  // 扁平化文件树以支持键盘导航
  const flattenTree = useCallback((node: FileNode, result: FileNode[] = []): FileNode[] => {
    result.push(node);
    if (node.file_type === "directory" && expandedNodes.has(node.path) && node.children) {
      node.children.forEach(child => flattenTree(child, result));
    }
    return result;
  }, [expandedNodes]);

  // 更新扁平化节点列表
  useEffect(() => {
    if (fileTree) {
      const flattened = flattenTree(fileTree);
      setFlattenedNodes(flattened);
      // 如果没有选中的节点，选中第一个
      if (!selectedPath && flattened.length > 0) {
        setSelectedPath(flattened[0].path);
      }
    }
  }, [fileTree, expandedNodes, flattenTree, selectedPath]);

  // 键盘导航处理
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedPath || flattenedNodes.length === 0) return;

      const currentIndex = flattenedNodes.findIndex(node => node.path === selectedPath);
      if (currentIndex === -1) return;

      const currentNode = flattenedNodes[currentIndex];

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          if (currentIndex > 0) {
            setSelectedPath(flattenedNodes[currentIndex - 1].path);
          }
          break;

        case "ArrowDown":
          e.preventDefault();
          if (currentIndex < flattenedNodes.length - 1) {
            setSelectedPath(flattenedNodes[currentIndex + 1].path);
          }
          break;

        case "ArrowLeft":
          e.preventDefault();
          if (currentNode.file_type === "directory" && expandedNodes.has(currentNode.path)) {
            // 收起文件夹
            toggleExpand(currentNode.path);
          } else {
            // 移动到父文件夹
            const parentPath = currentNode.path.substring(0, currentNode.path.lastIndexOf("/"));
            const parentNode = flattenedNodes.find(node => node.path === parentPath);
            if (parentNode) {
              setSelectedPath(parentNode.path);
            }
          }
          break;

        case "ArrowRight":
          e.preventDefault();
          if (currentNode.file_type === "directory") {
            if (!expandedNodes.has(currentNode.path)) {
              // 展开文件夹
              toggleExpand(currentNode.path);
            } else if (currentNode.children && currentNode.children.length > 0) {
              // 移动到第一个子节点
              setSelectedPath(currentNode.children[0].path);
            }
          } else {
            // 打开文件
            handleOpenFile(currentNode);
          }
          break;

        case "Enter":
          e.preventDefault();
          if (currentNode.file_type === "directory") {
            toggleExpand(currentNode.path);
          } else {
            handleOpenFile(currentNode);
          }
          break;

        case " ": // Space key
          e.preventDefault();
          if (currentNode.file_type === "file") {
            // 添加到聊天
            onFileSelect?.(currentNode.path);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, selectedPath, flattenedNodes, expandedNodes, toggleExpand, onFileSelect, handleOpenFile]);

  // 加载文件树
  const loadFileTree = useCallback(async () => {
    if (!projectPath) return;

    try {
      setLoading(true);
      setError(null);

      const tree = await invoke<FileNode>("read_directory_tree", {
        path: projectPath,
        maxDepth: 5,
        ignorePatterns: [
          "node_modules",
          ".git",
          "target",
          "dist",
          "build",
          ".idea",
          ".vscode",
          "__pycache__",
          ".DS_Store",
        ],
      });

      setFileTree(tree);

      // 默认展开根目录
      if (tree) {
        setExpandedNodes(new Set([tree.path]));
      }
    } catch (err) {
      console.error("Failed to load file tree:", err);
      setError(err instanceof Error ? err.message : "Failed to load file tree");
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  // 搜索文件
  const searchFiles = useCallback(async (query: string) => {
    if (!projectPath || !query) {
      setSearchResults([]);
      return;
    }

    try {
      setIsSearching(true);
      const results = await invoke<string[]>("search_files_by_name", {
        basePath: projectPath,
        query,
        maxResults: 50,
      });
      setSearchResults(results);
    } catch (err) {
      console.error("Failed to search files:", err);
    } finally {
      setIsSearching(false);
    }
  }, [projectPath]);

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        searchFiles(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchFiles]);

  // 监听文件系统变化
  useEffect(() => {
    if (!projectPath || !isVisible) return;

    const setupListener = async () => {
      try {
        // 监听文件系统变化事件
        unlistenRef.current = await listen("file-system-change", (event) => {
          console.log("File system changed:", event.payload);
          loadFileTree();
        });

        // 启动目录监听
        await invoke("watch_directory", { path: projectPath });
      } catch (err) {
        console.error("Failed to setup file watcher:", err);
      }
    };

    setupListener();
    loadFileTree();

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [projectPath, isVisible, loadFileTree]);

  // 处理文件选择
  const handleFileClick = useCallback((node: FileNode) => {
    // 设置选中状态
    setSelectedPath(node.path);
    
    if (node.file_type === "directory") {
      toggleExpand(node.path);
    } else {
      const now = Date.now();
      const timeDiff = now - lastClickTime;
      
      // 检测双击（300ms内的两次点击）
      if (lastClickPath === node.path && timeDiff < 300) {
        // 双击 - 添加到提及
        onFileSelect?.(node.path);
        // 重置状态
        setLastClickTime(0);
        setLastClickPath(null);
      } else {
        // 单击 - 打开文件
        handleOpenFile(node);
        setLastClickTime(now);
        setLastClickPath(node.path);
      }
    }
  }, [onFileSelect, toggleExpand, lastClickTime, lastClickPath, handleOpenFile]);

  // 复制路径到剪贴板
  const copyPath = useCallback(async (path: string) => {
    await navigator.clipboard.writeText(path);
  }, []);

  // 渲染文件树节点
  const renderNode = useCallback((node: FileNode, depth = 0): React.ReactNode => {
    const isExpanded = expandedNodes.has(node.path);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedPath === node.path;

    return (
      <div key={node.path}>
        <ContextMenu>
          <ContextMenuTrigger>
            <div
              className={cn(
                "flex items-center gap-1 px-2 py-1 hover:bg-accent cursor-pointer rounded-sm",
                "group transition-colors",
                isSelected && "bg-accent ring-1 ring-primary/20"
              )}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              onClick={() => handleFileClick(node)}
            >
              {node.file_type === "directory" ? (
                <>
                  {hasChildren && (
                    <div className="w-4 h-4 flex items-center justify-center">
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </div>
                  )}
                  {!hasChildren && <div className="w-4" />}
                  <div className="flex-shrink-0">
                    {isExpanded ? (
                      <FolderOpen className="h-4 w-4 text-blue-500" />
                    ) : (
                      <Folder className="h-4 w-4 text-blue-500" />
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="w-4" />
                  <div className="flex-shrink-0">{getFileIcon(node.name)}</div>
                </>
              )}
              <span className="text-sm truncate flex-1">{node.name}</span>
            </div>
          </ContextMenuTrigger>

          <ContextMenuContent>
            <ContextMenuItem onClick={() => copyPath(node.path)}>
              {t('app.copyPath')}
            </ContextMenuItem>
            {node.file_type === "file" && (
              <>
                <ContextMenuItem onClick={() => handleOpenFile(node)}>
                  {t('app.openFile')}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onFileSelect?.(node.path)}>
                  {t('app.addToChat')}
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>

        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }, [expandedNodes, handleFileClick, copyPath, onFileSelect, onFileOpen, selectedPath, handleOpenFile]);

  // 渲染搜索结果
  const renderSearchResults = useMemo(() => {
    if (!searchQuery || searchResults.length === 0) return null;

    return (
      <div className="border-t">
        <div className="p-2 text-xs text-muted-foreground">
          {searchResults.length > 0
            ? `Found ${searchResults.length} results`
            : t('app.noFilesFound')}
        </div>
        <div className="max-h-64 overflow-y-auto">
          {searchResults.map((path) => {
            const filename = path.split("/").pop() || path;
            const relativePath = path.replace(projectPath + "/", "");

            return (
              <div
                key={path}
                className="px-3 py-1.5 hover:bg-accent cursor-pointer text-sm"
                onClick={() => onFileSelect?.(path)}
              >
                <div className="flex items-center gap-2">
                  {getFileIcon(filename)}
                  <span className="truncate">{relativePath}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [searchQuery, searchResults, projectPath, onFileSelect]);

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <motion.div
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className={cn(
            "fixed left-0 top-[172px] bottom-0 bg-background border-r border-border shadow-xl z-20",
            className
          )}
          style={{ width: `${width}px` }}
        >
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-3 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{t('app.fileExplorer')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={loadFileTree}
                    disabled={loading}
                    className="h-6 w-6"
                  >
                    {loading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </Button>
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

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder={t('app.searchFiles')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 pl-7 text-xs"
                />
                {isSearching && (
                  <Loader2 className="absolute right-2 top-1/2 transform -translate-y-1/2 h-3 w-3 animate-spin" />
                )}
              </div>
            </div>

            {/* File Tree or Search Results */}
            <ScrollArea className="flex-1">
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
                  {renderSearchResults}
                  {!searchQuery && fileTree && (
                    <div className="py-1">
                      {renderNode(fileTree)}
                    </div>
                  )}
                </>
              )}
            </ScrollArea>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </>
  );
};

// Add default export
export default FileExplorerPanel;
