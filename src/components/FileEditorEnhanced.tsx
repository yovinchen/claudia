import React, { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
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
  
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const fileName = filePath.split("/").pop() || filePath;
  const language = getLanguageFromPath(filePath);
  
  // 加载文件内容
  const loadFile = useCallback(async () => {
    if (!filePath) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const fileContent = await invoke<string>("read_file", {
        path: filePath,
      });
      
      setContent(fileContent);
      setOriginalContent(fileContent);
      setHasChanges(false);
    } catch (err) {
      console.error("Failed to load file:", err);
      setError(err instanceof Error ? err.message : "Failed to load file");
    } finally {
      setLoading(false);
    }
  }, [filePath]);
  
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
      
      // 显示保存成功提示
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save file:", err);
      setError(err instanceof Error ? err.message : "Failed to save file");
    } finally {
      setSaving(false);
    }
  }, [filePath, content, hasChanges]);
  
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
  const handleContentChange = (value: string | undefined) => {
    if (value !== undefined) {
      setContent(value);
      setHasChanges(value !== originalContent);
      
      // 触发语法检查
      if (editorRef.current && (language === 'typescript' || language === 'javascript')) {
        validateCode(value);
      }
    }
  };
  
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
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // 监听光标位置变化
    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition({
        line: e.position.lineNumber,
        column: e.position.column
      });
    });
    
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
    
    // 设置快捷键
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveFile();
    });
    
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
      handleFormat();
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
      // Ctrl/Cmd + S 保存
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveFile();
      }
      
      // Ctrl/Cmd + Shift + F 格式化
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        handleFormat();
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
  
  // 加载文件
  useEffect(() => {
    if (filePath) {
      loadFile();
    }
  }, [filePath, loadFile]);
  
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
                    <Zap className="h-3 w-3" />
                    Auto
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>自动保存已启用</p>
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
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>格式化代码 (Alt+Shift+F)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* 功能信息按钮 */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Info className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-md p-4">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-semibold mb-1">🎨 语法高亮支持</h4>
                    <p className="text-xs text-muted-foreground">
                      JavaScript, TypeScript, Python, Java, C++, C#, Go, Rust, Ruby, PHP, Swift, Kotlin, Dart, Scala, R, MATLAB, SQL, HTML, CSS, JSON, XML, YAML, Markdown 等 40+ 语言
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-1">🔧 代码格式化</h4>
                    <p className="text-xs text-muted-foreground">
                      快捷键: Ctrl/Cmd + Shift + F<br/>
                      支持: JS/TS (Prettier), Python (Black), Java, C/C++, Go (gofmt), Rust (rustfmt), HTML/CSS/JSON
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-1">💡 智能提示</h4>
                    <p className="text-xs text-muted-foreground">
                      • 代码补全 (IntelliSense)<br/>
                      • 参数提示<br/>
                      • 悬浮文档<br/>
                      • 快速修复建议<br/>
                      • 重构建议
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-1">🔍 错误检查</h4>
                    <p className="text-xs text-muted-foreground">
                      实时语法检查、类型检查 (TypeScript/Flow)、Linting (ESLint/TSLint)
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-1">⚙️ 编辑器功能</h4>
                    <p className="text-xs text-muted-foreground">
                      • 行号显示<br/>
                      • 代码折叠<br/>
                      • 括号匹配高亮<br/>
                      • 多光标编辑<br/>
                      • 列选择 (Alt + 鼠标)<br/>
                      • 小地图导航<br/>
                      • Sticky Scroll (固定显示上下文)
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-1">⌨️ 快捷键</h4>
                    <p className="text-xs text-muted-foreground">
                      Ctrl/Cmd + S: 保存<br/>
                      Ctrl/Cmd + Shift + F: 格式化<br/>
                      Ctrl/Cmd + F: 查找<br/>
                      Ctrl/Cmd + H: 替换<br/>
                      Ctrl/Cmd + /: 注释<br/>
                      F11: 全屏<br/>
                      Alt + Shift + F: 格式化选中代码
                    </p>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* 设置菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <Settings2 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme('vs-dark')}>
                主题: VS Dark
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme('vs')}>
                主题: VS Light
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setFontSize(fontSize + 1)}>
                字体放大
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFontSize(fontSize - 1)}>
                字体缩小
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setMinimap(!minimap)}>
                {minimap ? '隐藏' : '显示'}小地图
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setWordWrap(wordWrap === 'on' ? 'off' : 'on')}>
                {wordWrap === 'on' ? '关闭' : '开启'}自动换行
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowDiagnostics(!showDiagnostics)}>
                {showDiagnostics ? '隐藏' : '显示'}诊断信息
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setAutoSave(!autoSave)}>
                {autoSave ? '关闭' : '开启'}自动保存
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* 保存按钮 */}
          {hasChanges && (
            <Button
              variant="default"
              size="sm"
              onClick={saveFile}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
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
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isFullscreen ? '退出全屏 (Esc)' : '全屏 (F11)'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* 关闭按钮 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="h-7 w-7"
          >
            <X className="h-4 w-4" />
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
            height="100%"
            language={language}
            value={content}
            onChange={handleContentChange}
            onMount={handleEditorDidMount}
            theme={theme}
            options={{
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
              quickSuggestions: true,
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
            }}
          />
        </div>
      )}
      
      {/* 状态栏 */}
      <div className="flex items-center justify-between px-4 py-1 border-t text-xs text-muted-foreground bg-muted/30">
        <div className="flex items-center gap-4">
          <span>{language.toUpperCase()}</span>
          <span>UTF-8</span>
          <span>行 {cursorPosition.line}, 列 {cursorPosition.column}</span>
          <span>LF</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Ln 1, Col 1</span>
          <span>Spaces: 2</span>
        </div>
      </div>
    </div>
  );
};

export default FileEditorEnhanced;