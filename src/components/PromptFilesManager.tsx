import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Plus,
  Search,
  Upload,
  ArrowLeft,
  Check,
  Edit,
  Trash2,
  Eye,
  Play,
  AlertCircle,
  Loader2,
  Tag,
  Clock,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePromptFilesStore } from '@/stores/promptFilesStore';
import { useTranslation } from '@/hooks/useTranslation';
import type { PromptFile } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PromptFileEditor } from './PromptFileEditor';
import { PromptFilePreview } from './PromptFilePreview';
import { save } from '@tauri-apps/plugin-dialog';

interface PromptFilesManagerProps {
  onBack?: () => void;
  className?: string;
}

export const PromptFilesManager: React.FC<PromptFilesManagerProps> = ({ onBack, className }) => {
  const { t } = useTranslation();
  const {
    files,
    isLoading,
    error,
    loadFiles,
    deleteFile,
    applyFile,
    deactivateAll,
    importFromClaudeMd,
    clearError,
  } = usePromptFilesStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<PromptFile | null>(null);
  const [applyingFileId, setApplyingFileId] = useState<string | null>(null);
  const [syncingFileId, setSyncingFileId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (error) {
      showToast(error, 'error');
      clearError();
    }
  }, [error, clearError]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleApply = async (file: PromptFile) => {
    setApplyingFileId(file.id);
    try {
      const path = await applyFile(file.id);
      showToast(`已应用到: ${path}`, 'success');
    } catch (error) {
      showToast('应用失败', 'error');
    } finally {
      setApplyingFileId(null);
    }
  };

  // 应用到自定义路径（文件路径），跨平台
  const handleApplyToCustom = async (file: PromptFile) => {
    try {
      const selectedPath = await save({
        defaultPath: 'CLAUDE.md',
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!selectedPath) return; // 用户取消

      setApplyingFileId(file.id);
      const resultPath = await applyFile(file.id, String(selectedPath));
      showToast(`已应用到: ${resultPath}`, 'success');
      await loadFiles();
    } catch (error) {
      showToast(t('promptFiles.applyToCustomPathFailed'), 'error');
    } finally {
      setApplyingFileId(null);
    }
  };

  const handleDeactivate = async () => {
    try {
      await deactivateAll();
      showToast('已取消使用', 'success');
    } catch (error) {
      showToast('取消失败', 'error');
    }
  };

  const handleSync = async (file: PromptFile) => {
    setSyncingFileId(file.id);
    try {
      // 同步当前激活的文件到 ~/.claude/CLAUDE.md
      const path = await applyFile(file.id);
      showToast(`文件已同步到: ${path}`, 'success');
      await loadFiles(); // 重新加载以更新状态
    } catch (error) {
      showToast('同步失败', 'error');
    } finally {
      setSyncingFileId(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedFile) return;
    try {
      await deleteFile(selectedFile.id);
      setShowDeleteDialog(false);
      setSelectedFile(null);
      showToast('删除成功', 'success');
    } catch (error) {
      showToast('删除失败', 'error');
    }
  };

  const handleImportFromClaudeMd = async (name: string, description?: string) => {
    try {
      await importFromClaudeMd(name, description);
      setShowImportDialog(false);
      showToast('导入成功', 'success');
    } catch (error) {
      showToast('导入失败', 'error');
    }
  };

  const openPreview = (file: PromptFile) => {
    setSelectedFile(file);
    setShowPreviewDialog(true);
  };

  const openEdit = (file: PromptFile) => {
    setSelectedFile(file);
    setShowEditDialog(true);
  };

  const openDelete = (file: PromptFile) => {
    setSelectedFile(file);
    setShowDeleteDialog(true);
  };

  const filteredFiles = files.filter((file) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      file.name.toLowerCase().includes(query) ||
      file.description?.toLowerCase().includes(query) ||
      file.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  const activeFiles = filteredFiles.filter((f) => f.is_active);
  const inactiveFiles = filteredFiles.filter((f) => !f.is_active);

  return (
    <div className={cn('h-full flex flex-col overflow-hidden', className)}>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="container mx-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {onBack && (
                <Button variant="ghost" size="sm" onClick={onBack} className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  {t('app.back')}
                </Button>
              )}
              <div>
                <h1 className="text-3xl font-bold">{t('promptFiles.title')}</h1>
                <p className="text-muted-foreground">{t('promptFiles.description')}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowImportDialog(true)}>
                <Upload className="mr-2 h-4 w-4" />
                从 CLAUDE.md 导入
              </Button>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                新建
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索提示词文件..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Active File */}
          {!isLoading && activeFiles.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                当前使用
              </h2>
              {activeFiles.map((file) => (
                <Card key={file.id} className="border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          {file.name}
                          <Badge variant="secondary" className="bg-green-100 dark:bg-green-900">
                            使用中
                          </Badge>
                        </CardTitle>
                        {file.description && (
                          <CardDescription className="mt-2">{file.description}</CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                      {file.tags.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          {file.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {file.tags.length > 3 && <span className="text-xs">+{file.tags.length - 3}</span>}
                        </div>
                      )}
                      {file.last_used_at && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(file.last_used_at * 1000).toLocaleString('zh-CN')}
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2 flex-wrap">
                      <Button 
                        variant="default" 
                        size="sm" 
                        onClick={() => handleSync(file)}
                        disabled={syncingFileId === file.id}
                      >
                        {syncingFileId === file.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            同步中...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            同步文件
                          </>
                        )}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleApplyToCustom(file)}
                        disabled={applyingFileId === file.id}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        {t('promptFiles.applyToCustomPath')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openPreview(file)}>
                        <Eye className="mr-2 h-4 w-4" />
                        查看内容
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(file)}>
                        <Edit className="mr-2 h-4 w-4" />
                        编辑
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleDeactivate}>
                        取消使用
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* All Prompt Files */}
          {!isLoading && (
            <div>
              <h2 className="text-lg font-semibold mb-3">
                全部提示词文件 ({inactiveFiles.length})
              </h2>
              {inactiveFiles.length === 0 ? (
                <Card className="p-12">
                  <div className="text-center">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                      {searchQuery ? '没有找到匹配的提示词文件' : '还没有提示词文件'}
                    </p>
                    {!searchQuery && (
                      <Button onClick={() => setShowCreateDialog(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        创建第一个提示词文件
                      </Button>
                    )}
                  </div>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inactiveFiles.map((file) => (
                    <Card key={file.id} className="hover:shadow-md transition-shadow flex flex-col">
                      <CardHeader className="flex-1">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <FileText className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{file.name}</span>
                        </CardTitle>
                        <CardDescription className="text-sm line-clamp-2 min-h-[1.25rem]">
                          {file.description || ' '}
                        </CardDescription>
                        {file.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {file.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {file.tags.length > 3 && (
                              <span className="text-xs text-muted-foreground">
                                +{file.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-2 pt-4">
                        <Button
                          className="w-full"
                          size="sm"
                          onClick={() => handleApply(file)}
                          disabled={applyingFileId === file.id}
                        >
                          {applyingFileId === file.id ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              应用中...
                            </>
                          ) : (
                            <>
                              <Play className="mr-2 h-4 w-4 flex-shrink-0" />
                              使用此文件
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => handleApplyToCustom(file)}
                          disabled={applyingFileId === file.id}
                        >
                          <Play className="mr-2 h-4 w-4" />
                          {t('promptFiles.applyToCustomPath')}
                        </Button>
                        <div className="flex gap-2 justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => openPreview(file)}
                            title="查看内容"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => openEdit(file)}
                            title="编辑"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => openDelete(file)}
                            title="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Delete Confirmation Dialog */}
          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>删除提示词文件</DialogTitle>
                <DialogDescription>
                  确定要删除这个提示词文件吗？此操作无法撤销。
                </DialogDescription>
              </DialogHeader>
              {selectedFile && (
                <div className="py-4">
                  <p className="font-medium">{selectedFile.name}</p>
                  {selectedFile.description && (
                    <p className="text-sm text-muted-foreground mt-1">{selectedFile.description}</p>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                  取消
                </Button>
                <Button variant="destructive" onClick={handleDelete}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Import Dialog */}
          <ImportFromClaudeMdDialog
            open={showImportDialog}
            onOpenChange={setShowImportDialog}
            onImport={handleImportFromClaudeMd}
          />

          {/* Create/Edit Dialogs */}
          {showCreateDialog && (
            <PromptFileEditor
              open={showCreateDialog}
              onOpenChange={setShowCreateDialog}
              onSuccess={() => {
                setShowCreateDialog(false);
                showToast('创建成功', 'success');
              }}
            />
          )}

          {showEditDialog && selectedFile && (
            <PromptFileEditor
              open={showEditDialog}
              onOpenChange={setShowEditDialog}
              file={selectedFile}
              onSuccess={() => {
                setShowEditDialog(false);
                setSelectedFile(null);
                showToast('更新成功', 'success');
              }}
            />
          )}

          {/* Preview Dialog */}
          {showPreviewDialog && selectedFile && (
            <PromptFilePreview
              open={showPreviewDialog}
              onOpenChange={setShowPreviewDialog}
              file={selectedFile}
              onEdit={() => {
                setShowPreviewDialog(false);
                openEdit(selectedFile);
              }}
              onApply={() => {
                setShowPreviewDialog(false);
                handleApply(selectedFile);
              }}
            />
          )}
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 right-4 z-50"
          >
            <Alert variant={toast.type === 'error' ? 'destructive' : 'default'} className="shadow-lg">
              {toast.type === 'success' ? (
                <Check className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{toast.message}</AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Import from CLAUDE.md Dialog
const ImportFromClaudeMdDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (name: string, description?: string) => Promise<void>;
}> = ({ open, onOpenChange, onImport }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (!name.trim()) return;
    setImporting(true);
    try {
      await onImport(name, description || undefined);
      setName('');
      setDescription('');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>从 CLAUDE.md 导入</DialogTitle>
          <DialogDescription>导入当前项目的 CLAUDE.md 文件作为提示词模板</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">文件名称 *</label>
            <Input
              placeholder="例如: 我的项目指南"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">描述</label>
            <Input
              placeholder="简短描述这个提示词文件的用途"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleImport} disabled={!name.trim() || importing}>
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                导入中...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                导入
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PromptFilesManager;
