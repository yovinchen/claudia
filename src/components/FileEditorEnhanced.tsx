import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  X,
  Save,
  AlertCircle,
  Check,
  Loader2,
  Maximize2,
  Minimize2,
  Settings2,
  FileCode2,
  Sparkles,
  Bug,
  Zap,
  AlertTriangle,
  Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import Editor, { Monaco } from "@monaco-editor/react";
import { motion, AnimatePresence } from "framer-motion";
import * as monaco from "monaco-editor";
import { 
  initializeMonaco, 
  formatDocument
} from "@/lib/monaco-config";
import { setupRealtimeLinting } from "@/lib/eslint-integration";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fileSyncManager } from "@/lib/fileSyncManager";

interface FileEditorEnhancedProps {
  filePath: string;
  onClose: () => void;
  className?: string;
}

// 根据文件扩展名获取语言
const getLanguageFromPath = (path: string): string => {
  const ext = path.split(".").pop()?.toLowerCase();
  
  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: "javascript",
    jsx: "javascript", 
    mjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    
    // Web
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    
    // Programming Languages
    py: "python",
    java: "java",
    c: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    go: "go",
    rs: "rust",
    kt: "kotlin",
    swift: "swift",
    m: "objective-c",
    scala: "scala",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    fish: "shell",
    ps1: "powershell",
    r: "r",
    lua: "lua",
    perl: "perl",
    
    // Data/Config
    json: "json",
    jsonc: "json",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    ini: "ini",
    cfg: "ini",
    conf: "ini",
    
    // Documentation
    md: "markdown",
    markdown: "markdown",
    rst: "restructuredtext",
    tex: "latex",
    
    // Database
    sql: "sql",
    mysql: "mysql",
    pgsql: "pgsql",
    
    // Others
    dockerfile: "dockerfile",
    makefile: "makefile",
    cmake: "cmake",
    gradle: "gradle",
    graphql: "graphql",
    proto: "protobuf",
  };
  
  return languageMap[ext || ""] || "plaintext";
};

// 诊断信息接口
interface DiagnosticInfo {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  source?: string;
}

export const FileEditorEnhanced: React.FC<FileEditorEnhancedProps> = ({
  filePath,
  onClose,
  className,
}) => {
  const { t } = useTranslation();
  const [content, setContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticInfo[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(true);
  const [theme, setTheme] = useState<'vs-dark' | 'vs' | 'hc-black'>('vs-dark');
  const [fontSize, setFontSize] = useState(14);
  const [minimap, setMinimap] = useState(true);
  const [wordWrap, setWordWrap] = useState<'on' | 'off'>('on');
  const [autoSave, setAutoSave] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<number>(Date.now());
  const [fileChanged, setFileChanged] = useState(false);
  
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fileCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isApplyingContentRef = useRef(false);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  
  const fileName = filePath.split("/").pop() || filePath;
  const language = getLanguageFromPath(filePath);
  
  // 加载文件内容
  const loadFile = useCallback(async () => {
    if (!filePath) return;
    
    console.log('[FileEditor] Loading file:', filePath);
    
    try {
      setLoading(true);
      setError(null);
      
      const fileContent = await invoke<string>("read_file", {
        path: filePath,
      });
      
      console.log('[FileEditor] File loaded, content length:', fileContent.length);
      
      setContent(fileContent);
      setOriginalContent(fileContent);
      setHasChanges(false);
      setFileChanged(false);
      setLastCheckTime(Date.now());
    } catch (err) {
      console.error("[FileEditor] Failed to load file:", err);
      setError(err instanceof Error ? err.message : t("fileEditor.failedToLoadFile"));
    } finally {
      setLoading(false);
    }
  }, [filePath, t]);
  
  // 保存文件
  const saveFile = useCallback(async () => {
    if (!filePath || !hasChanges) return;
    
    try {
      setSaving(true);
      setError(null);
      
      await invoke("write_file", {
        path: filePath,
        content: content,
      });
      
      setOriginalContent(content);
      setHasChanges(false);
      setSaved(true);
      setLastCheckTime(Date.now());
      setFileChanged(false);
      
      // 显示保存成功提示
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save file:", err);
      setError(err instanceof Error ? err.message : t("fileEditor.failedToSaveFile"));
    } finally {
      setSaving(false);
    }
  }, [filePath, content, hasChanges, t]);
  
  // 自动保存
  useEffect(() => {
    if (autoSave && hasChanges) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      
      autoSaveTimerRef.current = setTimeout(() => {
        saveFile();
      }, 2000);
    }
    
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [autoSave, hasChanges, saveFile]);
  
  // 处理内容变化
  const handleContentChange = useCallback((value: string | undefined) => {
    if (isApplyingContentRef.current) {
      return;
    }
    console.log('[FileEditor] Content change detected, new length:', value?.length);
    if (value !== undefined) {
      setContent(value);
      const changed = value !== originalContent;
      setHasChanges(changed);
      console.log('[FileEditor] Has changes:', changed);
      
      // 触发语法检查
      if (editorRef.current && (language === 'typescript' || language === 'javascript')) {
        validateCode(value);
      }
    }
  }, [originalContent, language]);

  // 确保 Monaco 模型与 React state 同步，避免初始不显示或切换文件后不同步
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const model = ed.getModel();
    if (!model) return;
    const current = model.getValue();
    if (content !== undefined && current !== content) {
      console.log('[FileEditor] Syncing editor model from state');
      isApplyingContentRef.current = true;
      model.setValue(content);
      isApplyingContentRef.current = false;
    }
  }, [content, filePath]);
  
  // 验证代码
  const validateCode = async (_code: string) => {
    if (!monacoRef.current || !editorRef.current) return;
    
    const model = editorRef.current.getModel();
    if (!model) return;
    
    // 获取 Monaco 的内置诊断
    const markers = monacoRef.current.editor.getModelMarkers({ resource: model.uri });
    
    const newDiagnostics: DiagnosticInfo[] = markers.map(marker => ({
      line: marker.startLineNumber,
      column: marker.startColumn,
      message: marker.message,
      severity: marker.severity === 8 ? 'error' : 
                marker.severity === 4 ? 'warning' : 'info',
      source: marker.source || 'typescript'
    }));
    
    setDiagnostics(newDiagnostics);
  };
  
  // 格式化代码
  const handleFormat = () => {
    if (editorRef.current) {
      formatDocument(editorRef.current);
    }
  };
  
  // 处理关闭
  const handleClose = () => {
    if (hasChanges) {
      if (confirm(t("app.unsavedChangesConfirm"))) {
        onClose();
      }
    } else {
      onClose();
    }
  };
  
  // 切换全屏
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };
  
  // Monaco Editor 挂载时的处理
  const handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => {
    console.log('[FileEditor] Editor mounted successfully');
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // 检查编辑器是否可编辑
    const model = editor.getModel();
    if (model) {
      const options = editor.getOptions();
      console.log('[FileEditor] Editor readOnly:', options.get(monaco.editor.EditorOption.readOnly));
      console.log('[FileEditor] Editor value length:', model.getValue().length);
      
      // 强制设置模型可编辑
      model.updateOptions({ tabSize: 2, insertSpaces: true });
    }
    
    // 确保编辑器获得焦点
    editor.focus();
    
    // 手动处理回车键
    editor.addCommand(monaco.KeyCode.Enter, () => {
      const position = editor.getPosition();
      if (position) {
        const model = editor.getModel();
        if (model) {
          // 获取当前行内容
          const lineContent = model.getLineContent(position.lineNumber);
          const beforeCursor = lineContent.substring(0, position.column - 1);
          
          // 计算缩进
          const indent = beforeCursor.match(/^\s*/)?.[0] || '';
          
          // 插入新行
          editor.executeEdits('enter', [{
            range: new monaco.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column
            ),
            text: '\n' + indent,
            forceMoveMarkers: true
          }]);
          
          // 移动光标到新行
          editor.setPosition({
            lineNumber: position.lineNumber + 1,
            column: indent.length + 1
          });
        }
      }
    });
    
    // 监听光标位置变化
    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition({
        line: e.position.lineNumber,
        column: e.position.column
      });
    });
    
    // 使用系统默认的复制快捷键，避免拦截导致权限/聚焦问题
    
    // 使用系统默认的粘贴快捷键（Cmd/Ctrl+V），避免拦截导致无法粘贴
    
    // 使用系统默认的剪切快捷键，避免拦截导致不一致行为
    
    // 初始化 Monaco 配置
    initializeMonaco();
    
    // 设置实时语法检查
    setupRealtimeLinting(editor, {
      enabled: true,
      delay: 500,
      showInlineErrors: true,
      showErrorsInScrollbar: true,
      showErrorsInMinimap: true,
    });
    
    // 移除原有的快捷键绑定，使用 Monaco 内置的
    // 这些快捷键会自动工作，不需要额外处理
    
    // 监听内容变化事件（作为备用）
    editor.onDidChangeModelContent(() => {
      const value = editor.getValue();
      if (value !== content) {
        console.log('[FileEditor] Content changed via editor event');
        handleContentChange(value);
      }
    });
    
    // 监听光标位置变化
    editor.onDidChangeCursorPosition(() => {
      // 可以在这里更新状态栏信息
    });
    
    // 初始验证
    if (language === 'typescript' || language === 'javascript') {
      setTimeout(() => validateCode(content), 1000);
    }
  };
  
  // 快捷键处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果焦点在编辑器内，除了特定快捷键外不处理其他按键
      const activeElement = document.activeElement;
      const isInEditor = activeElement?.closest('.monaco-editor');
      
      // Ctrl/Cmd + S 保存
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveFile();
        return;
      }
      
      // Ctrl/Cmd + Shift + F 格式化
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        handleFormat();
        return;
      }
      
      // 如果在编辑器内，不处理其他快捷键
      if (isInEditor) {
        return;
      }
      
      // F11 全屏
      if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      }
      
      // Esc 退出全屏
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasChanges, saveFile, isFullscreen]);
  
  // 使用文件同步管理器监听文件变化
  useEffect(() => {
    if (!filePath) return;

    const listenerId = `file-editor-${filePath}`;
    
    // 注册文件变化监听器
    fileSyncManager.registerChangeListener(
      listenerId,
      filePath,
      (changedPath, changeType) => {
        // 检查是否是当前文件的变化
        if (changedPath === filePath && (changeType === 'modified' || changeType === 'created')) {
          // 检查时间间隔，避免自己保存触发的事件
          const timeSinceLastSave = Date.now() - lastCheckTime;
          
          if (timeSinceLastSave > 1000) { // 超过1秒，可能是外部修改
            console.log('[FileEditor] File changed externally via FileSyncManager:', changedPath, changeType);
            setFileChanged(true);
            
            // 如果没有未保存的更改，自动重新加载
            if (!hasChanges) {
              console.log('[FileEditor] Auto-reloading file content');
              loadFile();
            } else {
              // 显示提示
              setError(t("fileEditor.externallyModified"));
            }
          }
        }
      }
    );

    const setupFileWatcher = async () => {
      if (!filePath) return;
      
      try {
        // 监听文件所在目录
        const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
        await invoke('watch_directory', { 
          path: dirPath,
          recursive: false 
        });
        
        // 监听文件变化事件（作为备用）
        unlistenRef.current = await listen('file-system-change', (event: any) => {
          const { path, change_type } = event.payload;
          
          // 检查是否是当前文件的变化
          if (path === filePath && (change_type === 'modified' || change_type === 'created')) {
            // 检查时间间隔，避免自己保存触发的事件
            const timeSinceLastSave = Date.now() - lastCheckTime;
            
            if (timeSinceLastSave > 1000) { // 超过1秒，可能是外部修改
              console.log('[FileEditor] File changed externally (fallback):', path, change_type);
              setFileChanged(true);
              
              // 如果没有未保存的更改，自动重新加载
              if (!hasChanges) {
                loadFile();
              } else {
                // 显示提示
                setError(t("fileEditor.externallyModified"));
              }
            }
          }
        });
      } catch (err) {
        console.error('Failed to setup file watcher:', err);
        // 如果文件监听失败，回退到轮询模式
        fallbackToPolling();
      }
    };
    
    // 回退到轮询模式
    const fallbackToPolling = () => {
      const checkFileChanges = async () => {
        if (!filePath || !editorRef.current) return;
        
        try {
          const fileInfo = await invoke<any>('get_file_info', { path: filePath });
          
          if (fileInfo && fileInfo.modified) {
            const fileModifiedTime = new Date(fileInfo.modified).getTime();
            
            if (fileModifiedTime > lastCheckTime && !hasChanges) {
              const newContent = await invoke<string>('read_file', { path: filePath });
              
              if (newContent !== originalContent) {
                setFileChanged(true);
                if (!hasChanges) {
                  setContent(newContent);
                  setOriginalContent(newContent);
                  setFileChanged(false);
                  setLastCheckTime(Date.now());
                }
              }
            }
          }
        } catch (err) {
          console.debug('File check error:', err);
        }
      };
      
      // 每3秒检查一次文件变化
      fileCheckIntervalRef.current = setInterval(checkFileChanges, 3000);
    };
    
    setupFileWatcher();
    
    // 清理函数
    return () => {
      // 注销文件同步管理器监听器
      fileSyncManager.unregisterListener(listenerId, filePath);
      
      // 停止监听
      if (filePath) {
        const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
        invoke('unwatch_directory', { path: dirPath }).catch(console.error);
      }
      
      // 清理事件监听
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      
      // 清理轮询定时器
      if (fileCheckIntervalRef.current) {
        clearInterval(fileCheckIntervalRef.current);
      }
    };
  }, [filePath, hasChanges, lastCheckTime, originalContent, loadFile, t]);
  
  // 移除旧的轮询实现
  
  // 重新加载文件
  const reloadFile = useCallback(async () => {
    if (!filePath) return;
    
    if (hasChanges) {
      const shouldReload = window.confirm(t("fileEditor.reloadUnsavedConfirm"));
      if (!shouldReload) return;
    }

    await loadFile();
  }, [filePath, hasChanges, loadFile, t]);
  
  // 加载文件
  useEffect(() => {
    if (filePath) {
      loadFile();
    }
  }, [filePath]); // 移除 loadFile 依赖，避免循环
  
  // 计算诊断统计
  const diagnosticStats = {
    errors: diagnostics.filter(d => d.severity === 'error').length,
    warnings: diagnostics.filter(d => d.severity === 'warning').length,
    infos: diagnostics.filter(d => d.severity === 'info').length,
  };
  
  return (
    <div className={cn(
      "flex flex-col h-full bg-background",
      isFullscreen && "fixed inset-0 z-50",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <div className="flex items-center gap-3">
          <FileCode2 className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{fileName}</span>
            <span className="text-xs text-muted-foreground">({language})</span>
            {hasChanges && (
              <span className="text-xs px-1.5 py-0.5 bg-yellow-500/10 text-yellow-600 rounded">
                {t("app.modified")}
              </span>
            )}
            <AnimatePresence>
              {saved && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-xs px-1.5 py-0.5 bg-green-500/10 text-green-600 rounded flex items-center gap-1"
                >
                  <Check className="h-3 w-3" />
                  {t("app.saved")}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* 诊断信息 */}
          {showDiagnostics && diagnostics.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              {diagnosticStats.errors > 0 && (
                <span className="flex items-center gap-1 text-red-500">
                  <Bug className="h-3 w-3" />
                  {diagnosticStats.errors}
                </span>
              )}
              {diagnosticStats.warnings > 0 && (
                <span className="flex items-center gap-1 text-yellow-500">
                  <AlertTriangle className="h-3 w-3" />
                  {diagnosticStats.warnings}
                </span>
              )}
              {diagnosticStats.infos > 0 && (
                <span className="flex items-center gap-1 text-blue-500">
                  <Info className="h-3 w-3" />
                  {diagnosticStats.infos}
                </span>
              )}
            </div>
          )}
          
          {/* 自动保存指示器 */}
          {autoSave && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-xs text-green-500">
                    <Zap className="h-3 w-3" aria-hidden="true" />
                    {t("fileEditor.autoSaveShort")}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("fileEditor.autoSaveEnabled")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {/* 格式化按钮 */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleFormat}
                  aria-label={t("fileEditor.formatCode")}
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("fileEditor.formatCode")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* 功能信息按钮 */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" aria-label={t("fileEditor.info.editorTitle")}>
                  <Info className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-md p-4">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold mb-1">🎨 {t("fileEditor.info.syntaxTitle")}</h4>
                    <p className="text-xs text-muted-foreground">
                      {t("fileEditor.info.syntaxDesc", { languages: "JavaScript, TypeScript, Python, Java, C++, C#, Go, Rust, Ruby, PHP, Swift, Kotlin, Dart, Scala, R, MATLAB, SQL, HTML, CSS, JSON, XML, YAML, Markdown" })}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-1">🔧 {t("fileEditor.info.formatTitle")}</h4>
                    <p className="text-xs text-muted-foreground">
                      {t("fileEditor.info.formatShortcut", { shortcut: "Ctrl/Cmd + Shift + F" })}<br/>
                      {t("fileEditor.info.formatSupport", { list: "JS/TS (Prettier), Python (Black), Java, C/C++, Go (gofmt), Rust (rustfmt), HTML/CSS/JSON" })}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-1">💡 {t("fileEditor.info.intellisenseTitle")}</h4>
                    <p className="text-xs text-muted-foreground">
                      • {t("fileEditor.info.codeCompletion")}<br/>
                      • {t("fileEditor.info.parameterHints")}<br/>
                      • {t("fileEditor.info.hoverDocs")}<br/>
                      • {t("fileEditor.info.quickFixes")}<br/>
                      • {t("fileEditor.info.refactorings")}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-1">🔍 {t("fileEditor.info.diagnosticsTitle")}</h4>
                    <p className="text-xs text-muted-foreground">
                      {t("fileEditor.info.diagnosticsDesc")}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-1">⚙️ {t("fileEditor.info.editorTitle")}</h4>
                    <p className="text-xs text-muted-foreground">
                      • {t("fileEditor.info.lineNumbers")}<br/>
                      • {t("fileEditor.info.codeFolding")}<br/>
                      • {t("fileEditor.info.bracketMatching")}<br/>
                      • {t("fileEditor.info.multiCursor")}<br/>
                      • {t("fileEditor.info.columnSelection")}<br/>
                      • {t("fileEditor.info.minimapNav")}<br/>
                      • {t("fileEditor.info.stickyScroll")}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-1">⌨️ {t("fileEditor.info.shortcutsTitle")}</h4>
                    <p className="text-xs text-muted-foreground">
                      Ctrl/Cmd + S: {t("app.save")}<br/>
                      Ctrl/Cmd + Shift + F: {t("fileEditor.info.shortcutFormat")}<br/>
                      Ctrl/Cmd + F: {t("fileEditor.info.shortcutFind")}<br/>
                      Ctrl/Cmd + H: {t("fileEditor.info.shortcutReplace")}<br/>
                      Ctrl/Cmd + /: {t("fileEditor.info.shortcutComment")}<br/>
                      F11: {t("fileEditor.info.shortcutFullscreen")}<br/>
                      Alt + Shift + F: {t("fileEditor.info.shortcutFormatSelection")}
                    </p>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* 设置菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={t("fileEditor.editorSettings")}>
                <Settings2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme('vs-dark')}>
                {t("fileEditor.themeOption", { theme: "VS Dark" })}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('vs')}>
                {t("fileEditor.themeOption", { theme: "VS Light" })}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setFontSize(fontSize + 1)}>
                {t("fileEditor.increaseFontSize")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFontSize(fontSize - 1)}>
                {t("fileEditor.decreaseFontSize")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setMinimap(!minimap)}>
                {minimap ? t("fileEditor.hideMinimap") : t("fileEditor.showMinimap")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setWordWrap(wordWrap === 'on' ? 'off' : 'on')}>
                {wordWrap === 'on' ? t("fileEditor.disableWordWrap") : t("fileEditor.enableWordWrap")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowDiagnostics(!showDiagnostics)}>
                {showDiagnostics ? t("fileEditor.hideDiagnostics") : t("fileEditor.showDiagnostics")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setAutoSave(!autoSave)}>
                {autoSave ? t("fileEditor.disableAutoSave") : t("fileEditor.enableAutoSave")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* 文件外部修改提示 */}
          {fileChanged && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={reloadFile}
                    className="flex items-center gap-1 border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
                  >
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    {t("fileEditor.reload")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("fileEditor.reloadTooltip")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {/* 保存按钮 */}
          {hasChanges && (
            <Button
              variant="default"
              size="sm"
              onClick={saveFile}
              disabled={saving}
              aria-label={t("app.save")}
              aria-busy={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" aria-hidden="true" />
                  {t("app.save")}
                </>
              )}
            </Button>
          )}
          
          {/* 全屏按钮 */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleFullscreen}
                  className="h-7 w-7"
                  aria-label={isFullscreen ? t("fileEditor.exitFullscreen") : t("fileEditor.enterFullscreen")}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Maximize2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isFullscreen ? t("fileEditor.exitFullscreen") : t("fileEditor.enterFullscreen")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* 关闭按钮 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-7 w-7"
            aria-label={t("app.close")}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      
      {/* 诊断面板 */}
      {showDiagnostics && diagnostics.length > 0 && (
        <div className="max-h-32 overflow-y-auto border-b bg-muted/50 p-2">
          <div className="space-y-1">
            {diagnostics.map((diagnostic, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-start gap-2 text-xs p-1 rounded cursor-pointer hover:bg-background",
                  diagnostic.severity === 'error' && "text-red-500",
                  diagnostic.severity === 'warning' && "text-yellow-500",
                  diagnostic.severity === 'info' && "text-blue-500"
                )}
                onClick={() => {
                  // 跳转到错误位置
                  if (editorRef.current) {
                    editorRef.current.setPosition({
                      lineNumber: diagnostic.line,
                      column: diagnostic.column
                    });
                    editorRef.current.focus();
                  }
                }}
              >
                {diagnostic.severity === 'error' && <Bug className="h-3 w-3 mt-0.5" />}
                {diagnostic.severity === 'warning' && <AlertTriangle className="h-3 w-3 mt-0.5" />}
                {diagnostic.severity === 'info' && <Info className="h-3 w-3 mt-0.5" />}
                <span className="flex-1">
                  [{diagnostic.line}:{diagnostic.column}] {diagnostic.message}
                </span>
                {diagnostic.source && (
                  <span className="text-muted-foreground">({diagnostic.source})</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Editor */}
      {error ? (
        <div className="flex flex-col items-center justify-center flex-1 p-8">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <p className="text-lg font-medium mb-2">{t("app.error")}</p>
          <p className="text-sm text-muted-foreground text-center">{error}</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <Editor
            key={filePath}
            height="100%"
            language={language}
            path={filePath}
            value={content}
            onChange={handleContentChange}
            onMount={handleEditorDidMount}
            theme={theme}
            options={{
              readOnly: false,  // 确保编辑器可编辑
              fontSize: fontSize,
              minimap: { enabled: minimap },
              lineNumbers: "on",  // 显示行号
              lineNumbersMinChars: 5,  // 行号最小宽度，增加到 5 以确保显示
              renderLineHighlight: "all",  // 高亮当前行
              glyphMargin: true,  // 显示字形边距（用于断点等）
              wordWrap: wordWrap,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              insertSpaces: true,
              formatOnPaste: true,
              formatOnType: true,
              suggestOnTriggerCharacters: true,
              quickSuggestions: {
                other: true,
                comments: true,
                strings: true
              },
              parameterHints: { enabled: true },
              folding: true,
              foldingStrategy: 'indentation',
              showFoldingControls: 'always',
              bracketPairColorization: { enabled: true },
              guides: {
                indentation: true,
                bracketPairs: true,
              },
              stickyScroll: { enabled: true },
              inlineSuggest: { enabled: true },
              lightbulb: { enabled: "onCodeActionsChange" as any },
              hover: { enabled: true, delay: 300 },
              definitionLinkOpensInPeek: true,
              peekWidgetDefaultFocus: 'editor',
              // 确保回车键和其他基本编辑功能正常工作
              acceptSuggestionOnEnter: "off",  // 关闭回车接受建议，避免冲突
              autoClosingBrackets: "always",
              autoClosingQuotes: "always",
              autoIndent: "full",
              emptySelectionClipboard: false,  // 禁用空选择剪贴板
              copyWithSyntaxHighlighting: false,  // 禁用语法高亮复制
              multiCursorModifier: "alt",
              snippetSuggestions: "bottom",
              tabCompletion: "on",
              wordBasedSuggestions: "currentDocument",
              // 确保编辑器可以接收输入
              domReadOnly: false,
              readOnlyMessage: undefined,
              // 添加更多编辑器配置
              cursorBlinking: "blink",
              cursorSmoothCaretAnimation: "on",
              mouseWheelZoom: true,
              smoothScrolling: true,
            }}
          />
        </div>
      )}
      
      {/* 状态栏 */}
      <div className="flex items-center justify-between px-4 py-1 border-t text-xs text-muted-foreground bg-muted/30">
        <div className="flex items-center gap-4">
          <span>{language.toUpperCase()}</span>
          <span>UTF-8</span>
          <span>{t("fileEditor.cursorPosition", { line: cursorPosition.line, column: cursorPosition.column })}</span>
          <span>LF</span>
        </div>
        <div className="flex items-center gap-4">
          <span>{t("fileEditor.cursorPosition", { line: 1, column: 1 })}</span>
          <span>{t("fileEditor.indentSpaces", { size: 2 })}</span>
        </div>
      </div>
    </div>
  );
};

export default FileEditorEnhanced;