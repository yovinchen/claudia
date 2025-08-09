import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  Save,
  FileText,
  AlertCircle,
  Check,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import Editor from "@monaco-editor/react";
import { motion, AnimatePresence } from "framer-motion";

interface FileEditorProps {
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

export const FileEditor: React.FC<FileEditorProps> = ({
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
  
  // 快捷键处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S 保存
      if ((e.ctrlKey || e.metaKey) && e.key === "s" && hasChanges) {
        e.preventDefault();
        saveFile();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasChanges, saveFile]);
  
  // 加载文件
  useEffect(() => {
    if (filePath) {
      loadFile();
    }
  }, [filePath, loadFile]);
  
  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
        <div className="flex items-center gap-3">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{fileName}</span>
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
            theme="vs-dark"
            options={{
              fontSize: 14,
              minimap: { enabled: true },
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
    </div>
  );
};

export default FileEditor;