import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Play, Square, RotateCcw, ExternalLink, Download, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Toast, ToastContainer } from "@/components/ui/toast";
import { ccrApi, type CcrServiceStatus } from "@/lib/api";
import { open } from '@tauri-apps/plugin-shell';
import { useTranslation } from '@/hooks/useTranslation';
import { Trans } from 'react-i18next';

interface CcrRouterManagerProps {
  onBack: () => void;
}

export function CcrRouterManager({ onBack }: CcrRouterManagerProps) {
  const { t } = useTranslation();
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
        message: t('ccr.loadStatusFailed', { error: String(error) }), 
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
        message: t('ccr.startFailed', { error: String(error) }), 
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
        message: t('ccr.stopFailed', { error: String(error) }), 
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
        message: t('ccr.restartFailed', { error: String(error) }), 
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
          message: t('ccr.serviceStarting'), 
          type: "info" 
        });
        const startResult = await ccrApi.startService();
        setServiceStatus(startResult.status);
        
        if (!startResult.status.is_running) {
          throw new Error(t('ccr.serviceStartFailed'));
        }
        
        // 等待服务完全启动
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      await ccrApi.openUI();
      setToast({ 
        message: t('ccr.openingUI'), 
        type: "info" 
      });
      
      // 刷新服务状态
      setTimeout(() => {
        loadServiceStatus();
      }, 2000);
    } catch (error) {
      console.error("Failed to open CCR UI:", error);
      setToast({ 
        message: t('ccr.openUIFailed', { error: String(error) }), 
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
          message: t('ccr.serviceStarting'), 
          type: "info" 
        });
        
        const startResult = await ccrApi.startService();
        setServiceStatus(startResult.status);
        
        if (!startResult.status.is_running) {
          throw new Error(t('ccr.serviceStartFailed'));
        }
        
        // 等待服务完全启动
        await new Promise(resolve => setTimeout(resolve, 2000));
        setActionLoading(false);
      }
      
      if (serviceStatus?.endpoint) {
        open(`${serviceStatus.endpoint}/ui/`);
        setToast({ 
          message: t('ccr.openingAdmin'), 
          type: "info" 
        });
      }
    } catch (error) {
      console.error("Failed to open CCR UI in browser:", error);
      setToast({ 
        message: t('ccr.openAdminFailed', { error: String(error) }), 
        type: "error" 
      });
      setActionLoading(false);
    }
  };

  const renderServiceStatus = () => {
    if (!serviceStatus) return null;

    const statusColor = serviceStatus.is_running ? "bg-green-500" : "bg-red-500";
    const statusText = serviceStatus.is_running ? t('ccr.running') : t('ccr.stopped');

    return (
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${statusColor}`} aria-hidden="true"></div>
        <span className="font-medium">{statusText}</span>
        {serviceStatus.is_running && serviceStatus.port && (
          <Badge variant="secondary">{t('ccr.port', { port: serviceStatus.port })}</Badge>
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
            <CheckCircle className="w-4 h-4 text-green-500" aria-hidden="true" />
            <span className="text-green-600">{t('ccr.installed')}</span>
            {serviceStatus.ccr_version && (
              <Badge variant="outline">{serviceStatus.ccr_version}</Badge>
            )}
          </>
        ) : (
          <>
            <AlertCircle className="w-4 h-4 text-red-500" aria-hidden="true" />
            <span className="text-red-600">{t('ccr.notInstalled')}</span>
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
            <Button variant="ghost" size="sm" onClick={onBack} aria-label={t('app.back')}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{t('ccr.title')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('ccr.subtitle')}
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
                <span>{t('ccr.serviceStatus')}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadServiceStatus}
                  disabled={loading}
                >
                  {t('app.refresh')}
                </Button>
              </CardTitle>
              <CardDescription>
                {t('ccr.serviceStatusDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('ccr.installStatusLabel')}</span>
                {renderInstallationStatus()}
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('ccr.serviceStatusLabel')}</span>
                {renderServiceStatus()}
              </div>

              {serviceStatus?.endpoint && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('ccr.endpointLabel')}</span>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={handleOpenInBrowser}
                    className="p-0 h-auto"
                  >
                    {serviceStatus.endpoint}/ui/
                    <ExternalLink className="w-3 h-3 ml-1" aria-hidden="true" />
                  </Button>
                </div>
              )}

              {serviceStatus?.process_id && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('ccr.processIdLabel')}</span>
                  <Badge variant="outline">{serviceStatus.process_id}</Badge>
                </div>
              )}

              {configPath && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('ccr.configFileLabel')}</span>
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
              <CardTitle>{t('ccr.serviceControl')}</CardTitle>
              <CardDescription>
                {t('ccr.serviceControlDesc')}
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
                      {t('ccr.startService')}
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
                      {t('ccr.stopService')}
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
                    {t('ccr.restartService')}
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
                    {serviceStatus.is_running ? t('ccr.openAdmin') : t('ccr.startAndOpenAdmin')}
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">{t('ccr.notInstalledTitle')}</h3>
                  <p className="text-muted-foreground mb-4">
                    {t('ccr.notInstalledDesc')}
                  </p>
                  <Button
                    onClick={() => open("https://github.com/musistudio/claude-code-router/tree/main")}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    {t('ccr.installCcr')}
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
              <CardTitle>{t('ccr.aboutTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                {t('ccr.aboutDesc')}
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>{t('ccr.featureProviders')}</li>
                <li>{t('ccr.featureRouting')}</li>
                <li>{t('ccr.featureWebUi')}</li>
                <li>{t('ccr.featureNoAccount')}</li>
              </ul>
              
              {!serviceStatus?.has_ccr_binary && (
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
                    {t('ccr.installInstructions')}
                  </p>
                  <code className="block p-2 bg-black/5 dark:bg-white/5 rounded text-xs">
                    npm install -g @musistudio/claude-code-router
                  </code>
                  <p className="text-xs mt-2 text-muted-foreground">
                    <Trans
                      i18nKey="ccr.installMoreInfo"
                      components={{
                        link: (
                          <a
                            href="#" 
                            onClick={(e) => {
                              e.preventDefault();
                              open("https://github.com/musistudio/claude-code-router/tree/main");
                            }}
                            className="text-blue-600 hover:underline"
                          />
                        ),
                      }}
                    />
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