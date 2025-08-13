import React, { useState, useEffect, useCallback, useRef } from "react";
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
  FolderTree,
  FileStack,
  Maximize2,
  Minimize2,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FileNode {
  name: string;
  path: string;
  file_type: "file" | "directory";
  children?: FileNode[];
  size?: number;
  modified?: number;
  expanded?: boolean;
  depth?: number;
}

interface FileExplorerPanelEnhancedProps {
  projectPath: string;
  isVisible: boolean;
  onFileSelect?: (path: string) => void;
  onFileOpen?: (path: string) => void;
  onToggle: () => void;
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

// 组织文件到文件夹结构（改进版，支持更深层级）
const organizeFilesByFolder = (files: FileNode[]): Map<string, FileNode[]> => {
  const folderMap = new Map<string, FileNode[]>();
  
  const processNode = (node: FileNode, parentPath: string = "", depth: number = 0) => {
    // 限制最大深度为 10 层
    if (depth > 10) return;
    
    const currentPath = parentPath || "根目录";
    
    if (node.file_type === "file") {
      if (!folderMap.has(currentPath)) {
        folderMap.set(currentPath, []);
      }
      folderMap.get(currentPath)!.push(node);
    } else {
      const folderPath = parentPath ? `${parentPath}/${node.name}` : node.name;
      // 创建文件夹条目，即使它没有直接包含文件
      if (!folderMap.has(folderPath)) {
        folderMap.set(folderPath, []);
      }
      
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => processNode(child, folderPath, depth + 1));
      }
    }
  };
  
  files.forEach(node => processNode(node, "", 0));
  return folderMap;
};

export const FileExplorerPanelEnhanced: React.FC<FileExplorerPanelEnhancedProps> = ({
  projectPath,
  isVisible,
  onFileSelect,
  onFileOpen,
  onToggle,
}) => {
  const { t } = useTranslation();
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [filteredTree, setFilteredTree] = useState<FileNode[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [flattenedNodes, setFlattenedNodes] = useState<FileNode[]>([]);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [lastClickPath, setLastClickPath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"tree" | "folder">("tree");
  
  const unlistenRef = useRef<UnlistenFn | null>(null);

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

  // 展开所有节点（从指定节点开始）
  const expandAll = useCallback((startNode?: FileNode) => {
    const nodesToExpand = new Set<string>();
    
    const collectNodes = (nodes: FileNode[]) => {
      nodes.forEach(node => {
        if (node.file_type === 'directory') {
          nodesToExpand.add(node.path);
          if (node.children) {
            collectNodes(node.children);
          }
        }
      });
    };
    
    if (startNode) {
      if (startNode.file_type === 'directory') {
        nodesToExpand.add(startNode.path);
        if (startNode.children) {
          collectNodes(startNode.children);
        }
      }
    } else {
      collectNodes(filteredTree);
    }
    
    setExpandedNodes(nodesToExpand);
  }, [filteredTree]);

  // 收起所有节点（从指定节点开始）
  const collapseAll = useCallback((startNode?: FileNode) => {
    if (startNode) {
      const nodesToRemove = new Set<string>();
      
      const collectNodes = (node: FileNode) => {
        if (node.file_type === 'directory') {
          nodesToRemove.add(node.path);
          if (node.children) {
            node.children.forEach(collectNodes);
          }
        }
      };
      
      collectNodes(startNode);
      
      setExpandedNodes(prev => {
        const next = new Set(prev);
        nodesToRemove.forEach(path => next.delete(path));
        return next;
      });
    } else {
      setExpandedNodes(new Set());
    }
  }, []);

  // 获取当前选中的节点
  const getSelectedNode = useCallback((): FileNode | undefined => {
    if (!selectedPath) return undefined;
    
    const findNode = (nodes: FileNode[]): FileNode | undefined => {
      for (const node of nodes) {
        if (node.path === selectedPath) {
          return node;
        }
        if (node.children) {
          const found = findNode(node.children);
          if (found) return found;
        }
      }
      return undefined;
    };
    
    return findNode(filteredTree);
  }, [selectedPath, filteredTree]);

  // 处理展开按钮点击
  const handleExpandAllClick = useCallback(() => {
    const selectedNode = getSelectedNode();
    expandAll(selectedNode);
  }, [getSelectedNode, expandAll]);

  // 处理收起按钮点击
  const handleCollapseAllClick = useCallback(() => {
    const selectedNode = getSelectedNode();
    collapseAll(selectedNode);
  }, [getSelectedNode, collapseAll]);

  // 扁平化文件树
  const flattenTree = useCallback((nodes: FileNode[], depth = 0): FileNode[] => {
    const result: FileNode[] = [];
    
    nodes.forEach(node => {
      const nodeWithDepth = { ...node, depth };
      result.push(nodeWithDepth);
      
      if (node.file_type === 'directory' && expandedNodes.has(node.path) && node.children) {
        result.push(...flattenTree(node.children, depth + 1));
      }
    });
    
    return result;
  }, [expandedNodes]);

  // 加载文件树
  const loadFileTree = useCallback(async () => {
    if (!projectPath) return;

    try {
      setLoading(true);
      setError(null);
      
      const tree = await invoke<FileNode[]>("get_file_tree", {
        projectPath: projectPath,  // 使用驼峰命名
      });
      
      setFileTree(tree);
      setFilteredTree(tree);
      
      // 不默认展开任何目录，让用户手动展开或使用展开按钮
      setExpandedNodes(new Set());
    } catch (err) {
      console.error("Failed to load file tree:", err);
      setError(err instanceof Error ? err.message : "Failed to load file tree");
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  // 处理文件打开
  const handleOpenFile = useCallback((path: string) => {
    if (onFileOpen) {
      onFileOpen(path);
    }
  }, [onFileOpen]);

  // 处理键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible) return;
      
      // 检查事件目标是否是输入元素
      const target = e.target as HTMLElement;
      const isInputElement = target && (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.contentEditable === 'true' ||
        target.closest('[contenteditable="true"]') !== null ||
        target.closest('input, textarea, [contenteditable]') !== null
      );
      
      // 如果事件来自输入元素，不处理键盘导航
      if (isInputElement) {
        return;
      }
      
      // 检查是否在文件浏览器区域内
      const explorerPanel = document.querySelector('[data-file-explorer-panel]');
      if (explorerPanel && !explorerPanel.contains(target)) {
        // 如果事件不是来自文件浏览器区域，并且有输入元素获得焦点，则不处理
        const activeElement = document.activeElement;
        if (activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          (activeElement as HTMLElement).contentEditable === 'true'
        )) {
          return;
        }
      }
      
      const currentIndex = flattenedNodes.findIndex(node => node.path === selectedPath);
      if (currentIndex === -1 && flattenedNodes.length > 0) {
        setSelectedPath(flattenedNodes[0].path);
        return;
      }
      
      const currentNode = flattenedNodes[currentIndex];
      
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (currentIndex > 0) {
            const prevNode = flattenedNodes[currentIndex - 1];
            setSelectedPath(prevNode.path);
          }
          break;
          
        case 'ArrowDown':
          e.preventDefault();
          if (currentIndex < flattenedNodes.length - 1) {
            const nextNode = flattenedNodes[currentIndex + 1];
            setSelectedPath(nextNode.path);
          }
          break;
          
        case 'ArrowLeft':
          e.preventDefault();
          if (currentNode) {
            if (currentNode.file_type === 'directory' && expandedNodes.has(currentNode.path)) {
              toggleExpand(currentNode.path);
            }
          }
          break;
          
        case 'ArrowRight':
          e.preventDefault();
          if (currentNode) {
            if (currentNode.file_type === 'directory') {
              if (!expandedNodes.has(currentNode.path)) {
                toggleExpand(currentNode.path);
              }
            } else {
              handleOpenFile(currentNode.path);
            }
          }
          break;
          
        case 'Enter':
          e.preventDefault();
          if (currentNode) {
            if (currentNode.file_type === 'directory') {
              toggleExpand(currentNode.path);
            } else {
              handleOpenFile(currentNode.path);
            }
          }
          break;
      }
    };
    
    if (isVisible) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isVisible, selectedPath, flattenedNodes, expandedNodes, toggleExpand, onFileSelect, handleOpenFile]);

  // 更新扁平化节点列表
  useEffect(() => {
    setFlattenedNodes(flattenTree(filteredTree));
  }, [filteredTree, flattenTree]);

  // 过滤文件树
  useEffect(() => {
    if (!searchTerm) {
      setFilteredTree(fileTree);
      return;
    }

    const filterNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes.reduce((acc: FileNode[], node) => {
        const matches = node.name.toLowerCase().includes(searchTerm.toLowerCase());
        
        if (node.file_type === 'directory' && node.children) {
          const filteredChildren = filterNodes(node.children);
          if (filteredChildren.length > 0 || matches) {
            acc.push({
              ...node,
              children: filteredChildren,
            });
          }
        } else if (matches) {
          acc.push(node);
        }
        
        return acc;
      }, []);
    };

    setFilteredTree(filterNodes(fileTree));
  }, [searchTerm, fileTree]);

  // 监听文件系统变化
  useEffect(() => {
    if (!projectPath || !isVisible) return;

    const setupListener = async () => {
      try {
        unlistenRef.current = await listen("file-changed", (event) => {
          console.log("File changed:", event.payload);
          loadFileTree();
        });
      } catch (err) {
        console.error("Failed to setup file listener:", err);
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

  // 处理文件点击
  const handleFileClick = useCallback((node: FileNode) => {
    setSelectedPath(node.path);
    
    if (node.file_type === 'directory') {
      toggleExpand(node.path);
    } else {
      const currentTime = Date.now();
      
      if (lastClickPath === node.path && currentTime - lastClickTime < 500) {
        if (onFileSelect) {
          onFileSelect(node.path);
        }
      } else {
        handleOpenFile(node.path);
      }
      
      setLastClickTime(currentTime);
      setLastClickPath(node.path);
    }
  }, [onFileSelect, toggleExpand, lastClickTime, lastClickPath, handleOpenFile]);

  // 渲染文件节点（优化深层目录显示）
  const renderFileNode = (node: FileNode, depth = 0) => {
    const isExpanded = expandedNodes.has(node.path);
    const isSelected = selectedPath === node.path;
    const isDirectory = node.file_type === 'directory';
    const hasChildren = node.children && node.children.length > 0;
    
    // 计算显示的路径（处理长路径）
    const displayName = node.name.length > 30 
      ? `${node.name.substring(0, 27)}...` 
      : node.name;

    return (
      <div key={node.path}>
        <ContextMenu>
          <ContextMenuTrigger>
            <div
              className={cn(
                "flex items-center gap-1 px-2 py-1 hover:bg-accent rounded-sm cursor-pointer group",
                isSelected && "bg-accent",
                "select-none"
              )}
              style={{ paddingLeft: `${Math.min(depth * 16 + 8, 200)}px` }} // 限制最大缩进
              onClick={() => handleFileClick(node)}
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
              {isDirectory && !hasChildren && (
                <div className="w-4 h-4" /> // 空文件夹的占位符
              )}
              
              {isDirectory ? (
                isExpanded ? (
                  <FolderOpen className="h-4 w-4 text-blue-500" />
                ) : (
                  <Folder className="h-4 w-4 text-blue-500" />
                )
              ) : (
                getFileIcon(node.name)
              )}
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-sm truncate flex-1">
                      {displayName}
                    </span>
                  </TooltipTrigger>
                  {node.name.length > 30 && (
                    <TooltipContent side="right">
                      <p className="max-w-xs break-all">{node.path}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          </ContextMenuTrigger>
          
          <ContextMenuContent>
            <ContextMenuItem onClick={() => handleOpenFile(node.path)}>
              {t("app.open")}
            </ContextMenuItem>
            {!isDirectory && onFileSelect && (
              <ContextMenuItem onClick={() => onFileSelect(node.path)}>
                {t("app.addToMentions")}
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={() => navigator.clipboard.writeText(node.path)}>
              {t("app.copyPath")}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        {isDirectory && isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderFileNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // 渲染文件夹分组视图
  const renderFolderView = () => {
    const folderMap = organizeFilesByFolder(filteredTree);
    const folders = Array.from(folderMap.keys()).sort();
    
    return (
      <div className="space-y-4">
        {folders.map(folderPath => {
          const files = folderMap.get(folderPath) || [];
          const isExpanded = expandedNodes.has(folderPath);
          
          if (files.length === 0) return null;
          
          return (
            <div key={folderPath} className="border rounded-lg overflow-hidden">
              <div
                className="flex items-center gap-2 px-3 py-2 bg-muted/50 cursor-pointer hover:bg-muted"
                onClick={() => toggleExpand(folderPath)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <FolderOpen className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium flex-1 truncate">
                  {folderPath}
                </span>
                <span className="text-xs text-muted-foreground">
                  {files.length} 个文件
                </span>
              </div>
              
              {isExpanded && (
                <div className="p-2 space-y-1">
                  {files.map(file => (
                    <div
                      key={file.path}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-accent cursor-pointer",
                        selectedPath === file.path && "bg-accent"
                      )}
                      onClick={() => handleFileClick(file)}
                    >
                      {getFileIcon(file.name)}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm truncate flex-1">
                              {file.name.length > 35 
                                ? `${file.name.substring(0, 32)}...` 
                                : file.name}
                            </span>
                          </TooltipTrigger>
                          {file.name.length > 35 && (
                            <TooltipContent side="right">
                              <p className="max-w-xs break-all">{file.path}</p>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // 如果不可见，返回null
  if (!isVisible) return null;
  
  return (
    <div className="flex flex-col h-full border-r border-border" data-file-explorer-panel>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium text-sm">{t("app.fileExplorer")}</h3>
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
                      onClick={handleExpandAllClick}
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
                      onClick={handleCollapseAllClick}
                    >
                      <Minimize2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{selectedPath ? '收起当前文件夹' : '收起所有文件夹'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              {/* 视图切换按钮 */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setViewMode(viewMode === 'tree' ? 'folder' : 'tree')}
                    >
                      {viewMode === 'tree' ? (
                        <FileStack className="h-4 w-4" />
                      ) : (
                        <FolderTree className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{viewMode === 'tree' ? '切换到文件夹视图' : '切换到树形视图'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={loadFileTree}
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

          {/* Search */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("app.searchFiles")}
                className="pl-8 h-8"
              />
            </div>
          </div>

          {/* Content */}
          {error ? (
            <div className="flex flex-col items-center justify-center flex-1 p-4">
              <AlertCircle className="h-8 w-8 text-destructive mb-2" />
              <p className="text-sm text-center text-muted-foreground">{error}</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="p-2">
                {viewMode === 'tree' ? (
                  filteredTree.map((node) => renderFileNode(node))
                ) : (
                  renderFolderView()
                )}
              </div>
            </ScrollArea>
          )}
    </div>
  );
};

export default FileExplorerPanelEnhanced;