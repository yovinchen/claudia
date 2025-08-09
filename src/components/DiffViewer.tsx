import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  FileDiff,
  AlertCircle,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DiffViewerProps {
  projectPath: string;
  filePath: string;
  staged?: boolean;
  isVisible: boolean;
  onClose: () => void;
  className?: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  projectPath,
  filePath,
  staged = false,
  isVisible,
  onClose,
  className,
}) => {
  const { t } = useTranslation();
  const [diffContent, setDiffContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffStats, setDiffStats] = useState<{ additions: number; deletions: number }>({ additions: 0, deletions: 0 });
  
  const fileName = filePath.split("/").pop() || filePath;
  
  // 加载差异内容
  const loadDiff = useCallback(async () => {
    if (!filePath || !projectPath) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const diff = await invoke<string>("get_git_diff", {
        path: projectPath,
        filePath: filePath,
        staged: staged
      });
      
      setDiffContent(diff || "No changes");
      
      // 计算差异统计
      const lines = diff.split('\n');
      let additions = 0;
      let deletions = 0;
      lines.forEach(line => {
        if (line.startsWith('+') && !line.startsWith('+++')) additions++;
        if (line.startsWith('-') && !line.startsWith('---')) deletions++;
      });
      setDiffStats({ additions, deletions });
    } catch (err) {
      console.error("Failed to load diff:", err);
      setError(err instanceof Error ? err.message : "Failed to load diff");
    } finally {
      setLoading(false);
    }
  }, [filePath, projectPath, staged]);
  
  // 处理关闭
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);
  
  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Esc 关闭
      if (e.key === "Escape") {
        handleClose();
      }
    };
    
    if (isVisible) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isVisible, handleClose]);
  
  // 加载差异
  useEffect(() => {
    if (isVisible && filePath && projectPath) {
      loadDiff();
    }
  }, [isVisible, filePath, projectPath, loadDiff]);
  
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
            <div className="flex items-center justify-between p-4 border-b bg-muted/30">
              <div className="flex items-center gap-3">
                <FileDiff className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold">{fileName}</h3>
                  <p className="text-xs text-muted-foreground font-mono">{filePath}</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {staged ? "Staged" : "Modified"}
                </Badge>
                {(diffStats.additions > 0 || diffStats.deletions > 0) && (
                  <>
                    <div className="w-px h-5 bg-border" />
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        +{diffStats.additions}
                      </span>
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        -{diffStats.deletions}
                      </span>
                    </div>
                  </>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleClose}
                        className="h-8 w-8"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t("app.close")}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
              <ScrollArea className="h-[calc(100%-73px)]">
                <div className="p-6">
                  <div className="rounded-md border bg-card/50 overflow-hidden">
                    <pre className="text-sm font-mono leading-relaxed p-4">
                      {diffContent.split('\n').map((line, index) => {
                        let className = "block px-3 py-0.5 -mx-3 ";
                        let lineContent = line;
                        
                        if (line.startsWith('+') && !line.startsWith('+++')) {
                          className += "bg-green-500/10 text-green-600 dark:text-green-400 border-l-4 border-green-500";
                          lineContent = line.substring(1);
                        } else if (line.startsWith('-') && !line.startsWith('---')) {
                          className += "bg-red-500/10 text-red-600 dark:text-red-400 border-l-4 border-red-500";
                          lineContent = line.substring(1);
                        } else if (line.startsWith('@@')) {
                          className += "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold my-2 py-1 rounded";
                        } else if (line.startsWith('diff --git')) {
                          className += "text-primary font-bold mt-6 mb-2 pt-4 border-t-2 border-border";
                          if (index > 0) className += " mt-8";
                        } else if (line.startsWith('index ') || line.startsWith('+++') || line.startsWith('---')) {
                          className += "text-muted-foreground text-xs italic opacity-70";
                        } else {
                          className += "text-foreground/80 hover:bg-muted/30 transition-colors";
                          // 移除行首空格（如果存在）
                          if (line.startsWith(' ')) {
                            lineContent = line.substring(1);
                          }
                        }
                        
                        return (
                          <span key={index} className={className}>
                            {lineContent || ' '}
                          </span>
                        );
                      })}
                    </pre>
                  </div>
                </div>
              </ScrollArea>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DiffViewer;