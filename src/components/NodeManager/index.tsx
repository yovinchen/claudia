import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  CheckCircle2,
  Settings,
  Plus,
  Edit,
  Trash2,
  Zap,
  Loader2,
} from 'lucide-react';
import * as api from '@/lib/api';
import type { ApiNode, CreateApiNodeRequest, NodeTestResult } from '@/lib/api';

interface NodeSelectorProps {
  adapter: api.RelayStationAdapter;
  value?: string;
  onChange: (url: string, node?: ApiNode) => void;
  allowManualInput?: boolean;
  showToast?: (message: string, type: 'success' | 'error') => void;
}

/**
 * 节点选择器组件
 * 用于中转站表单中选择API节点
 */
export const NodeSelector: React.FC<NodeSelectorProps> = ({
  adapter,
  value = '',
  onChange,
  allowManualInput = true,
  showToast = (msg, _type) => console.log(msg), // 默认使用 console.log
}) => {
  const [showDialog, setShowDialog] = useState(false);
  const [nodes, setNodes] = useState<ApiNode[]>([]);
  const [currentNode, setCurrentNode] = useState<ApiNode | null>(null);

  useEffect(() => {
    loadNodes();
  }, [adapter]);

  useEffect(() => {
    if (value && nodes.length > 0) {
      const node = nodes.find(n => n.url === value);
      setCurrentNode(node || null);
    }
  }, [value, nodes]);

  const loadNodes = async () => {
    try {
      const allNodes = await api.listApiNodes(adapter, true);
      setNodes(allNodes);
    } catch (error) {
      console.error('Failed to load nodes:', error);
    }
  };

  const handleSelectNode = (node: ApiNode) => {
    onChange(node.url, node);
    setShowDialog(false);
  };

  const handleSaveCustomNode = async () => {
    if (!value.trim() || value.startsWith('http') === false) {
      showToast('请输入有效的 URL', 'error');
      return;
    }

    // 检查是否已存在
    const existingNode = nodes.find(n => n.url === value);
    if (existingNode) {
      showToast('该节点已存在', 'error');
      return;
    }

    try {
      await api.createApiNode({
        name: `自定义节点 - ${new URL(value).hostname}`,
        url: value,
        adapter: adapter,
        description: '用户手动添加的节点',
      });
      showToast('节点保存成功', 'success');
      loadNodes();
    } catch (error) {
      showToast('保存失败', 'error');
      console.error(error);
    }
  };

  return (
    <div className="space-y-2">
      <Label>节点地址 *</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => allowManualInput && onChange(e.target.value)}
          placeholder="https://api.example.com"
          readOnly={!allowManualInput}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setShowDialog(true)}
          title="管理节点"
        >
          <Settings className="h-4 w-4" />
        </Button>
        {allowManualInput && value && !currentNode && value.startsWith('http') && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleSaveCustomNode}
            title="保存为节点"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
      {currentNode && adapter !== 'custom' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>📍 当前节点：{currentNode.name}</span>
          {currentNode.is_default && (
            <Badge variant="secondary" className="text-xs">预设</Badge>
          )}
        </div>
      )}

      <NodeManagerDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        adapter={adapter}
        onSelectNode={handleSelectNode}
        currentUrl={value}
        showToast={showToast}
      />
    </div>
  );
};

interface NodeManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adapter?: api.RelayStationAdapter;
  onSelectNode?: (node: ApiNode) => void;
  currentUrl?: string;
  showToast?: (message: string, type: 'success' | 'error') => void;
}

/**
 * 从中间截断 URL，保留开头和结尾
 */
const truncateUrl = (url: string, maxLength: number = 50): string => {
  if (url.length <= maxLength) return url;

  const start = Math.floor(maxLength * 0.6);
  const end = Math.floor(maxLength * 0.4);

  return url.substring(0, start) + '...' + url.substring(url.length - end);
};

/**
 * 节点管理弹窗
 * 支持增删改查和测速功能
 */
const NodeManagerDialog: React.FC<NodeManagerDialogProps> = ({
  open,
  onOpenChange,
  adapter: filterAdapter,
  onSelectNode,
  currentUrl,
  showToast = (msg) => console.log(msg),
}) => {
  const [nodes, setNodes] = useState<ApiNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, NodeTestResult>>({});
  const [editingNode, setEditingNode] = useState<ApiNode | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [enabledOnly, setEnabledOnly] = useState(false);

  useEffect(() => {
    if (open) {
      loadNodes();
      // 首次打开时初始化预设节点
      api.initDefaultNodes().catch(console.error);
    }
  }, [open, filterAdapter, enabledOnly]);

  const loadNodes = async () => {
    setLoading(true);
    try {
      const allNodes = await api.listApiNodes(filterAdapter, enabledOnly);
      setNodes(allNodes);
    } catch (error) {
      showToast('加载节点失败', 'error');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestAll = async () => {
    setTesting(true);
    setTestResults({});
    try {
      const results = await api.testAllApiNodes(filterAdapter, 5000);
      const resultsMap: Record<string, NodeTestResult> = {};
      results.forEach(r => {
        resultsMap[r.node_id] = r;
      });
      setTestResults(resultsMap);
    } catch (error) {
      showToast('测速失败', 'error');
      console.error(error);
    } finally {
      setTesting(false);
    }
  };

  const handleTestOne = async (node: ApiNode) => {
    setTestResults(prev => ({
      ...prev,
      [node.id]: { ...testResults[node.id], status: 'testing' } as NodeTestResult,
    }));
    try {
      const result = await api.testApiNode(node.url, 5000);
      setTestResults(prev => ({
        ...prev,
        [node.id]: { ...result, node_id: node.id, name: node.name },
      }));
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [node.id]: {
          node_id: node.id,
          url: node.url,
          name: node.name,
          response_time: null,
          status: 'failed',
          error: String(error),
        },
      }));
    }
  };

  const handleDelete = async (node: ApiNode) => {
    try {
      await api.deleteApiNode(node.id);
      // 直接从列表中移除，不重新加载
      setNodes(prev => prev.filter(n => n.id !== node.id));
      // 同时移除测试结果
      setTestResults(prev => {
        const newResults = { ...prev };
        delete newResults[node.id];
        return newResults;
      });
      showToast('删除成功', 'success');
    } catch (error) {
      showToast('删除失败', 'error');
      console.error(error);
    }
  };

  const handleToggleEnable = async (node: ApiNode) => {
    try {
      await api.updateApiNode(node.id, { enabled: !node.enabled });
      loadNodes();
    } catch (error) {
      showToast('更新失败', 'error');
      console.error(error);
    }
  };

  const getStatusBadge = (node: ApiNode) => {
    const result = testResults[node.id];
    if (!result) {
      return <Badge variant="outline" className="text-xs">未测试</Badge>;
    }
    if (result.status === 'testing') {
      return (
        <Badge variant="outline" className="text-xs">
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
          测试中
        </Badge>
      );
    }
    if (result.status === 'success') {
      return (
        <Badge variant="default" className="text-xs bg-green-600">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          {result.response_time}ms
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="text-xs">
        <AlertCircle className="h-3 w-3 mr-1" />
          失败
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>节点管理</DialogTitle>
              <DialogDescription>管理 API 节点，支持增删改查和测速</DialogDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestAll}
                disabled={testing || nodes.length === 0}
              >
                <Zap className="h-4 w-4 mr-2" />
                {testing ? '测速中...' : '全部测速'}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* 工具栏 */}
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setEditingNode(null);
                setShowForm(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              添加节点
            </Button>
            <div className="flex items-center gap-2 ml-auto">
              <Switch
                checked={enabledOnly}
                onCheckedChange={setEnabledOnly}
              />
              <Label className="text-sm">只看启用</Label>
            </div>
          </div>

          {/* 节点列表 */}
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : nodes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              暂无节点
            </div>
          ) : (
            <div className="space-y-2">
              {nodes.map((node) => (
                <div
                  key={node.id}
                  className={`p-3 border rounded-lg flex items-center justify-between transition-all ${
                    currentUrl === node.url
                      ? 'ring-2 ring-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                      : 'hover:bg-muted/50 cursor-pointer'
                  }`}
                  onClick={(e) => {
                    // 如果点击的是操作按钮区域，不触发选择
                    if ((e.target as HTMLElement).closest('.action-buttons')) {
                      return;
                    }
                    if (onSelectNode) {
                      onSelectNode(node);
                    }
                  }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={node.enabled}
                        onCheckedChange={() => handleToggleEnable(node)}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{node.name}</span>
                        {node.is_default && (
                          <Badge variant="secondary" className="text-xs">预设</Badge>
                        )}
                        {getStatusBadge(node)}
                      </div>
                      <div
                        className="text-sm text-muted-foreground font-mono"
                        title={node.url}
                      >
                        {truncateUrl(node.url, 60)}
                      </div>
                      {node.description && (
                        <div className="text-xs text-muted-foreground mt-1">{node.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 action-buttons" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTestOne(node)}
                      disabled={testResults[node.id]?.status === 'testing'}
                      title="测速"
                    >
                      <Zap className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingNode(node);
                        setShowForm(true);
                      }}
                      title="编辑"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(node)}
                      className="text-red-500 hover:text-red-700"
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 添加/编辑表单对话框 */}
        <NodeFormDialog
          open={showForm}
          onOpenChange={setShowForm}
          node={editingNode}
          defaultAdapter={filterAdapter}
          onSuccess={() => {
            setShowForm(false);
            setEditingNode(null);
            loadNodes();
          }}
          showToast={showToast}
        />
      </DialogContent>
    </Dialog>
  );
};

interface NodeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node?: ApiNode | null;
  defaultAdapter?: api.RelayStationAdapter;
  onSuccess: () => void;
  showToast?: (message: string, type: 'success' | 'error') => void;
}

/**
 * 节点添加/编辑表单
 */
const NodeFormDialog: React.FC<NodeFormDialogProps> = ({
  open,
  onOpenChange,
  node,
  defaultAdapter,
  onSuccess,
  showToast = (msg) => console.log(msg),
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<CreateApiNodeRequest>({
    name: '',
    url: '',
    adapter: defaultAdapter || 'packycode',
    description: '',
  });

  useEffect(() => {
    if (node) {
      setFormData({
        name: node.name,
        url: node.url,
        adapter: node.adapter,
        description: node.description || '',
      });
    } else {
      setFormData({
        name: '',
        url: '',
        adapter: defaultAdapter || 'packycode',
        description: '',
      });
    }
  }, [node, defaultAdapter, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (node) {
        await api.updateApiNode(node.id, {
          name: formData.name,
          url: formData.url,
          description: formData.description,
        });
        showToast('更新成功', 'success');
      } else {
        await api.createApiNode(formData);
        showToast('创建成功', 'success');
      }
      onSuccess();
    } catch (error) {
      showToast(node ? '更新失败' : '创建失败', 'error');
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{node ? '编辑节点' : '添加节点'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">节点名称 *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例如：🚀 我的自定义节点"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">节点地址 *</Label>
            <Input
              id="url"
              type="url"
              value={formData.url}
              onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
              placeholder="https://api.example.com"
              required
            />
          </div>

          {!node && (
            <div className="space-y-2">
              <Label htmlFor="adapter">适配器类型 *</Label>
              <Select
                value={formData.adapter}
                onValueChange={(value) => setFormData(prev => ({ ...prev, adapter: value as api.RelayStationAdapter }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="packycode">PackyCode</SelectItem>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                  <SelectItem value="glm">智谱 GLM</SelectItem>
                  <SelectItem value="qwen">通义千问</SelectItem>
                  <SelectItem value="kimi">Moonshot Kimi</SelectItem>
                  <SelectItem value="minimax">MiniMax</SelectItem>
                  <SelectItem value="custom">自定义</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">描述（可选）</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="节点描述信息"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NodeSelector;
