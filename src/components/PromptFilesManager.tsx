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
  FolderOpen,
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
import { save, open as openFileDialog } from '@tauri-apps/plugin-dialog';

interface PromptFilesManagerProps {
  onBack?: () => void;
  className?: string;
  /** Path of the current project (used to import the project's CLAUDE.md) */
  projectPath?: string;
}

export const PromptFilesManager: React.FC<PromptFilesManagerProps> = ({ onBack, className, projectPath }) => {
  const { t, currentLanguage } = useTranslation();
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
      showToast(t('promptFiles.appliedTo', { path }), 'success');
    } catch (error) {
      showToast(t('promptFiles.applyFailed'), 'error');
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
          { name: t('promptFiles.allFilesFilter'), extensions: ['*'] },
        ],
      });
      if (!selectedPath) return; // 用户取消

      setApplyingFileId(file.id);
      const resultPath = await applyFile(file.id, String(selectedPath));
      showToast(t('promptFiles.appliedTo', { path: resultPath }), 'success');
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
      showToast(t('promptFiles.deactivateSuccess'), 'success');
    } catch (error) {
      showToast(t('promptFiles.deactivateFailed'), 'error');
    }
  };

  const handleSync = async (file: PromptFile) => {
    setSyncingFileId(file.id);
    try {
      // 同步当前激活的文件到 ~/.claude/CLAUDE.md
      const path = await applyFile(file.id);
      showToast(t('promptFiles.syncSuccess', { path }), 'success');
      await loadFiles(); // 重新加载以更新状态
    } catch (error) {
      showToast(t('promptFiles.syncFailed'), 'error');
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
      showToast(t('promptFiles.deleteSuccess'), 'success');
    } catch (error) {
      showToast(t('promptFiles.deleteFailed'), 'error');
    }
  };

  const handleImportFromClaudeMd = async (name: string, description?: string, sourcePath?: string) => {
    try {
      await importFromClaudeMd(name, description, sourcePath);
      setShowImportDialog(false);
      showToast(t('promptFiles.importSuccess'), 'success');
    } catch (error) {
      const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      showToast(detail ? t('promptFiles.importFailedWithDetail', { detail }) : t('promptFiles.importFailed'), 'error');
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
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
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
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                {t('promptFiles.importFromClaudeMd')}
              </Button>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                {t('promptFiles.create')}
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder={t('promptFiles.searchPlaceholder')}
              aria-label={t('promptFiles.searchPlaceholder')}
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
                <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />
                {t('promptFiles.currentActive')}
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
                            {t('promptFiles.inUse')}
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
                          {new Date(file.last_used_at * 1000).toLocaleString(currentLanguage)}
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
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                            {t('promptFiles.syncing')}
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                            {t('promptFiles.syncFile')}
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
                        <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                        {t('promptFiles.viewContent')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(file)}>
                        <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
                        {t('promptFiles.edit')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleDeactivate}>
                        {t('promptFiles.deactivate')}
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
                {t('promptFiles.allFiles')} ({inactiveFiles.length})
              </h2>
              {inactiveFiles.length === 0 ? (
                <Card className="p-12">
                  <div className="text-center">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                      {searchQuery ? t('promptFiles.noMatchingFiles') : t('promptFiles.noFiles')}
                    </p>
                    {!searchQuery && (
                      <Button onClick={() => setShowCreateDialog(true)}>
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                        {t('promptFiles.createFirst')}
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
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                              {t('promptFiles.applying')}
                            </>
                          ) : (
                            <>
                              <Play className="mr-2 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                              {t('promptFiles.useFile')}
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
                            title={t('promptFiles.viewContent')}
                            aria-label={t('promptFiles.viewContent')}
                          >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => openEdit(file)}
                            title={t('promptFiles.edit')}
                            aria-label={t('promptFiles.edit')}
                          >
                            <Edit className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => openDelete(file)}
                            title={t('app.delete')}
                            aria-label={t('app.delete')}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
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
                <DialogTitle>{t('promptFiles.deleteFile')}</DialogTitle>
                <DialogDescription>
                  {t('promptFiles.deleteConfirm')}
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
                  {t('app.cancel')}
                </Button>
                <Button variant="destructive" onClick={handleDelete}>
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t('app.delete')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Import Dialog */}
          <ImportFromClaudeMdDialog
            open={showImportDialog}
            onOpenChange={setShowImportDialog}
            onImport={handleImportFromClaudeMd}
            projectPath={projectPath}
          />

          {/* Create/Edit Dialogs */}
          {showCreateDialog && (
            <PromptFileEditor
              open={showCreateDialog}
              onOpenChange={setShowCreateDialog}
              onSuccess={() => {
                setShowCreateDialog(false);
                showToast(t('promptFiles.createSuccess'), 'success');
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
                showToast(t('promptFiles.updateSuccess'), 'success');
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
type ImportSource = 'project' | 'global' | 'custom';

const joinPath = (dir: string, file: string): string => {
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  return dir.endsWith('/') || dir.endsWith('\\') ? `${dir}${file}` : `${dir}${sep}${file}`;
};

const ImportFromClaudeMdDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (name: string, description?: string, sourcePath?: string) => Promise<void>;
  projectPath?: string;
}> = ({ open, onOpenChange, onImport, projectPath }) => {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [importing, setImporting] = useState(false);
  const [source, setSource] = useState<ImportSource>(projectPath ? 'project' : 'global');
  const [customPath, setCustomPath] = useState('');

  // Reset the default source whenever the dialog opens / project changes
  useEffect(() => {
    if (open) {
      setSource(projectPath ? 'project' : 'global');
    }
  }, [open, projectPath]);

  const projectClaudeMd = projectPath ? joinPath(projectPath, 'CLAUDE.md') : undefined;

  const resolvedSourcePath: string | undefined =
    source === 'project' ? projectClaudeMd
    : source === 'custom' ? (customPath.trim() || undefined)
    : undefined; // global: backend defaults to ~/.claude/CLAUDE.md

  const handleBrowse = async () => {
    try {
      const selected = await openFileDialog({
        multiple: false,
        directory: false,
        defaultPath: projectPath,
        filters: [
          { name: 'Markdown', extensions: ['md', 'markdown'] },
          { name: t('promptFiles.allFilesFilter'), extensions: ['*'] },
        ],
      });
      if (typeof selected === 'string' && selected) {
        setCustomPath(selected);
        setSource('custom');
        if (!name.trim()) {
          const fileName = selected.split(/[\\/]/).pop() || '';
          setName(fileName.replace(/\.(md|markdown)$/i, ''));
        }
      }
    } catch (error) {
      console.error('Failed to open file dialog:', error);
    }
  };

  const handleImport = async () => {
    if (!name.trim()) return;
    if (source === 'custom' && !resolvedSourcePath) return;
    setImporting(true);
    try {
      await onImport(name, description || undefined, resolvedSourcePath);
      setName('');
      setDescription('');
      setCustomPath('');
    } finally {
      setImporting(false);
    }
  };

  const sourceOption = (value: ImportSource, label: string, detail?: string, disabled = false) => (
    <label
      className={cn(
        'flex items-start gap-2 rounded-md border p-2 text-sm cursor-pointer',
        source === value ? 'border-primary bg-accent/50' : 'border-border',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <input
        type="radio"
        name="claude-md-source"
        className="mt-1"
        checked={source === value}
        disabled={disabled}
        onChange={() => setSource(value)}
      />
      <span className="min-w-0">
        <span className="font-medium">{label}</span>
        {detail && <span className="block text-xs text-muted-foreground break-all">{detail}</span>}
      </span>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('promptFiles.importFromClaudeMd')}</DialogTitle>
          <DialogDescription>{t('promptFiles.importDialogDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2" role="radiogroup" aria-labelledby="claude-md-source-label">
            <span id="claude-md-source-label" className="text-sm font-medium">{t('promptFiles.importSource')}</span>
            <div className="space-y-2">
              {sourceOption(
                'project',
                t('promptFiles.importSourceProject'),
                projectClaudeMd ?? t('promptFiles.noProjectDetected'),
                !projectClaudeMd
              )}
              {sourceOption('global', t('promptFiles.importSourceGlobal'), '~/.claude/CLAUDE.md')}
              {sourceOption('custom', t('promptFiles.importSourceCustom'))}
              {source === 'custom' && (
                <div className="flex gap-2">
                  <Input
                    placeholder={t('promptFiles.customPathPlaceholder')}
                    aria-label={t('promptFiles.customPathPlaceholder')}
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={handleBrowse}>
                    <FolderOpen className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t('promptFiles.browse')}
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="import-claude-md-name" className="text-sm font-medium">{t('promptFiles.fileName')} *</label>
            <Input
              id="import-claude-md-name"
              placeholder={t('promptFiles.importNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="import-claude-md-description" className="text-sm font-medium">{t('promptFiles.fileDescription')}</label>
            <Input
              id="import-claude-md-description"
              placeholder={t('promptFiles.importDescriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('app.cancel')}
          </Button>
          <Button
            onClick={handleImport}
            disabled={!name.trim() || importing || (source === 'custom' && !resolvedSourcePath)}
          >
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                {t('promptFiles.importing')}
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                {t('promptFiles.import')}
</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PromptFilesManager;
