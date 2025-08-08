import React, { useState, useEffect } from 'react';
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
  ConnectionTestResult,
  api
} from '@/lib/api';
import {
  Plus,
  Edit,
  Trash2,
  Globe,
  CheckCircle,
  XCircle,
  Wifi,
  WifiOff,
  Server,
  ArrowLeft,
  Settings,
  RefreshCw
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
  const [connectionTests, setConnectionTests] = useState<Record<string, ConnectionTestResult>>({});
  const [testingConnections, setTestingConnections] = useState<Record<string, boolean>>({});
  const [togglingEnable, setTogglingEnable] = useState<Record<string, boolean>>({});
  const [currentConfig, setCurrentConfig] = useState<Record<string, string | null>>({});
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const { t } = useTranslation();

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
      const config = await api.relayStationGetCurrentConfig();
      setCurrentConfig(config);
    } catch (error) {
      console.error('Failed to load current config:', error);
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

  // 测试连接
  const testConnection = async (stationId: string) => {
    try {
      setTestingConnections(prev => ({ ...prev, [stationId]: true }));
      const result = await api.relayStationTestConnection(stationId);
      setConnectionTests(prev => ({ ...prev, [stationId]: result }));

      if (result.success) {
        showToast(t('relayStation.connectionSuccess'), "success");
      } else {
        showToast(result.message, "error");
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      showToast(t('relayStation.connectionFailed'), "error");
    } finally {
      setTestingConnections(prev => ({ ...prev, [stationId]: false }));
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
      case 'newapi': return 'NewAPI';
      case 'oneapi': return 'OneAPI';
      case 'yourapi': return 'YourAPI';
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
          <DialogContent className="sm:max-w-[600px]">
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
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <CardTitle className="text-lg">{t('relayStation.currentConfig')}</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                loadCurrentConfig();
                syncConfig();
              }}
              disabled={loadingConfig}
            >
              {loadingConfig ? (
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">{t('relayStation.syncConfig')}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="font-medium text-muted-foreground min-w-[100px]">API URL:</span>
              <span className="font-mono text-xs break-all">
                {currentConfig.api_url || t('relayStation.notConfigured')}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium text-muted-foreground min-w-[100px]">API Token:</span>
              <span className="font-mono text-xs">
                {currentConfig.api_token || t('relayStation.notConfigured')}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-3">
              {t('relayStation.configLocation')}: ~/.claude/settings.json
            </div>
          </div>
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

                  {connectionTests[station.id] && (
                    <div className="flex items-center text-sm">
                      {connectionTests[station.id].success ? (
                        <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="mr-2 h-4 w-4 text-red-500" />
                      )}
                      <span>
                        {connectionTests[station.id].message}
                        {connectionTests[station.id].response_time !== undefined && connectionTests[station.id].response_time !== null && (
                          <span className="ml-2 text-muted-foreground">
                            ({connectionTests[station.id].response_time}ms)
                          </span>
                        )}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        testConnection(station.id);
                      }}
                      disabled={testingConnections[station.id]}
                    >
                      {testingConnections[station.id] ? (
                        <WifiOff className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Wifi className="mr-2 h-4 w-4" />
                      )}
                      {t('relayStation.testConnection')}
                    </Button>

                    <div className="flex space-x-2">
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
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 编辑对话框 */}
      {selectedStation && (
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="sm:max-w-[600px]">
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
  const [testingNodes, setTestingNodes] = useState(false);
  const [nodeTestResults, setNodeTestResults] = useState<any[]>([]);
  const [autoSelectingNode, setAutoSelectingNode] = useState(false);

  const { t } = useTranslation();

  // 当适配器改变时更新认证方式和 URL
  useEffect(() => {
    if (formData.adapter === 'packycode') {
      setFormData(prev => ({
        ...prev,
        auth_method: 'api_key', // PackyCode 固定使用 API Key
        api_url: packycodeService === 'taxi' 
          ? 'https://share-api.packycode.com' 
          : (packycodeNode === 'auto' ? 'https://api.packycode.com' : packycodeNode)
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
  }, [formData.adapter, packycodeService, packycodeNode]);

  // 自动填充中转站名称
  const fillStationName = (serviceType: string) => {
    const serviceName = serviceType === 'taxi' ? t('relayStation.taxiService') : t('relayStation.busService');
    const newName = `PackyCode ${serviceName}`;
    
    // 如果名称为空，或者当前名称是之前自动生成的PackyCode名称，则更新
    if (!formData.name.trim() || 
        formData.name.startsWith('PackyCode ') || 
        formData.name === `PackyCode ${t('relayStation.taxiService')}` ||
        formData.name === `PackyCode ${t('relayStation.busService')}`) {
      setFormData(prev => ({
        ...prev,
        name: newName
      }));
    }
  };

  // 测试所有节点速度（仅公交车服务需要）
  const testAllNodes = async () => {
    setTestingNodes(true);
    try {
      // 不需要 token，只测试网络延时
      const results = await api.testAllPackycodeNodes('dummy_token');
      setNodeTestResults(results);
      setFormToast({ message: t('relayStation.testCompleted'), type: "success" });
    } catch (error) {
      console.error('Failed to test nodes:', error);
      setFormToast({ message: t('relayStation.testFailed'), type: "error" });
    } finally {
      setTestingNodes(false);
    }
  };

  // 自动选择最快节点（仅公交车服务需要）
  const autoSelectBestNode = async () => {
    setAutoSelectingNode(true);
    try {
      // 不需要 token，只测试网络延时
      const bestNode = await api.autoSelectBestNode('dummy_token');
      setPackycodeNode(bestNode.url);
      setFormToast({ 
        message: `${t('relayStation.autoSelectedNode')}: ${bestNode.name} (${bestNode.response_time}ms)`, 
        type: "success" 
      });
    } catch (error) {
      console.error('Failed to auto-select node:', error);
      setFormToast({ message: t('relayStation.autoSelectFailed'), type: "error" });
    } finally {
      setAutoSelectingNode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
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
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="name">{t('relayStation.name')} *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder={t('relayStation.namePlaceholder')}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adapter">{t('relayStation.adapterType')}</Label>
            <Select
              value={formData.adapter}
              onValueChange={(value: RelayStationAdapter) =>
                setFormData(prev => ({ ...prev, adapter: value }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="packycode">PackyCode</SelectItem>
                <SelectItem value="newapi">NewAPI</SelectItem>
                <SelectItem value="oneapi">OneAPI</SelectItem>
                <SelectItem value="yourapi">YourAPI</SelectItem>
                <SelectItem value="custom">{t('relayStation.custom')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {formData.adapter === 'packycode' && (
          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium">{t('relayStation.serviceType')}</Label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={packycodeService === 'taxi' ? 'default' : 'outline'}
                  className={`p-4 h-auto flex flex-col items-center space-y-2 transition-all ${
                    packycodeService === 'taxi' 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                      : 'hover:bg-blue-50 dark:hover:bg-blue-950'
                  }`}
                  onClick={() => {
                    setPackycodeService('taxi');
                    fillStationName('taxi');
                  }}
                >
                  <div className="text-2xl">🚗</div>
                  <div className="text-center">
                    <div className="font-semibold">{t('relayStation.taxiService')}</div>
                    <div className="text-xs opacity-80 mt-1">{t('relayStation.taxiServiceDesc')}</div>
                  </div>
                </Button>
                
                <Button
                  type="button"
                  variant={packycodeService === 'bus' ? 'default' : 'outline'}
                  className={`p-4 h-auto flex flex-col items-center space-y-2 transition-all ${
                    packycodeService === 'bus' 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : 'hover:bg-green-50 dark:hover:bg-green-950'
                  }`}
                  onClick={() => {
                    setPackycodeService('bus');
                    fillStationName('bus');
                  }}
                >
                  <div className="text-2xl">🚌</div>
                  <div className="text-center">
                    <div className="font-semibold">{t('relayStation.busService')}</div>
                    <div className="text-xs opacity-80 mt-1">{t('relayStation.busServiceDesc')}</div>
                  </div>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {packycodeService === 'taxi' 
                  ? `${t('relayStation.fixedUrl')}: https://share-api.packycode.com`
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
                      if (value === 'auto') {
                        autoSelectBestNode();
                      } else {
                        setPackycodeNode(value);
                      }
                    }}
                  >
                  <SelectTrigger>
                    <SelectValue placeholder={t('relayStation.selectNode')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      ⚡ {t('relayStation.autoSelect')}
                    </SelectItem>
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
                  size="sm"
                  onClick={testAllNodes}
                  disabled={testingNodes}
                >
                  {testingNodes ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
                  ) : (
                    <Wifi className="h-4 w-4" />
                  )}
                  <span className="ml-2">{t('relayStation.testSpeed')}</span>
                </Button>
              </div>
              
              {/* 显示测速结果 */}
              {nodeTestResults.length > 0 && (
                <div className="mt-3 p-3 bg-muted rounded-lg max-h-48 overflow-y-auto">
                  <p className="text-sm font-medium mb-2">{t('relayStation.testResults')}:</p>
                  <div className="space-y-1">
                    {nodeTestResults.map((result, index) => (
                      <div key={index} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1">
                          {result.success ? (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-500" />
                          )}
                          {result.node.name}
                        </span>
                        <span className={result.success ? 'text-green-600' : 'text-red-600'}>
                          {result.success ? `${result.response_time}ms` : t('relayStation.failed')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <p className="text-xs text-muted-foreground">
                {autoSelectingNode 
                  ? t('relayStation.selectingBestNode')
                  : packycodeNode === 'auto' 
                    ? t('relayStation.autoSelectDesc')
                    : t('relayStation.selectedNode') + ': ' + packycodeNode}
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
            <Label htmlFor="api_url">{t('relayStation.apiUrl')} *</Label>
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
              <Label htmlFor="system_token">{t('relayStation.systemToken')} *</Label>
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
                <Label htmlFor="system_token">{t('relayStation.systemToken')} *</Label>
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

        {(formData.adapter === 'newapi' || formData.adapter === 'oneapi') && (
          <div className="space-y-2">
            <Label htmlFor="user_id">{t('relayStation.userId')}</Label>
            <Input
              id="user_id"
              value={formData.user_id}
              onChange={(e) => setFormData(prev => ({ ...prev, user_id: e.target.value }))}
              placeholder={t('relayStation.userIdPlaceholder')}
              className="w-full"
            />
          </div>
        )}

        <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center space-x-3">
            <Switch
              id="enabled"
              checked={formData.enabled}
              onCheckedChange={(checked) =>
                setFormData(prev => ({ ...prev, enabled: checked }))
              }
            />
            <div>
              <Label htmlFor="enabled" className="text-base font-medium cursor-pointer">
                {t('relayStation.enabled')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('relayStation.enabledNote')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t">
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
  const [testingNodes, setTestingNodes] = useState(false);
  const [nodeTestResults, setNodeTestResults] = useState<any[]>([]);
  const [autoSelectingNode, setAutoSelectingNode] = useState(false);

  const { t } = useTranslation();

  // 当适配器改变时更新认证方式和 URL
  useEffect(() => {
    if (formData.adapter === 'packycode') {
      setFormData(prev => ({
        ...prev,
        auth_method: 'api_key', // PackyCode 固定使用 API Key
        api_url: packycodeService === 'taxi' 
          ? 'https://share-api.packycode.com' 
          : (packycodeNode === 'auto' ? 'https://api.packycode.com' : packycodeNode)
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
  }, [formData.adapter, packycodeService, packycodeNode]);

  // 测试所有节点速度（仅公交车服务需要）
  const testAllNodes = async () => {
    setTestingNodes(true);
    try {
      const results = await api.testAllPackycodeNodes('dummy_token');
      setNodeTestResults(results);
      setFormToast({ message: t('relayStation.testCompleted'), type: "success" });
    } catch (error) {
      console.error('Failed to test nodes:', error);
      setFormToast({ message: t('relayStation.testFailed'), type: "error" });
    } finally {
      setTestingNodes(false);
    }
  };

  // 自动选择最快节点（仅公交车服务需要）
  const autoSelectBestNode = async () => {
    setAutoSelectingNode(true);
    try {
      const bestNode = await api.autoSelectBestNode('dummy_token');
      setPackycodeNode(bestNode.url);
      setFormData(prev => ({ ...prev, api_url: bestNode.url }));
      setFormToast({ 
        message: `${t('relayStation.autoSelectedNode')}: ${bestNode.name} (${bestNode.response_time}ms)`, 
        type: "success" 
      });
    } catch (error) {
      console.error('Failed to auto-select node:', error);
      setFormToast({ message: t('relayStation.autoSelectFailed'), type: "error" });
    } finally {
      setAutoSelectingNode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
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
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="edit-name">{t('relayStation.name')} *</Label>
            <Input
              id="edit-name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder={t('relayStation.namePlaceholder')}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-adapter">{t('relayStation.adapterType')}</Label>
            <Select
              value={formData.adapter}
              onValueChange={(value: RelayStationAdapter) =>
                setFormData(prev => ({ ...prev, adapter: value }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="packycode">PackyCode</SelectItem>
                <SelectItem value="newapi">NewAPI</SelectItem>
                <SelectItem value="oneapi">OneAPI</SelectItem>
                <SelectItem value="yourapi">YourAPI</SelectItem>
                <SelectItem value="custom">{t('relayStation.custom')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {formData.adapter === 'packycode' && (
          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium">{t('relayStation.serviceType')}</Label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={packycodeService === 'taxi' ? 'default' : 'outline'}
                  className={`p-4 h-auto flex flex-col items-center space-y-2 transition-all ${
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
                  <div className="text-2xl">🚗</div>
                  <div className="text-center">
                    <div className="font-semibold">{t('relayStation.taxiService')}</div>
                    <div className="text-xs opacity-80 mt-1">{t('relayStation.taxiServiceDesc')}</div>
                  </div>
                </Button>
                
                <Button
                  type="button"
                  variant={packycodeService === 'bus' ? 'default' : 'outline'}
                  className={`p-4 h-auto flex flex-col items-center space-y-2 transition-all ${
                    packycodeService === 'bus' 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : 'hover:bg-green-50 dark:hover:bg-green-950'
                  }`}
                  onClick={() => {
                    setPackycodeService('bus');
                  }}
                >
                  <div className="text-2xl">🚌</div>
                  <div className="text-center">
                    <div className="font-semibold">{t('relayStation.busService')}</div>
                    <div className="text-xs opacity-80 mt-1">{t('relayStation.busServiceDesc')}</div>
                  </div>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {packycodeService === 'taxi' 
                  ? `${t('relayStation.fixedUrl')}: https://share-api.packycode.com`
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
                      if (value === 'auto') {
                        autoSelectBestNode();
                      } else {
                        setPackycodeNode(value);
                        setFormData(prev => ({ ...prev, api_url: value }));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('relayStation.selectNode')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        ⚡ {t('relayStation.autoSelect')}
                      </SelectItem>
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
                  size="sm"
                  onClick={testAllNodes}
                  disabled={testingNodes}
                >
                  {testingNodes ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
                  ) : (
                    <Wifi className="h-4 w-4" />
                  )}
                  <span className="ml-2">{t('relayStation.testSpeed')}</span>
                </Button>
              </div>
              
              {/* 显示测速结果 */}
              {nodeTestResults.length > 0 && (
                <div className="mt-3 p-3 bg-muted rounded-lg max-h-48 overflow-y-auto">
                  <p className="text-sm font-medium mb-2">{t('relayStation.testResults')}:</p>
                  <div className="space-y-1">
                    {nodeTestResults.map((result, index) => (
                      <div key={index} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1">
                          {result.success ? (
                            <CheckCircle className="h-3 w-3 text-green-500" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-500" />
                          )}
                          {result.node.name}
                        </span>
                        <span className={result.success ? 'text-green-600' : 'text-red-600'}>
                          {result.success ? `${result.response_time}ms` : t('relayStation.failed')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <p className="text-xs text-muted-foreground">
                {autoSelectingNode 
                  ? t('relayStation.selectingBestNode')
                  : t('relayStation.selectedNode') + ': ' + packycodeNode}
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
            <Label htmlFor="edit-api_url">{t('relayStation.apiUrl')} *</Label>
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
              <Label htmlFor="edit-system_token">{t('relayStation.systemToken')} *</Label>
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
                <Label htmlFor="edit-system_token">{t('relayStation.systemToken')} *</Label>
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

        {(formData.adapter === 'newapi' || formData.adapter === 'oneapi') && (
          <div className="space-y-2">
            <Label htmlFor="edit-user_id">{t('relayStation.userId')}</Label>
            <Input
              id="edit-user_id"
              value={formData.user_id}
              onChange={(e) => setFormData(prev => ({ ...prev, user_id: e.target.value }))}
              placeholder={t('relayStation.userIdPlaceholder')}
              className="w-full"
            />
          </div>
        )}

        <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center space-x-3">
            <Switch
              id="edit-enabled"
              checked={formData.enabled}
              onCheckedChange={(checked) =>
                setFormData(prev => ({ ...prev, enabled: checked }))
              }
            />
            <div>
              <Label htmlFor="edit-enabled" className="text-base font-medium cursor-pointer">
                {t('relayStation.enabled')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('relayStation.enabledNote')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t">
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
    </>
  );
};

export default RelayStationManager;
