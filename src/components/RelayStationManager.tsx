import React, { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import MonacoEditor from '@monaco-editor/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/hooks/useTranslation';
import { Toast, ToastContainer } from "@/components/ui/toast";
import {
  RelayStation,
  CreateRelayStationRequest,
  UpdateRelayStationRequest,
  RelayStationAdapter,
  AuthMethod,
  PackycodeUserQuota,
  api
} from '@/lib/api';
import {
  Plus,
  Edit,
  Trash2,
  Globe,
  Server,
  ArrowLeft,
  Settings,
  RefreshCw,
  ExternalLink,
  Eye,
  Edit3,
  Save,
  X
} from 'lucide-react';

interface RelayStationManagerProps {
  onBack: () => void;
}

const RelayStationManager: React.FC<RelayStationManagerProps> = ({ onBack }) => {
  const [stations, setStations] = useState<RelayStation[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStation, setSelectedStation] = useState<RelayStation | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [stationToDelete, setStationToDelete] = useState<RelayStation | null>(null);
  const [togglingEnable, setTogglingEnable] = useState<Record<string, boolean>>({});
  const [currentConfig, setCurrentConfig] = useState<Record<string, string | null>>({});
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [jsonConfigView, setJsonConfigView] = useState(false);
  const [editingConfig, setEditingConfig] = useState(false);
  const [configJson, setConfigJson] = useState<string>('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [flushingDns, setFlushingDns] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // PackyCode 额度相关状态
  const [quotaData, setQuotaData] = useState<Record<string, PackycodeUserQuota>>({});
  const [loadingQuota, setLoadingQuota] = useState<Record<string, boolean>>({});

  const { t } = useTranslation();

  // Token 脱敏函数
  const maskToken = (token: string): string => {
    if (!token || token.length <= 8) {
      return '*'.repeat(token?.length || 0);
    }
    const start = token.substring(0, 4);
    const end = token.substring(token.length - 4);
    const middleLength = Math.max(token.length - 8, 8);
    return `${start}${'*'.repeat(middleLength)}${end}`;
  };

  // 显示Toast
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
  };

  // 加载中转站列表
  const loadStations = async () => {
    try {
      setLoading(true);
      const stationList = await api.relayStationsList();
      setStations(stationList);
    } catch (error) {
      console.error('Failed to load stations:', error);
      showToast(t('relayStation.loadFailed'), "error");
    } finally {
      setLoading(false);
    }
  };

  // 加载当前配置状态
  const loadCurrentConfig = async () => {
    try {
      setLoadingConfig(true);
      // 读取完整的 ~/.claude/settings.json 文件
      const settings = await api.getClaudeSettings();

      // 保存配置用于简单视图显示
      setCurrentConfig({
        api_url: settings.env?.ANTHROPIC_BASE_URL || '',
        api_token: settings.env?.ANTHROPIC_AUTH_TOKEN || ''
      });

      // 格式化完整的JSON字符串
      setConfigJson(JSON.stringify(settings, null, 2));
    } catch (error) {
      console.error('Failed to load current config:', error);
      // 如果失败，尝试获取中转站配置
      try {
        const config = await api.relayStationGetCurrentConfig();
        setCurrentConfig(config);
        setConfigJson(JSON.stringify(config, null, 2));
      } catch (fallbackError) {
        console.error('Failed to load fallback config:', fallbackError);
      }
    } finally {
      setLoadingConfig(false);
    }
  };

  // 手动同步配置
  const syncConfig = async () => {
    try {
      const result = await api.relayStationSyncConfig();
      showToast(result, "success");
      loadCurrentConfig();
    } catch (error) {
      console.error('Failed to sync config:', error);
      showToast(t('relayStation.syncFailed'), "error");
    }
  };

  // 保存JSON配置
  const saveJsonConfig = async () => {
    try {
      setSavingConfig(true);
      // 验证JSON格式
      const parsedConfig = JSON.parse(configJson);

      // 保存配置到 ~/.claude/settings.json
      await api.saveClaudeSettings(parsedConfig);

      showToast(t('relayStation.configSaved'), "success");
      setEditingConfig(false);
      loadCurrentConfig();
    } catch (error) {
      if (error instanceof SyntaxError) {
        showToast(t('relayStation.invalidJson'), "error");
      } else {
        console.error('Failed to save config:', error);
        showToast(t('relayStation.saveFailed'), "error");
      }
    } finally {
      setSavingConfig(false);
    }
  };

  // 刷新 DNS 缓存
  const handleFlushDns = async () => {
    try {
      setFlushingDns(true);
      await api.flushDns();
      showToast(t('relayStation.flushDnsSuccess'), 'success');
    } catch (error) {
      console.error('Failed to flush DNS:', error);
      showToast(t('relayStation.flushDnsFailed'), 'error');
    } finally {
      setFlushingDns(false);
    }
  };


  // 查询 PackyCode 额度
  const fetchPackycodeQuota = async (stationId: string) => {
    try {
      setLoadingQuota(prev => ({ ...prev, [stationId]: true }));
      const quota = await api.getPackycodeUserQuota(stationId);
      setQuotaData(prev => ({ ...prev, [stationId]: quota }));
    } catch (error) {
      console.error('Failed to fetch PackyCode quota:', error);
      // 不显示错误 Toast，因为可能是出租车服务或 Token 无效
    } finally {
      setLoadingQuota(prev => ({ ...prev, [stationId]: false }));
    }
  };

  // 删除中转站
  const deleteStation = async () => {
    if (!stationToDelete) return;

    try {
      await api.relayStationDelete(stationToDelete.id);
      loadStations();
      setShowDeleteDialog(false);
      setStationToDelete(null);
      showToast(t('relayStation.deleteSuccess'), "success");
    } catch (error) {
      console.error('Failed to delete station:', error);
      showToast(t('relayStation.deleteFailed'), "error");
    }
  };

  // 打开删除确认对话框
  const openDeleteDialog = (station: RelayStation) => {
    setStationToDelete(station);
    setShowDeleteDialog(true);
  };

  // 获取适配器类型显示名称
  const getAdapterDisplayName = (adapter: RelayStationAdapter): string => {
    switch (adapter) {
      case 'packycode': return 'PackyCode';
      case 'deepseek': return 'DeepSeek v3.1';
      case 'glm': return '智谱GLM';
      case 'qwen': return '千问Qwen';
      case 'kimi': return 'Kimi k2';
      case 'custom': return t('relayStation.custom');
      default: return adapter;
    }
  };

  // 切换启用状态
  const toggleEnableStatus = async (stationId: string, currentEnabled: boolean) => {
    try {
      setTogglingEnable(prev => ({ ...prev, [stationId]: true }));
      const newEnabled = !currentEnabled;
      await api.relayStationToggleEnable(stationId, newEnabled);
      showToast(newEnabled ? t('relayStation.enabledSuccess') : t('relayStation.disabledSuccess'), "success");
      loadStations();
      loadCurrentConfig(); // 重新加载配置状态
    } catch (error) {
      console.error('Failed to toggle enable status:', error);
      showToast(t('relayStation.toggleEnableFailed'), "error");
    } finally {
      setTogglingEnable(prev => ({ ...prev, [stationId]: false }));
    }
  };

  // 获取状态样式
  const getStatusBadge = (station: RelayStation) => {
    const enabled = station.enabled;
    const isToggling = togglingEnable[station.id];

    return (
      <div className="flex items-center gap-2">
        <Switch
          checked={enabled}
          disabled={isToggling}
          onCheckedChange={() => toggleEnableStatus(station.id, enabled)}
          className="data-[state=checked]:bg-green-500"
        />
        {isToggling ? (
          <Badge variant="secondary" className="animate-pulse">{t('common.updating')}</Badge>
        ) : enabled ? (
          <Badge variant="default" className="bg-green-500">{t('status.enabled')}</Badge>
        ) : (
          <Badge variant="secondary">{t('status.disabled')}</Badge>
        )}
      </div>
    );
  };

  useEffect(() => {
    loadStations();
    loadCurrentConfig();
  }, []);

  // 当中转站加载完成后，自动获取所有 PackyCode 站点的额度
  useEffect(() => {
    stations.forEach(station => {
      if (station.adapter === 'packycode') {
        fetchPackycodeQuota(station.id);
      }
    });
  }, [stations]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('app.back')}
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{t('navigation.relayStations')}</h1>
            <p className="text-muted-foreground">{t('relayStation.description')}</p>
          </div>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t('relayStation.create')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
            <CreateStationDialog
              onSuccess={() => {
                setShowCreateDialog(false);
                loadStations();
                showToast(t('relayStation.createSuccess'), "success");
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* 当前配置状态 */}
      <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-lg">{t('relayStation.currentConfig')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {jsonConfigView ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center mb-2">
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setJsonConfigView(false);
                      setEditingConfig(false);
                    }}
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    {t('common.back')}
                  </Button>
                </div>
                <div className="flex gap-2">
                  {!editingConfig ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingConfig(true)}
                    >
                      <Edit3 className="h-4 w-4 mr-1" />
                      {t('common.edit')}
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingConfig(false);
                          setConfigJson(JSON.stringify(currentConfig, null, 2));
                        }}
                      >
                        <X className="h-4 w-4 mr-1" />
                        {t('common.cancel')}
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={saveJsonConfig}
                        disabled={savingConfig}
                      >
                        {savingConfig ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white mr-1" />
                        ) : (
                          <Save className="h-4 w-4 mr-1" />
                        )}
                        {t('common.save')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="border rounded-lg overflow-hidden" style={{ height: '400px' }}>
                <MonacoEditor
                  language="json"
                  theme="vs-dark"
                  value={configJson}
                  onChange={(value) => setConfigJson(value || '')}
                  options={{
                    readOnly: !editingConfig,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 12,
                    wordWrap: 'on',
                    formatOnPaste: true,
                    formatOnType: true,
                    automaticLayout: true,
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex gap-4">
              {/* 左侧数据展示 */}
              <div className="flex-1 space-y-2">
                <div className="text-sm font-medium mb-2">{t('relayStation.configPreview')}</div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground min-w-[80px]">API URL:</span>
                    <span className="font-mono text-xs break-all">
                      {currentConfig.api_url || t('relayStation.notConfigured')}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-muted-foreground min-w-[80px]">API Token:</span>
                    <span className="font-mono text-xs">
                      {currentConfig.api_token ? maskToken(currentConfig.api_token) : t('relayStation.notConfigured')}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {t('relayStation.configLocation')}: ~/.claude/settings.json
                  </div>
                </div>
              </div>

              {/* 右侧按钮区域 */}
              <div className="flex flex-col gap-2 min-w-[100px]">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    loadCurrentConfig();
                    syncConfig();
                  }}
                  disabled={loadingConfig}
                  className="w-full h-9 justify-start"
                >
                  {loadingConfig ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  <span className="text-xs">{t('relayStation.syncConfig')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFlushDns}
                  disabled={flushingDns}
                  className="w-full h-9 justify-start"
                >
                  {flushingDns ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  <span className="text-xs">{t('relayStation.flushDns')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setJsonConfigView(true)}
                  className="w-full h-9 justify-start"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  <span className="text-xs">{t('relayStation.viewJson')}</span>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 中转站列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">{t('common.loading')}</p>
          </div>
        ) : stations.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Server className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('relayStation.noStations')}</h3>
            <p className="text-muted-foreground mb-4">{t('relayStation.noStationsDesc')}</p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('relayStation.createFirst')}
            </Button>
          </div>
        ) : (
          stations.map((station) => (
            <Card key={station.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{station.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {getAdapterDisplayName(station.adapter)}
                    </CardDescription>
                  </div>
                  {getStatusBadge(station)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Globe className="mr-2 h-4 w-4" />
                    {station.api_url}
                  </div>

                  {station.description && (
                    <p className="text-sm text-muted-foreground">
                      {station.description}
                    </p>
                  )}

                  {/* PackyCode 额度显示 */}
                  {station.adapter === 'packycode' && (
                    <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
                      {loadingQuota[station.id] ? (
                        <div className="flex items-center justify-center py-2">
                          <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600"></div>
                          <span className="ml-2 text-sm text-muted-foreground">加载额度中...</span>
                        </div>
                      ) : quotaData[station.id] ? (
                        <div className="space-y-3">
                          {/* 用户信息和计划 */}
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              {quotaData[station.id].username && (
                                <span className="text-muted-foreground">{quotaData[station.id].username}</span>
                              )}
                              <Badge variant="secondary" className="text-xs">
                                {quotaData[station.id].plan_type.toUpperCase()}
                              </Badge>
                              {quotaData[station.id].opus_enabled && (
                                <Badge variant="default" className="text-xs bg-purple-600">
                                  Opus
                                </Badge>
                              )}
                            </div>
                            {quotaData[station.id].plan_expires_at && (
                              <span className="text-muted-foreground">
                                到期: {new Date(quotaData[station.id].plan_expires_at!).toLocaleDateString()}
                              </span>
                            )}
                          </div>

                          {/* 账户余额 */}
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">账户余额:</span>
                            <span className="font-semibold text-blue-600">
                              ${Number(quotaData[station.id].balance_usd).toFixed(2)}
                            </span>
                          </div>

                          {/* 日额度 */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">日额度:</span>
                              <div className="flex items-center gap-2">
                                {(() => {
                                  const daily_spent = Number(quotaData[station.id].daily_spent_usd);
                                  const daily_budget = Number(quotaData[station.id].daily_budget_usd);
                                  return (
                                    <>
                                      <span className={daily_spent > daily_budget * 0.8 ? 'text-orange-600' : 'text-green-600'}>
                                        ${daily_spent.toFixed(2)}
                                      </span>
                                      <span className="text-muted-foreground">/</span>
                                      <span className="text-muted-foreground">${daily_budget.toFixed(2)}</span>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                            <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  (() => {
                                    const daily_spent = Number(quotaData[station.id].daily_spent_usd);
                                    const daily_budget = Number(quotaData[station.id].daily_budget_usd);
                                    return daily_spent / daily_budget > 0.8;
                                  })() ? 'bg-orange-500' : 'bg-green-500'
                                }`}
                                style={{ width: `${Math.min(
                                  (() => {
                                    const daily_spent = Number(quotaData[station.id].daily_spent_usd);
                                    const daily_budget = Number(quotaData[station.id].daily_budget_usd);
                                    return (daily_spent / daily_budget) * 100;
                                  })(), 100)}%` }}
                              />
                            </div>
                          </div>

                          {/* 月额度 */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">月额度:</span>
                              <div className="flex items-center gap-2">
                                {(() => {
                                  const monthly_spent = Number(quotaData[station.id].monthly_spent_usd);
                                  const monthly_budget = Number(quotaData[station.id].monthly_budget_usd);
                                  return (
                                    <>
                                      <span className={monthly_spent > monthly_budget * 0.8 ? 'text-orange-600' : 'text-green-600'}>
                                        ${monthly_spent.toFixed(2)}
                                      </span>
                                      <span className="text-muted-foreground">/</span>
                                      <span className="text-muted-foreground">${monthly_budget.toFixed(2)}</span>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                            <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  (() => {
                                    const monthly_spent = Number(quotaData[station.id].monthly_spent_usd);
                                    const monthly_budget = Number(quotaData[station.id].monthly_budget_usd);
                                    return monthly_spent / monthly_budget > 0.8;
                                  })() ? 'bg-orange-500' : 'bg-green-500'
                                }`}
                                style={{ width: `${Math.min(
                                  (() => {
                                    const monthly_spent = Number(quotaData[station.id].monthly_spent_usd);
                                    const monthly_budget = Number(quotaData[station.id].monthly_budget_usd);
                                    return (monthly_spent / monthly_budget) * 100;
                                  })(), 100)}%` }}
                              />
                            </div>
                          </div>

                          {/* 总消费 */}
                          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                            <span>总消费: ${Number(quotaData[station.id].total_spent_usd).toFixed(2)}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                fetchPackycodeQuota(station.id);
                              }}
                            >
                              刷新
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              fetchPackycodeQuota(station.id);
                            }}
                          >
                            查询额度
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStation(station);
                          setShowEditDialog(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteDialog(station);
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 编辑对话框 */}
      {selectedStation && (
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
            <EditStationDialog
              station={selectedStation}
              onSuccess={() => {
                setShowEditDialog(false);
                setSelectedStation(null);
                loadStations();
                showToast(t('relayStation.updateSuccess'), "success");
              }}
              onCancel={() => {
                setShowEditDialog(false);
                setSelectedStation(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('relayStation.confirmDeleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('relayStation.deleteConfirm')}
              {stationToDelete && (
                <div className="mt-2 p-2 bg-muted rounded">
                  <strong>{stationToDelete.name}</strong>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setStationToDelete(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={deleteStation}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast 容器 */}
      {toast && (
        <ToastContainer>
          <Toast
            message={toast.message}
            type={toast.type}
            duration={3000}
            onDismiss={() => setToast(null)}
          />
        </ToastContainer>
      )}
    </div>
  );
};

// 创建中转站对话框组件
const CreateStationDialog: React.FC<{
  onSuccess: () => void;
}> = ({ onSuccess }) => {
  const [formData, setFormData] = useState<CreateRelayStationRequest>({
    name: '',
    description: '',
    api_url: '',
    adapter: 'packycode',  // 默认使用 PackyCode
    auth_method: 'api_key', // PackyCode 默认使用 API Key
    system_token: '',
    user_id: '',
    enabled: false,  // 默认不启用，需要通过主界面切换
  });
  const [submitting, setSubmitting] = useState(false);
  const [formToast, setFormToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [packycodeService, setPackycodeService] = useState<string>('bus'); // 默认公交车
  const [packycodeNode, setPackycodeNode] = useState<string>('https://api.packycode.com'); // 默认节点（公交车用）
  const [packycodeTaxiNode, setPackycodeTaxiNode] = useState<string>('https://share-api.packycode.com'); // 滴滴车节点

  // 测速弹出框状态
  const [showSpeedTestModal, setShowSpeedTestModal] = useState(false);
  const [speedTestResults, setSpeedTestResults] = useState<{ url: string; name: string; responseTime: number | null; status: 'testing' | 'success' | 'failed' }[]>([]);
  const [speedTestInProgress, setSpeedTestInProgress] = useState(false);

  const { t } = useTranslation();

  // 获取API Key获取地址
  const getApiKeyUrl = (adapter: string, service?: string): string | null => {
    switch (adapter) {
      case 'deepseek':
        return 'https://platform.deepseek.com/api_keys';
      case 'glm':
        return 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys';
      case 'qwen':
        return 'https://bailian.console.aliyun.com/?tab=model#/api-key';
      case 'kimi':
        return 'https://platform.moonshot.cn/console/api-keys';
      case 'packycode':
        if (service === 'taxi') {
          return 'https://share.packycode.com/api-management';
        }
        return 'https://www.packycode.com/api-management';
      default:
        return null;
    }
  };

  // 打开外部链接
  const openExternalLink = async (url: string) => {
    try {
      await open(url);
    } catch (error) {
      console.error('Failed to open URL:', error);
    }
  };

  // 通用测速函数
  const performSpeedTest = async (nodes: { url: string; name: string }[], onComplete: (bestNode: { url: string; name: string }) => void) => {
    setShowSpeedTestModal(true);
    setSpeedTestInProgress(true);

    // 初始化测速结果
    const initialResults = nodes.map(node => ({
      url: node.url,
      name: node.name,
      responseTime: null,
      status: 'testing' as const
    }));
    setSpeedTestResults(initialResults);

    let bestNode = nodes[0];
    let minTime = Infinity;

    // 并行测试所有节点
    const testPromises = nodes.map(async (node, index) => {
      try {
        const startTime = Date.now();
        await fetch(node.url, {
          method: 'HEAD',
          mode: 'no-cors'
        });
        const responseTime = Date.now() - startTime;

        // 更新单个节点的测试结果
        setSpeedTestResults(prev => prev.map((result, i) =>
          i === index ? { ...result, responseTime, status: 'success' } : result
        ));

        if (responseTime < minTime) {
          minTime = responseTime;
          bestNode = node;
        }

        return { node, responseTime };
      } catch (error) {
        console.log(`Node ${node.url} failed:`, error);
        // 标记节点为失败
        setSpeedTestResults(prev => prev.map((result, i) =>
          i === index ? { ...result, responseTime: null, status: 'failed' } : result
        ));
        return { node, responseTime: null };
      }
    });

    try {
      await Promise.all(testPromises);
      // 测试完成后等待2秒让用户看到结果
      setTimeout(() => {
        setSpeedTestInProgress(false);
        onComplete(bestNode);
        // 再等1秒后关闭弹框
        setTimeout(() => {
          setShowSpeedTestModal(false);
        }, 1000);
      }, 2000);
    } catch (error) {
      console.error('Speed test failed:', error);
      setSpeedTestInProgress(false);
      setTimeout(() => {
        setShowSpeedTestModal(false);
      }, 1000);
    }
  };

  // 当适配器改变时更新认证方式和 URL
  useEffect(() => {
    if (formData.adapter === 'packycode') {
      setFormData(prev => ({
        ...prev,
        auth_method: 'api_key' // PackyCode 固定使用 API Key
      }));
    } else if (formData.adapter === 'custom') {
      setFormData(prev => ({
        ...prev,
        auth_method: 'custom'
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        auth_method: 'bearer_token'
      }));
    }
  }, [formData.adapter]);

  // 自动填充中转站名称
  const fillStationName = (serviceType: string) => {
    const serviceName = serviceType === 'taxi' ? t('relayStation.taxiService') : t('relayStation.busService');
    const newName = `PackyCode ${serviceName}`;

    // 当选择PackyCode服务类型时，始终更新名称
    setFormData(prev => ({
      ...prev,
      name: newName
    }));
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.adapter === 'custom' && !formData.name.trim()) {
      setFormToast({ message: t('relayStation.nameRequired'), type: "error" });
      return;
    }

    if (!formData.api_url.trim()) {
      setFormToast({ message: t('relayStation.apiUrlRequired'), type: "error" });
      return;
    }

    if (!formData.system_token.trim()) {
      setFormToast({ message: t('relayStation.tokenRequired'), type: "error" });
      return;
    }

    try {
      setSubmitting(true);
      await api.relayStationCreate(formData);
      onSuccess();
    } catch (error) {
      console.error('Failed to create station:', error);
      setFormToast({ message: t('relayStation.createFailed'), type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('relayStation.createTitle')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-6">

          <div className="col-span-2 space-y-2">
            <Label className="text-sm font-medium">{t('relayStation.adapterType')}</Label>
            <div className="grid grid-cols-4 gap-2">
              {/* 第一行：主流适配器 */}
              <Button
                type="button"
                variant={formData.adapter === 'packycode' ? 'default' : 'outline'}
                className={`p-3 h-auto flex flex-col items-center space-y-1 transition-all ${
                  formData.adapter === 'packycode'
                    ? 'bg-blue-600 hover:bg-blue-700 text-white border-2 border-blue-700'
                    : 'hover:bg-blue-50 dark:hover:bg-blue-950 border-2 border-transparent'
                }`}
                onClick={() => setFormData(prev => ({
                  ...prev,
                  adapter: 'packycode',
                  name: 'PackyCode',
                  api_url: 'https://api.packycode.com'
                }))}
              >
                <div className="text-xl">📦</div>
                <div className="text-center">
                  <div className="font-semibold text-sm">PackyCode</div>
                  <div className="text-xs opacity-80 mt-1">推荐使用</div>
                </div>
              </Button>

              <Button
                type="button"
                variant={formData.adapter === 'deepseek' ? 'default' : 'outline'}
                className={`p-3 h-auto flex flex-col items-center space-y-1 transition-all ${
                  formData.adapter === 'deepseek'
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-2 border-indigo-700'
                    : 'hover:bg-indigo-50 dark:hover:bg-indigo-950 border-2 border-transparent'
                }`}
                onClick={() => setFormData(prev => ({
                  ...prev,
                  adapter: 'deepseek',
                  name: 'DeepSeek v3.1',
                  api_url: 'https://api.deepseek.com/anthropic'
                }))}
              >
                <div className="text-xl">🚀</div>
                <div className="text-center">
                  <div className="font-semibold text-sm">DeepSeek</div>
                  <div className="text-xs opacity-80 mt-1">v3.1</div>
                </div>
              </Button>

              <Button
                type="button"
                variant={formData.adapter === 'glm' ? 'default' : 'outline'}
                className={`p-3 h-auto flex flex-col items-center space-y-1 transition-all ${
                  formData.adapter === 'glm'
                    ? 'bg-cyan-600 hover:bg-cyan-700 text-white border-2 border-cyan-700'
                    : 'hover:bg-cyan-50 dark:hover:bg-cyan-950 border-2 border-transparent'
                }`}
                onClick={() => setFormData(prev => ({
                  ...prev,
                  adapter: 'glm',
                  name: '智谱GLM',
                  api_url: 'https://open.bigmodel.cn/api/anthropic'
                }))}
              >
                <div className="text-xl">🤖</div>
                <div className="text-center">
                  <div className="font-semibold text-sm">智谱GLM</div>
                  <div className="text-xs opacity-80 mt-1">清华智谱</div>
                </div>
              </Button>

              {/* 第二行：更多适配器 */}
              <Button
                type="button"
                variant={formData.adapter === 'qwen' ? 'default' : 'outline'}
                className={`p-3 h-auto flex flex-col items-center space-y-1 transition-all ${
                  formData.adapter === 'qwen'
                    ? 'bg-amber-600 hover:bg-amber-700 text-white border-2 border-amber-700'
                    : 'hover:bg-amber-50 dark:hover:bg-amber-950 border-2 border-transparent'
                }`}
                onClick={() => setFormData(prev => ({
                  ...prev,
                  adapter: 'qwen',
                  name: '千问Qwen',
                  api_url: 'https://dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy'
                }))}
              >
                <div className="text-xl">🎯</div>
                <div className="text-center">
                  <div className="font-semibold text-sm">千问Qwen</div>
                  <div className="text-xs opacity-80 mt-1">阿里通义</div>
                </div>
              </Button>

              <Button
                type="button"
                variant={formData.adapter === 'kimi' ? 'default' : 'outline'}
                className={`p-3 h-auto flex flex-col items-center space-y-1 transition-all ${
                  formData.adapter === 'kimi'
                    ? 'bg-violet-600 hover:bg-violet-700 text-white border-2 border-violet-700'
                    : 'hover:bg-violet-50 dark:hover:bg-violet-950 border-2 border-transparent'
                }`}
                onClick={() => setFormData(prev => ({
                  ...prev,
                  adapter: 'kimi',
                  name: 'Kimi k2',
                  api_url: 'https://api.moonshot.cn/anthropic'
                }))}
              >
                <div className="text-xl">🌙</div>
                <div className="text-center">
                  <div className="font-semibold text-sm">Kimi k2</div>
                  <div className="text-xs opacity-80 mt-1">月之暗面</div>
                </div>
              </Button>


              <Button
                type="button"
                variant={formData.adapter === 'custom' ? 'default' : 'outline'}
                className={`p-3 h-auto flex flex-col items-center space-y-1 transition-all ${
                  formData.adapter === 'custom'
                    ? 'bg-gray-600 hover:bg-gray-700 text-white border-2 border-gray-700'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-950 border-2 border-transparent'
                }`}
                onClick={() => setFormData(prev => ({ ...prev, adapter: 'custom' }))}
              >
                <div className="text-xl">⚙️</div>
                <div className="text-center">
                  <div className="font-semibold text-sm">{t('relayStation.custom')}</div>
                  <div className="text-xs opacity-80 mt-1">自定义</div>
                </div>
              </Button>
            </div>
          </div>
        </div>

        {/* 仅在选择 Custom 时显示名称输入框 */}
        {formData.adapter === 'custom' && (
          <div className="space-y-2">
            <Label htmlFor="custom-name">{t('relayStation.name')} *</Label>
            <Input
              id="custom-name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder={t('relayStation.namePlaceholder')}
              className="w-full"
            />
          </div>
        )}

        {formData.adapter === 'packycode' && (
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">{t('relayStation.serviceType')}</Label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={packycodeService === 'taxi' ? 'default' : 'outline'}
                  className={`p-3 h-auto flex flex-col items-center space-y-1 transition-all ${
                    packycodeService === 'taxi' 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                      : 'hover:bg-blue-50 dark:hover:bg-blue-950'
                  }`}
                  onClick={() => {
                    setPackycodeService('taxi');
                    fillStationName('taxi');
                    setFormData(prev => ({ ...prev, api_url: packycodeTaxiNode }));
                  }}
                >
                  <div className="text-xl">🚗</div>
                  <div className="text-center">
                    <div className="font-semibold text-sm">{t('relayStation.taxiService')}</div>
                    <div className="text-xs opacity-80 mt-1">{t('relayStation.taxiServiceDesc')}</div>
                  </div>
                </Button>

                <Button
                  type="button"
                  variant={packycodeService === 'bus' ? 'default' : 'outline'}
                  className={`p-3 h-auto flex flex-col items-center space-y-1 transition-all ${
                    packycodeService === 'bus' 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : 'hover:bg-green-50 dark:hover:bg-green-950'
                  }`}
                  onClick={() => {
                    setPackycodeService('bus');
                    fillStationName('bus');
                    setFormData(prev => ({ ...prev, api_url: packycodeNode }));
                  }}
                >
                  <div className="text-xl">🚌</div>
                  <div className="text-center">
                    <div className="font-semibold text-sm">{t('relayStation.busService')}</div>
                    <div className="text-xs opacity-80 mt-1">{t('relayStation.busServiceDesc')}</div>
                  </div>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {packycodeService === 'taxi'
                  ? t('relayStation.taxiServiceNote')
                  : t('relayStation.busServiceNote')
                }
              </p>
            </div>
          </div>
        )}

        {formData.adapter === 'packycode' && packycodeService === 'bus' && (
          <div className="space-y-2">
            <Label>{t('relayStation.nodeSelection')}</Label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select
                    value={packycodeNode}
                    onValueChange={(value: string) => {
                      setPackycodeNode(value);
                      setFormData(prev => ({ ...prev, api_url: value }));
                    }}
                  >
                  <SelectTrigger>
                    <SelectValue placeholder={t('relayStation.selectNode')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="https://api.packycode.com">
                      🚌 直连1（默认公交车）
                    </SelectItem>
                    <SelectItem value="https://api-hk-cn2.packycode.com">
                      🇭🇰 直连2 (HK-CN2)
                    </SelectItem>
                    <SelectItem value="https://api-us-cmin2.packycode.com">
                      🇺🇸 直连3 (US-CMIN2)
                    </SelectItem>
                    <SelectItem value="https://api-us-4837.packycode.com">
                      🇺🇸 直连4 (US-4837)
                    </SelectItem>
                    <SelectItem value="https://api-us-cn2.packycode.com">
                      🔄 备用1 (US-CN2)
                    </SelectItem>
                    <SelectItem value="https://api-cf-pro.packycode.com">
                      ☁️ 备用2 (CF-Pro)
                    </SelectItem>
                    <SelectItem value="https://api-test.packyme.com" disabled>
                      ⚠️ 测试1（非紧急勿用）
                    </SelectItem>
                    <SelectItem value="https://api-test-custom.packycode.com" disabled>
                      ⚠️ 测试2（非紧急勿用）
                    </SelectItem>
                    <SelectItem value="https://api-tmp-test.dzz.ai" disabled>
                      ⚠️ 测试3（非紧急勿用）
                    </SelectItem>
                  </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const busNodes = [
                      { url: "https://api.packycode.com", name: "🚌 直连1（默认公交车）" },
                      { url: "https://api-hk-cn2.packycode.com", name: "🇭🇰 直连2 (HK-CN2)" },
                      { url: "https://api-us-cmin2.packycode.com", name: "🇺🇸 直连3 (US-CMIN2)" },
                      { url: "https://api-us-4837.packycode.com", name: "🇺🇸 直连4 (US-4837)" },
                      { url: "https://api-us-cn2.packycode.com", name: "🔄 备用1 (US-CN2)" },
                      { url: "https://api-cf-pro.packycode.com", name: "☁️ 备用2 (CF-Pro)" }
                    ];

                    await performSpeedTest(busNodes, (bestNode) => {
                      setPackycodeNode(bestNode.url);
                    });
                  }}
                >
                  自动选择
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                {t('relayStation.selectedNode') + ': ' + packycodeNode}
              </p>
            </div>
          </div>
        )}

        {formData.adapter === 'packycode' && packycodeService === 'taxi' && (
          <div className="space-y-2">
            <Label>{t('relayStation.nodeSelection')}</Label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select
                    value={packycodeTaxiNode}
                    onValueChange={(value: string) => {
                      setPackycodeTaxiNode(value);
                      setFormData(prev => ({ ...prev, api_url: value }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('relayStation.selectNode')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="https://share-api.packycode.com">
                        🚗 直连1（默认滴滴车）
                      </SelectItem>
                      <SelectItem value="https://share-api-cf-pro.packycode.com">
                        ☁️ 备用1 (CF-Pro)
                      </SelectItem>
                      <SelectItem value="https://share-api-hk-cn2.packycode.com">
                        🇭🇰 备用2 (HK-CN2)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const taxiNodes = [
                      { url: "https://share-api.packycode.com", name: "🚗 直连1（默认滴滴车）" },
                      { url: "https://share-api-cf-pro.packycode.com", name: "☁️ 备用1 (CF-Pro)" },
                      { url: "https://share-api-hk-cn2.packycode.com", name: "🇭🇰 备用2 (HK-CN2)" }
                    ];

                    await performSpeedTest(taxiNodes, (bestNode) => {
                      setPackycodeTaxiNode(bestNode.url);
                    });
                  }}
                >
                  自动选择
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                {t('relayStation.selectedNode') + ': ' + packycodeTaxiNode}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="description">{t('relayStation.description')}</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder={t('relayStation.descriptionPlaceholder')}
            rows={2}
            className="w-full resize-none"
          />
        </div>

        {formData.adapter !== 'packycode' && (
          <div className="space-y-2">
            <Label htmlFor="api_url">{t('relayStation.apiUrl')}</Label>
            <Input
              id="api_url"
              type="url"
              value={formData.api_url}
              onChange={(e) => setFormData(prev => ({ ...prev, api_url: e.target.value }))}
              placeholder="https://api.example.com"
              className="w-full"
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-6">
          {formData.adapter === 'packycode' ? (
            // PackyCode 固定使用 API Key，不显示选择器
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="system_token">{t('relayStation.systemToken')} *</Label>
                {getApiKeyUrl(formData.adapter, packycodeService) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={async () => {
                      const url = getApiKeyUrl(formData.adapter, packycodeService);
                      if (url) await openExternalLink(url);
                    }}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    {t('relayStation.getApiKey')}
                  </Button>
                )}
              </div>
              <Input
                id="system_token"
                type="password"
                value={formData.system_token}
                onChange={(e) => setFormData(prev => ({ ...prev, system_token: e.target.value }))}
                placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {t('relayStation.packycodeTokenNote')}
              </p>
            </div>
          ) : (
            // 其他适配器显示认证方式选择
            <>
              <div className="space-y-2">
                <Label htmlFor="auth_method">{t('relayStation.authMethod')}</Label>
                <Select
                  value={formData.auth_method}
                  onValueChange={(value: AuthMethod) =>
                    setFormData(prev => ({ ...prev, auth_method: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bearer_token">Bearer Token</SelectItem>
                    <SelectItem value="api_key">API Key</SelectItem>
                    <SelectItem value="custom">{t('relayStation.custom')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="system_token">{t('relayStation.systemToken')} *</Label>
                  {getApiKeyUrl(formData.adapter) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={async () => {
                        const url = getApiKeyUrl(formData.adapter);
                        if (url) await openExternalLink(url);
                      }}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      {t('relayStation.getApiKey')}
                    </Button>
                  )}
                </div>
                <Input
                  id="system_token"
                  type="password"
                  value={formData.system_token}
                  onChange={(e) => setFormData(prev => ({ ...prev, system_token: e.target.value }))}
                  placeholder={t('relayStation.tokenPlaceholder')}
                  className="w-full font-mono text-sm"
                />
              </div>
            </>
          )}
        </div>



        <div className="flex justify-end space-x-3 pt-3">
          <Button type="button" variant="outline" onClick={() => {}}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            className="min-w-[120px]"
          >
            {submitting && <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>}
            {t('common.create')}
          </Button>
        </div>
      </form>

      {/* Form Toast */}
      {formToast && (
        <Toast
          message={formToast.message}
          type={formToast.type}
          duration={3000}
          onDismiss={() => setFormToast(null)}
        />
      )}

      {/* 测速弹出框 */}
      <Dialog open={showSpeedTestModal} onOpenChange={setShowSpeedTestModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('relayStation.speedTest')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {speedTestInProgress ? t('relayStation.testingNodes') : t('relayStation.testCompleted')}
            </div>
            <div className="space-y-3">
              {speedTestResults.map((result, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-medium">{result.name}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.status === 'testing' && (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600"></div>
                        <span className="text-sm text-blue-600">{t('relayStation.testing')}</span>
                      </>
                    )}
                    {result.status === 'success' && (
                      <>
                        <div className="h-2 w-2 rounded-full bg-green-500"></div>
                        <span className="text-sm text-green-600">{result.responseTime}ms</span>
                      </>
                    )}
                    {result.status === 'failed' && (
                      <>
                        <div className="h-2 w-2 rounded-full bg-red-500"></div>
                        <span className="text-sm text-red-600">{t('relayStation.failed')}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!speedTestInProgress && speedTestResults.length > 0 && (
              <div className="pt-2 text-center">
                <div className="text-sm text-green-600">
                  {t('relayStation.bestNodeSelected')}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// 编辑中转站对话框组件
const EditStationDialog: React.FC<{
  station: RelayStation;
  onSuccess: () => void;
  onCancel: () => void;
}> = ({ station, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState<UpdateRelayStationRequest>({
    id: station.id,
    name: station.name,
    description: station.description || '',
    api_url: station.api_url,
    adapter: station.adapter,
    auth_method: station.auth_method,
    system_token: station.system_token,
    user_id: station.user_id || '',
    enabled: station.enabled,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formToast, setFormToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // PackyCode 特定状态
  const [packycodeService, setPackycodeService] = useState<string>(() => {
    // 从API URL判断服务类型
    if (station.adapter === 'packycode' && station.api_url.includes('share-api')) {
      return 'taxi';
    }
    return 'bus';
  });
  const [packycodeNode, setPackycodeNode] = useState<string>(() => {
    // 如果是PackyCode，使用当前的API URL
    if (station.adapter === 'packycode') {
      return station.api_url;
    }
    return 'https://api.packycode.com';
  });
  
  const [showSpeedTestModal, setShowSpeedTestModal] = useState(false);
  const [speedTestResults, setSpeedTestResults] = useState<{ url: string; name: string; responseTime: number | null; status: 'testing' | 'success' | 'failed' }[]>([]);
  const [speedTestInProgress, setSpeedTestInProgress] = useState(false);

  const { t } = useTranslation();

  // 获取API Key获取地址
  const getApiKeyUrl = (adapter: string, service?: string): string | null => {
    switch (adapter) {
      case 'deepseek':
        return 'https://platform.deepseek.com/api_keys';
      case 'glm':
        return 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys';
      case 'qwen':
        return 'https://bailian.console.aliyun.com/?tab=model#/api-key';
      case 'kimi':
        return 'https://platform.moonshot.cn/console/api-keys';
      case 'packycode':
        if (service === 'taxi') {
          return 'https://share.packycode.com/api-management';
        }
        return 'https://www.packycode.com/api-management';
      default:
        return null;
    }
  };

  // 打开外部链接
  const openExternalLink = async (url: string) => {
    try {
      await open(url);
    } catch (error) {
      console.error('Failed to open URL:', error);
    }
  };

  // 通用测速函数
  const performSpeedTest = async (nodes: { url: string; name: string }[], onComplete: (bestNode: { url: string; name: string }) => void) => {
    setShowSpeedTestModal(true);
    setSpeedTestInProgress(true);

    // 初始化测速结果
    const initialResults = nodes.map(node => ({
      url: node.url,
      name: node.name,
      responseTime: null,
      status: 'testing' as const
    }));
    setSpeedTestResults(initialResults);

    let bestNode = nodes[0];
    let minTime = Infinity;

    // 并行测试所有节点
    const testPromises = nodes.map(async (node, index) => {
      try {
        const startTime = Date.now();
        await fetch(node.url, {
          method: 'HEAD',
          mode: 'no-cors'
        });
        const responseTime = Date.now() - startTime;

        // 更新单个节点的测试结果
        setSpeedTestResults(prev => prev.map((result, i) =>
          i === index ? { ...result, responseTime, status: 'success' } : result
        ));

        if (responseTime < minTime) {
          minTime = responseTime;
          bestNode = node;
        }

        return { node, responseTime };
      } catch (error) {
        console.log(`Node ${node.url} failed:`, error);
        // 标记节点为失败
        setSpeedTestResults(prev => prev.map((result, i) =>
          i === index ? { ...result, responseTime: null, status: 'failed' } : result
        ));
        return { node, responseTime: null };
      }
    });

    try {
      await Promise.all(testPromises);
      // 测试完成后等待2秒让用户看到结果
      setTimeout(() => {
        setSpeedTestInProgress(false);
        onComplete(bestNode);
        // 再等1秒后关闭弹框
        setTimeout(() => {
          setShowSpeedTestModal(false);
        }, 1000);
      }, 2000);
    } catch (error) {
      console.error('Speed test failed:', error);
      setSpeedTestInProgress(false);
      setTimeout(() => {
        setShowSpeedTestModal(false);
      }, 1000);
    }
  };

  // 当适配器改变时更新认证方式和 URL
  useEffect(() => {
    if (formData.adapter === 'packycode') {
      setFormData(prev => ({
        ...prev,
        auth_method: 'api_key' // PackyCode 固定使用 API Key
      }));
    } else if (formData.adapter === 'custom') {
      setFormData(prev => ({
        ...prev,
        auth_method: 'custom'
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        auth_method: 'bearer_token'
      }));
    }
  }, [formData.adapter]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.adapter === 'custom' && !formData.name.trim()) {
      setFormToast({ message: t('relayStation.nameRequired'), type: "error" });
      return;
    }

    if (!formData.api_url.trim()) {
      setFormToast({ message: t('relayStation.apiUrlRequired'), type: "error" });
      return;
    }

    if (!formData.system_token.trim()) {
      setFormToast({ message: t('relayStation.tokenRequired'), type: "error" });
      return;
    }

    try {
      setSubmitting(true);
      await api.relayStationUpdate(formData);
      onSuccess();
    } catch (error) {
      console.error('Failed to update station:', error);
      setFormToast({ message: t('relayStation.updateFailed'), type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('relayStation.editTitle')}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-6">
          <div className="col-span-2 space-y-2">
            <Label className="text-sm font-medium">{t('relayStation.adapterType')}</Label>
            <div className="grid grid-cols-4 gap-2">
              {/* 第一行：主流适配器 */}
              <Button
                type="button"
                variant={formData.adapter === 'packycode' ? 'default' : 'outline'}
                className={`p-3 h-auto flex flex-col items-center space-y-1 transition-all ${
                  formData.adapter === 'packycode'
                    ? 'bg-blue-600 hover:bg-blue-700 text-white border-2 border-blue-700'
                    : 'hover:bg-blue-50 dark:hover:bg-blue-950 border-2 border-transparent'
                }`}
                onClick={() => setFormData(prev => ({
                  ...prev,
                  adapter: 'packycode',
                  name: 'PackyCode',
                  api_url: 'https://api.packycode.com'
                }))}
              >
                <div className="text-xl">📦</div>
                <div className="text-center">
                  <div className="font-semibold text-sm">PackyCode</div>
                  <div className="text-xs opacity-80 mt-1">推荐使用</div>
                </div>
              </Button>

              <Button
                type="button"
                variant={formData.adapter === 'deepseek' ? 'default' : 'outline'}
                className={`p-3 h-auto flex flex-col items-center space-y-1 transition-all ${
                  formData.adapter === 'deepseek'
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-2 border-indigo-700'
                    : 'hover:bg-indigo-50 dark:hover:bg-indigo-950 border-2 border-transparent'
                }`}
                onClick={() => setFormData(prev => ({
                  ...prev,
                  adapter: 'deepseek',
                  name: 'DeepSeek v3.1',
                  api_url: 'https://api.deepseek.com/anthropic'
                }))}
              >
                <div className="text-xl">🚀</div>
                <div className="text-center">
                  <div className="font-semibold text-sm">DeepSeek</div>
                  <div className="text-xs opacity-80 mt-1">v3.1</div>
                </div>
              </Button>

              <Button
                type="button"
                variant={formData.adapter === 'glm' ? 'default' : 'outline'}
                className={`p-3 h-auto flex flex-col items-center space-y-1 transition-all ${
                  formData.adapter === 'glm'
                    ? 'bg-cyan-600 hover:bg-cyan-700 text-white border-2 border-cyan-700'
                    : 'hover:bg-cyan-50 dark:hover:bg-cyan-950 border-2 border-transparent'
                }`}
                onClick={() => setFormData(prev => ({
                  ...prev,
                  adapter: 'glm',
                  name: '智谱GLM',
                  api_url: 'https://open.bigmodel.cn/api/anthropic'
                }))}
              >
                <div className="text-xl">🤖</div>
                <div className="text-center">
                  <div className="font-semibold text-sm">智谱GLM</div>
                  <div className="text-xs opacity-80 mt-1">清华智谱</div>
                </div>
              </Button>

              {/* 第二行：更多适配器 */}
              <Button
                type="button"
                variant={formData.adapter === 'qwen' ? 'default' : 'outline'}
                className={`p-3 h-auto flex flex-col items-center space-y-1 transition-all ${
                  formData.adapter === 'qwen'
                    ? 'bg-amber-600 hover:bg-amber-700 text-white border-2 border-amber-700'
                    : 'hover:bg-amber-50 dark:hover:bg-amber-950 border-2 border-transparent'
                }`}
                onClick={() => setFormData(prev => ({
                  ...prev,
                  adapter: 'qwen',
                  name: '千问Qwen',
                  api_url: 'https://dashscope.aliyuncs.com/api/v2/apps/claude-code-proxy'
                }))}
              >
                <div className="text-xl">🎯</div>
                <div className="text-center">
                  <div className="font-semibold text-sm">千问Qwen</div>
                  <div className="text-xs opacity-80 mt-1">阿里通义</div>
                </div>
              </Button>

              <Button
                type="button"
                variant={formData.adapter === 'kimi' ? 'default' : 'outline'}
                className={`p-3 h-auto flex flex-col items-center space-y-1 transition-all ${
                  formData.adapter === 'kimi'
                    ? 'bg-violet-600 hover:bg-violet-700 text-white border-2 border-violet-700'
                    : 'hover:bg-violet-50 dark:hover:bg-violet-950 border-2 border-transparent'
                }`}
                onClick={() => setFormData(prev => ({
                  ...prev,
                  adapter: 'kimi',
                  name: 'Kimi k2',
                  api_url: 'https://api.moonshot.cn/anthropic'
                }))}
              >
                <div className="text-xl">🌙</div>
                <div className="text-center">
                  <div className="font-semibold text-sm">Kimi k2</div>
                  <div className="text-xs opacity-80 mt-1">月之暗面</div>
                </div>
              </Button>


              <Button
                type="button"
                variant={formData.adapter === 'custom' ? 'default' : 'outline'}
                className={`p-3 h-auto flex flex-col items-center space-y-1 transition-all ${
                  formData.adapter === 'custom'
                    ? 'bg-gray-600 hover:bg-gray-700 text-white border-2 border-gray-700'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-950 border-2 border-transparent'
                }`}
                onClick={() => setFormData(prev => ({ ...prev, adapter: 'custom' }))}
              >
                <div className="text-xl">⚙️</div>
                <div className="text-center">
                  <div className="font-semibold text-sm">{t('relayStation.custom')}</div>
                  <div className="text-xs opacity-80 mt-1">自定义</div>
                </div>
              </Button>
            </div>
          </div>
        </div>

        {/* 仅在选择 Custom 时显示名称输入框 */}
        {formData.adapter === 'custom' && (
          <div className="space-y-2">
            <Label htmlFor="custom-name">{t('relayStation.name')} *</Label>
            <Input
              id="custom-name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder={t('relayStation.namePlaceholder')}
              className="w-full"
            />
          </div>
        )}

        {formData.adapter === 'packycode' && (
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">{t('relayStation.serviceType')}</Label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={packycodeService === 'taxi' ? 'default' : 'outline'}
                  className={`p-3 h-auto flex flex-col items-center space-y-1 transition-all ${
                    packycodeService === 'taxi' 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                      : 'hover:bg-blue-50 dark:hover:bg-blue-950'
                  }`}
                  onClick={() => {
                    setPackycodeService('taxi');
                    setFormData(prev => ({
                      ...prev,
                      api_url: 'https://share-api.packycode.com'
                    }));
                  }}
                >
                  <div className="text-xl">🚗</div>
                  <div className="text-center">
                    <div className="font-semibold text-sm">{t('relayStation.taxiService')}</div>
                    <div className="text-xs opacity-80 mt-1">{t('relayStation.taxiServiceDesc')}</div>
                  </div>
                </Button>

                <Button
                  type="button"
                  variant={packycodeService === 'bus' ? 'default' : 'outline'}
                  className={`p-3 h-auto flex flex-col items-center space-y-1 transition-all ${
                    packycodeService === 'bus' 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : 'hover:bg-green-50 dark:hover:bg-green-950'
                  }`}
                  onClick={() => {
                    setPackycodeService('bus');
                    setFormData(prev => ({ ...prev, api_url: packycodeNode }));
                  }}
                >
                  <div className="text-xl">🚌</div>
                  <div className="text-center">
                    <div className="font-semibold text-sm">{t('relayStation.busService')}</div>
                    <div className="text-xs opacity-80 mt-1">{t('relayStation.busServiceDesc')}</div>
                  </div>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {packycodeService === 'taxi'
                  ? t('relayStation.taxiServiceNote')
                  : t('relayStation.busServiceNote')
                }
              </p>
            </div>
          </div>
        )}

        {formData.adapter === 'packycode' && packycodeService === 'bus' && (
          <div className="space-y-2">
            <Label>{t('relayStation.nodeSelection')}</Label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select
                    value={packycodeNode}
                    onValueChange={(value: string) => {
                      setPackycodeNode(value);
                      setFormData(prev => ({ ...prev, api_url: value }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('relayStation.selectNode')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="https://api.packycode.com">
                        🚌 直连1（默认公交车）
                      </SelectItem>
                      <SelectItem value="https://api-hk-cn2.packycode.com">
                        🇭🇰 直连2 (HK-CN2)
                      </SelectItem>
                      <SelectItem value="https://api-us-cmin2.packycode.com">
                        🇺🇸 直连3 (US-CMIN2)
                      </SelectItem>
                      <SelectItem value="https://api-us-4837.packycode.com">
                        🇺🇸 直连4 (US-4837)
                      </SelectItem>
                      <SelectItem value="https://api-us-cn2.packycode.com">
                        🔄 备用1 (US-CN2)
                      </SelectItem>
                      <SelectItem value="https://api-cf-pro.packycode.com">
                        ☁️ 备用2 (CF-Pro)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const busNodes = [
                      { url: "https://api.packycode.com", name: "🚌 直连1（默认公交车）" },
                      { url: "https://api-hk-cn2.packycode.com", name: "🇭🇰 直连2 (HK-CN2)" },
                      { url: "https://api-us-cmin2.packycode.com", name: "🇺🇸 直连3 (US-CMIN2)" },
                      { url: "https://api-us-4837.packycode.com", name: "🇺🇸 直连4 (US-4837)" },
                      { url: "https://api-us-cn2.packycode.com", name: "🔄 备用1 (US-CN2)" },
                      { url: "https://api-cf-pro.packycode.com", name: "☁️ 备用2 (CF-Pro)" }
                    ];

                    await performSpeedTest(busNodes, (bestNode) => {
                      setPackycodeNode(bestNode.url);
                    });
                  }}
                >
                  自动选择
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                {t('relayStation.selectedNode') + ': ' + packycodeNode}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="edit-description">{t('relayStation.description')}</Label>
          <Textarea
            id="edit-description"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder={t('relayStation.descriptionPlaceholder')}
            rows={2}
            className="w-full resize-none"
          />
        </div>

        {formData.adapter !== 'packycode' && (
          <div className="space-y-2">
            <Label htmlFor="edit-api_url">{t('relayStation.apiUrl')}</Label>
            <Input
              id="edit-api_url"
              type="url"
              value={formData.api_url}
              onChange={(e) => setFormData(prev => ({ ...prev, api_url: e.target.value }))}
              placeholder="https://api.example.com"
              className="w-full"
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-6">
          {formData.adapter === 'packycode' ? (
            // PackyCode 固定使用 API Key，不显示选择器
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-system_token">{t('relayStation.systemToken')} *</Label>
                {getApiKeyUrl(formData.adapter, packycodeService) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={async () => {
                      const url = getApiKeyUrl(formData.adapter, packycodeService);
                      if (url) await openExternalLink(url);
                    }}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    {t('relayStation.getApiKey')}
                  </Button>
                )}
              </div>
              <Input
                id="edit-system_token"
                type="password"
                value={formData.system_token}
                onChange={(e) => setFormData(prev => ({ ...prev, system_token: e.target.value }))}
                placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {t('relayStation.packycodeTokenNote')}
              </p>
            </div>
          ) : (
            // 其他适配器显示认证方式选择
            <>
              <div className="space-y-2">
                <Label htmlFor="edit-auth_method">{t('relayStation.authMethod')}</Label>
                <Select
                  value={formData.auth_method}
                  onValueChange={(value: AuthMethod) =>
                    setFormData(prev => ({ ...prev, auth_method: value }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bearer_token">Bearer Token</SelectItem>
                    <SelectItem value="api_key">API Key</SelectItem>
                    <SelectItem value="custom">{t('relayStation.custom')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-system_token">{t('relayStation.systemToken')} *</Label>
                  {getApiKeyUrl(formData.adapter) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={async () => {
                        const url = getApiKeyUrl(formData.adapter);
                        if (url) await openExternalLink(url);
                      }}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      {t('relayStation.getApiKey')}
                    </Button>
                  )}
                </div>
                <Input
                  id="edit-system_token"
                  type="password"
                  value={formData.system_token}
                  onChange={(e) => setFormData(prev => ({ ...prev, system_token: e.target.value }))}
                  placeholder={t('relayStation.tokenPlaceholder')}
                  className="w-full font-mono text-sm"
                />
              </div>
            </>
          )}
        </div>


        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center space-x-3">
            <Switch
              id="edit-enabled"
              checked={formData.enabled}
              onCheckedChange={(checked) =>
                setFormData(prev => ({ ...prev, enabled: checked }))
              }
            />
            <div>
              <Label htmlFor="edit-enabled" className="text-sm font-medium cursor-pointer">
                {t('relayStation.enabled')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('relayStation.enabledNote')}
              </p>
            </div>
          </div>
        </div>


        <div className="flex justify-end space-x-3 pt-3 border-t">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={submitting}
            className="min-w-[120px]"
          >
            {submitting && <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>}
            {t('common.save')}
          </Button>
        </div>
      </form>

      {/* Form Toast */}
      {formToast && (
        <Toast
          message={formToast.message}
          type={formToast.type}
          duration={3000}
          onDismiss={() => setFormToast(null)}
        />
      )}

      {/* 测速弹出框 */}
      <Dialog open={showSpeedTestModal} onOpenChange={setShowSpeedTestModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('relayStation.speedTest')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              {speedTestInProgress ? t('relayStation.testingNodes') : t('relayStation.testCompleted')}
            </div>
            <div className="space-y-3">
              {speedTestResults.map((result, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-medium">{result.name}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.status === 'testing' && (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600"></div>
                        <span className="text-sm text-blue-600">{t('relayStation.testing')}</span>
                      </>
                    )}
                    {result.status === 'success' && (
                      <>
                        <div className="h-2 w-2 rounded-full bg-green-500"></div>
                        <span className="text-sm text-green-600">{result.responseTime}ms</span>
                      </>
                    )}
                    {result.status === 'failed' && (
                      <>
                        <div className="h-2 w-2 rounded-full bg-red-500"></div>
                        <span className="text-sm text-red-600">{t('relayStation.failed')}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!speedTestInProgress && speedTestResults.length > 0 && (
              <div className="pt-2 text-center">
                <div className="text-sm text-green-600">
                  {t('relayStation.bestNodeSelected')}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RelayStationManager;
