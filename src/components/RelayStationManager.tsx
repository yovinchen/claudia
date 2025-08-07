import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/hooks/useTranslation';
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
  const [connectionTests, setConnectionTests] = useState<Record<string, ConnectionTestResult>>({});
  const [testingConnections, setTestingConnections] = useState<Record<string, boolean>>({});
  const [togglingEnable, setTogglingEnable] = useState<Record<string, boolean>>({});
  const [currentConfig, setCurrentConfig] = useState<Record<string, string | null>>({});
  const [loadingConfig, setLoadingConfig] = useState(false);
  
  const { t } = useTranslation();

  // 加载中转站列表
  const loadStations = async () => {
    try {
      setLoading(true);
      const stationList = await api.relayStationsList();
      setStations(stationList);
    } catch (error) {
      console.error('Failed to load stations:', error);
      alert(t('relayStation.loadFailed'));
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
      alert(result);
      loadCurrentConfig();
    } catch (error) {
      console.error('Failed to sync config:', error);
      alert(t('relayStation.syncFailed'));
    }
  };

  // 测试连接
  const testConnection = async (stationId: string) => {
    try {
      setTestingConnections(prev => ({ ...prev, [stationId]: true }));
      const result = await api.relayStationTestConnection(stationId);
      setConnectionTests(prev => ({ ...prev, [stationId]: result }));
      
      if (result.success) {
        alert(t('relayStation.connectionSuccess'));
      } else {
        alert(result.message);
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      alert(t('relayStation.connectionFailed'));
    } finally {
      setTestingConnections(prev => ({ ...prev, [stationId]: false }));
    }
  };

  // 删除中转站
  const deleteStation = async (stationId: string) => {
    if (!confirm(t('relayStation.deleteConfirm'))) return;
    
    try {
      await api.relayStationDelete(stationId);
      alert(t('relayStation.deleteSuccess'));
      loadStations();
    } catch (error) {
      console.error('Failed to delete station:', error);
      alert(t('relayStation.deleteFailed'));
    }
  };

  // 获取适配器类型显示名称
  const getAdapterDisplayName = (adapter: RelayStationAdapter): string => {
    switch (adapter) {
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
      alert(newEnabled ? t('relayStation.enabledSuccess') : t('relayStation.disabledSuccess'));
      loadStations();
      loadCurrentConfig(); // 重新加载配置状态
    } catch (error) {
      console.error('Failed to toggle enable status:', error);
      alert(t('relayStation.toggleEnableFailed'));
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
                        {connectionTests[station.id].response_time && (
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
                      onClick={() => testConnection(station.id)}
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
                        onClick={() => {
                          setSelectedStation(station);
                          setShowEditDialog(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteStation(station.id)}
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
              }}
              onCancel={() => {
                setShowEditDialog(false);
                setSelectedStation(null);
              }}
            />
          </DialogContent>
        </Dialog>
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
    adapter: 'newapi',
    auth_method: 'bearer_token',
    system_token: '',
    user_id: '',
    enabled: false,  // 默认不启用，需要通过主界面切换
  });
  const [submitting, setSubmitting] = useState(false);
  
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      alert(t('relayStation.nameRequired'));
      return;
    }

    if (!formData.api_url.trim()) {
      alert(t('relayStation.apiUrlRequired'));
      return;
    }

    if (!formData.system_token.trim()) {
      alert(t('relayStation.tokenRequired'));
      return;
    }

    try {
      setSubmitting(true);
      await api.relayStationCreate(formData);
      alert(t('relayStation.createSuccess'));
      onSuccess();
    } catch (error) {
      console.error('Failed to create station:', error);
      alert(t('relayStation.createFailed'));
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
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('relayStation.name')} *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder={t('relayStation.namePlaceholder')}
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
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newapi">NewAPI</SelectItem>
                <SelectItem value="oneapi">OneAPI</SelectItem>
                <SelectItem value="yourapi">YourAPI</SelectItem>
                <SelectItem value="custom">{t('relayStation.custom')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">{t('relayStation.description')}</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder={t('relayStation.descriptionPlaceholder')}
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="api_url">{t('relayStation.apiUrl')} *</Label>
          <Input
            id="api_url"
            type="url"
            value={formData.api_url}
            onChange={(e) => setFormData(prev => ({ ...prev, api_url: e.target.value }))}
            placeholder="https://api.example.com"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="auth_method">{t('relayStation.authMethod')}</Label>
            <Select
              value={formData.auth_method}
              onValueChange={(value: AuthMethod) => 
                setFormData(prev => ({ ...prev, auth_method: value }))
              }
            >
              <SelectTrigger>
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
            />
          </div>
        </div>

        {(formData.adapter === 'newapi' || formData.adapter === 'oneapi') && (
          <div className="space-y-2">
            <Label htmlFor="user_id">{t('relayStation.userId')}</Label>
            <Input
              id="user_id"
              value={formData.user_id}
              onChange={(e) => setFormData(prev => ({ ...prev, user_id: e.target.value }))}
              placeholder={t('relayStation.userIdPlaceholder')}
            />
          </div>
        )}

        <div className="flex items-center space-x-2">
          <Switch
            id="enabled"
            checked={formData.enabled}
            onCheckedChange={(checked) => 
              setFormData(prev => ({ ...prev, enabled: checked }))
            }
          />
          <Label htmlFor="enabled">{t('relayStation.enabled')}</Label>
        </div>

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={() => {}}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>}
            {t('common.create')}
          </Button>
        </div>
      </form>
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
  
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      alert(t('relayStation.nameRequired'));
      return;
    }

    try {
      setSubmitting(true);
      await api.relayStationUpdate(formData);
      alert(t('relayStation.updateSuccess'));
      onSuccess();
    } catch (error) {
      console.error('Failed to update station:', error);
      alert(t('relayStation.updateFailed'));
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
        {/* 表单内容与创建对话框相同，但使用 formData 和 setFormData */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('relayStation.name')} *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder={t('relayStation.namePlaceholder')}
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
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newapi">NewAPI</SelectItem>
                <SelectItem value="oneapi">OneAPI</SelectItem>
                <SelectItem value="yourapi">YourAPI</SelectItem>
                <SelectItem value="custom">{t('relayStation.custom')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="api_url">{t('relayStation.apiUrl')} *</Label>
          <Input
            id="api_url"
            type="url"
            value={formData.api_url}
            onChange={(e) => setFormData(prev => ({ ...prev, api_url: e.target.value }))}
            placeholder="https://api.example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="system_token">{t('relayStation.systemToken')} *</Label>
          <Input
            id="system_token"
            type="password"
            value={formData.system_token}
            onChange={(e) => setFormData(prev => ({ ...prev, system_token: e.target.value }))}
            placeholder={t('relayStation.tokenPlaceholder')}
          />
        </div>

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>}
            {t('common.save')}
          </Button>
        </div>
      </form>
    </>
  );
};

export default RelayStationManager;