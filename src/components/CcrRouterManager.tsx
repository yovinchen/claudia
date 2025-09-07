import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Play, Square, RotateCcw, ExternalLink, Download, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Toast, ToastContainer } from "@/components/ui/toast";
import { ccrApi, type CcrServiceStatus } from "@/lib/api";
import { open } from '@tauri-apps/plugin-shell';

interface CcrRouterManagerProps {
  onBack: () => void;
}

export function CcrRouterManager({ onBack }: CcrRouterManagerProps) {
  const [serviceStatus, setServiceStatus] = useState<CcrServiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [configPath, setConfigPath] = useState<string>("");

  useEffect(() => {
    loadServiceStatus();
    loadConfigPath();
  }, []);

  const loadServiceStatus = async () => {
    try {
      setLoading(true);
      const status = await ccrApi.getServiceStatus();
      console.log("CCR service status:", status);
      console.log("CCR raw output:", status.raw_output);
      setServiceStatus(status);
    } catch (error) {
      console.error("Failed to load CCR service status:", error);
      setToast({ 
        message: `加载CCR服务状态失败: ${error}`, 
        type: "error" 
      });
    } finally {
      setLoading(false);
    }
  };

  const loadConfigPath = async () => {
    try {
      const path = await ccrApi.getConfigPath();
      setConfigPath(path);
    } catch (error) {
      console.error("Failed to get config path:", error);
    }
  };

  const handleStartService = async () => {
    try {
      setActionLoading(true);
      const result = await ccrApi.startService();
      setServiceStatus(result.status);
      setToast({ 
        message: result.message, 
        type: "success" 
      });
    } catch (error) {
      console.error("Failed to start CCR service:", error);
      setToast({ 
        message: `启动CCR服务失败: ${error}`, 
        type: "error" 
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopService = async () => {
    try {
      setActionLoading(true);
      const result = await ccrApi.stopService();
      setServiceStatus(result.status);
      setToast({ 
        message: result.message, 
        type: "success" 
      });
    } catch (error) {
      console.error("Failed to stop CCR service:", error);
      setToast({ 
        message: `停止CCR服务失败: ${error}`, 
        type: "error" 
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestartService = async () => {
    try {
      setActionLoading(true);
      const result = await ccrApi.restartService();
      setServiceStatus(result.status);
      setToast({ 
        message: result.message, 
        type: "success" 
      });
    } catch (error) {
      console.error("Failed to restart CCR service:", error);
      setToast({ 
        message: `重启CCR服务失败: ${error}`, 
        type: "error" 
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenUI = async () => {
    try {
      setActionLoading(true);
      
      // 如果服务未运行，先尝试启动
      if (!serviceStatus?.is_running) {
        setToast({ 
          message: "检测到服务未运行，正在启动...", 
          type: "info" 
        });
        const startResult = await ccrApi.startService();
        setServiceStatus(startResult.status);
        
        if (!startResult.status.is_running) {
          throw new Error("服务启动失败");
        }
        
        // 等待服务完全启动
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      await ccrApi.openUI();
      setToast({ 
        message: "正在打开CCR UI...", 
        type: "info" 
      });
      
      // 刷新服务状态
      setTimeout(() => {
        loadServiceStatus();
      }, 2000);
    } catch (error) {
      console.error("Failed to open CCR UI:", error);
      setToast({ 
        message: `打开CCR UI失败: ${error}`, 
        type: "error" 
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenInBrowser = async () => {
    try {
      // 如果服务未运行，先尝试启动
      if (!serviceStatus?.is_running) {
        setActionLoading(true);
        setToast({ 
          message: "检测到服务未运行，正在启动...", 
          type: "info" 
        });
        
        const startResult = await ccrApi.startService();
        setServiceStatus(startResult.status);
        
        if (!startResult.status.is_running) {
          throw new Error("服务启动失败");
        }
        
        // 等待服务完全启动
        await new Promise(resolve => setTimeout(resolve, 2000));
        setActionLoading(false);
      }
      
      if (serviceStatus?.endpoint) {
        open(`${serviceStatus.endpoint}/ui/`);
        setToast({ 
          message: "正在打开CCR管理界面...", 
          type: "info" 
        });
      }
    } catch (error) {
      console.error("Failed to open CCR UI in browser:", error);
      setToast({ 
        message: `打开管理界面失败: ${error}`, 
        type: "error" 
      });
      setActionLoading(false);
    }
  };

  const renderServiceStatus = () => {
    if (!serviceStatus) return null;

    const statusColor = serviceStatus.is_running ? "bg-green-500" : "bg-red-500";
    const statusText = serviceStatus.is_running ? "运行中" : "已停止";

    return (
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${statusColor}`}></div>
        <span className="font-medium">{statusText}</span>
        {serviceStatus.is_running && serviceStatus.port && (
          <Badge variant="secondary">端口 {serviceStatus.port}</Badge>
        )}
      </div>
    );
  };

  const renderInstallationStatus = () => {
    if (!serviceStatus) return null;

    return (
      <div className="flex items-center gap-2">
        {serviceStatus.has_ccr_binary ? (
          <>
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-green-600">已安装</span>
            {serviceStatus.ccr_version && (
              <Badge variant="outline">{serviceStatus.ccr_version}</Badge>
            )}
          </>
        ) : (
          <>
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-red-600">未安装</span>
          </>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="container mx-auto p-6 max-w-4xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">CCR 路由管理</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                管理 Claude Code Router 服务和配置
              </p>
            </div>
          </div>
        </motion.div>

        {/* Service Status Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-6"
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>服务状态</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadServiceStatus}
                  disabled={loading}
                >
                  刷新
                </Button>
              </CardTitle>
              <CardDescription>
                CCR 路由服务当前状态和控制选项
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">安装状态:</span>
                {renderInstallationStatus()}
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">服务状态:</span>
                {renderServiceStatus()}
              </div>

              {serviceStatus?.endpoint && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">服务地址:</span>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={handleOpenInBrowser}
                    className="p-0 h-auto"
                  >
                    {serviceStatus.endpoint}/ui/
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              )}

              {serviceStatus?.process_id && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">进程 ID:</span>
                  <Badge variant="outline">{serviceStatus.process_id}</Badge>
                </div>
              )}

              {configPath && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">配置文件:</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {configPath}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Control Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-6"
        >
          <Card>
            <CardHeader>
              <CardTitle>服务控制</CardTitle>
              <CardDescription>
                启动、停止或重启 CCR 路由服务
              </CardDescription>
            </CardHeader>
            <CardContent>
              {serviceStatus?.has_ccr_binary ? (
                <div className="flex gap-3 flex-wrap">
                  {!serviceStatus.is_running ? (
                    <Button
                      onClick={handleStartService}
                      disabled={actionLoading}
                      className="gap-2"
                    >
                      {actionLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      启动服务
                    </Button>
                  ) : (
                    <Button
                      onClick={handleStopService}
                      disabled={actionLoading}
                      variant="destructive"
                      className="gap-2"
                    >
                      {actionLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                      停止服务
                    </Button>
                  )}

                  <Button
                    onClick={handleRestartService}
                    disabled={actionLoading}
                    variant="outline"
                    className="gap-2"
                  >
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    重启服务
                  </Button>

                  <Button
                    onClick={handleOpenUI}
                    disabled={actionLoading}
                    className="gap-2"
                  >
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ExternalLink className="w-4 h-4" />
                    )}
                    {serviceStatus.is_running ? "打开管理界面" : "启动并打开管理界面"}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">CCR 未安装</h3>
                  <p className="text-muted-foreground mb-4">
                    需要先安装 Claude Code Router 才能使用此功能
                  </p>
                  <Button
                    onClick={() => open("https://github.com/musistudio/claude-code-router/tree/main")}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    安装 CCR
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Information Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>关于 CCR 路由</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Claude Code Router (CCR) 是一个强大的路由工具，允许您将 Claude Code 请求转发到不同的 LLM 提供商。
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>支持多个 LLM 提供商（OpenRouter、DeepSeek、Gemini 等）</li>
                <li>智能路由规则，根据令牌数量和请求类型自动选择</li>
                <li>Web UI 管理界面，方便配置和监控</li>
                <li>无需 Anthropic 账户即可使用 Claude Code</li>
              </ul>
              
              {!serviceStatus?.has_ccr_binary && (
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                    安装说明：
                  </p>
                  <code className="block p-2 bg-black/5 dark:bg-white/5 rounded text-xs">
                    npm install -g @musistudio/claude-code-router
                  </code>
                  <p className="text-xs mt-2 text-muted-foreground">
                    或访问 <a 
                      href="#" 
                      onClick={(e) => {
                        e.preventDefault();
                        open("https://github.com/musistudio/claude-code-router/tree/main");
                      }}
                      className="text-blue-600 hover:underline"
                    >
                      GitHub 仓库
                    </a> 了解更多安装方式
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Toast Container */}
      <ToastContainer>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        )}
      </ToastContainer>
    </div>
  );
}