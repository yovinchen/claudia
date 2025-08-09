import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  Save,
  FileText,
  AlertCircle,
  Check,
  Edit3,
  Eye,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import Editor from "@monaco-editor/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FileViewerProps {
  filePath: string;
  isVisible: boolean;
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
    
    // Others
    dockerfile: "dockerfile",
    makefile: "makefile",
    cmake: "cmake",
    gradle: "gradle",
  };
  
  return languageMap[ext || ""] || "plaintext";
};

export const FileViewer: React.FC<FileViewerProps> = ({
  filePath,
  isVisible,
  onClose,
  className,
}) => {
  const { t } = useTranslation();
  const [content, setContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
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
  
  // 处理内容变化
  const handleContentChange = (value: string | undefined) => {
    if (value !== undefined) {
      setContent(value);
      setHasChanges(value !== originalContent);
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
  
  // 切换编辑模式
  const toggleEditMode = () => {
    setIsEditing(!isEditing);
  };
  
  // 快捷键处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S 保存
      if ((e.ctrlKey || e.metaKey) && e.key === "s" && isEditing && hasChanges) {
        e.preventDefault();
        saveFile();
      }
      // Esc 退出编辑模式
      if (e.key === "Escape" && isEditing) {
        setIsEditing(false);
      }
    };
    
    if (isVisible) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isVisible, isEditing, hasChanges, saveFile]);
  
  // 加载文件
  useEffect(() => {
    if (isVisible && filePath) {
      loadFile();
    }
  }, [isVisible, filePath, loadFile]);
  
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "fixed inset-0 z-50 flex items-center justify-center bg-black/50",
            className
          )}
          onClick={handleClose}
        >
          <motion.div
            className="relative w-[90%] h-[90%] max-w-6xl bg-background border rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold">{fileName}</h3>
                  <p className="text-xs text-muted-foreground">{filePath}</p>
                </div>
                {hasChanges && (
                  <span className="text-xs px-2 py-1 bg-yellow-500/10 text-yellow-600 rounded">
                    {t("app.modified")}
                  </span>
                )}
                {saved && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="text-xs px-2 py-1 bg-green-500/10 text-green-600 rounded flex items-center gap-1"
                  >
                    <Check className="h-3 w-3" />
                    {t("app.saved")}
                  </motion.span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleEditMode}
                        className={cn(isEditing && "text-primary")}
                      >
                        {isEditing ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <Edit3 className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{isEditing ? t("app.viewMode") : t("app.editMode")}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                {isEditing && hasChanges && (
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
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Content */}
            {error ? (
              <div className="flex flex-col items-center justify-center h-full p-8">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <p className="text-lg font-medium mb-2">{t("app.error")}</p>
                <p className="text-sm text-muted-foreground text-center">{error}</p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <div className="h-[calc(100%-73px)]">
                <Editor
                  height="100%"
                  language={language}
                  value={content}
                  onChange={handleContentChange}
                  theme="vs-dark"
                  options={{
                    readOnly: !isEditing,
                    fontSize: 14,
                    minimap: { enabled: false },
                    lineNumbers: "on",
                    rulers: [80, 120],
                    wordWrap: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    insertSpaces: true,
                    formatOnPaste: true,
                    formatOnType: true,
                  }}
                />
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FileViewer;