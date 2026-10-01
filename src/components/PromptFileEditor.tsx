import React, { useState, useEffect } from 'react';
import { Loader2, Save, Eye, EyeOff, X, Tag as TagIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import MonacoEditor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import { usePromptFilesStore } from '@/stores/promptFilesStore';
import type { PromptFile } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

interface PromptFileEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file?: PromptFile;
  onSuccess: () => void;
}

export const PromptFileEditor: React.FC<PromptFileEditorProps> = ({
  open,
  onOpenChange,
  file,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const { createFile, updateFile } = usePromptFilesStore();
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (file) {
      setName(file.name);
      setDescription(file.description || '');
      setContent(file.content);
      setTags(file.tags);
    } else {
      setName('');
      setDescription('');
      setContent('');
      setTags([]);
    }
  }, [file, open]);

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((existing) => existing !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      if (file) {
        await updateFile({
          id: file.id,
          name: name.trim(),
          description: description.trim() || undefined,
          content: content,
          tags,
        });
      } else {
        await createFile({
          name: name.trim(),
          description: description.trim() || undefined,
          content: content,
          tags,
        });
      }
      onSuccess();
    } catch (error) {
      // Error handling is done in the store
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{file ? t('promptFiles.editFile') : t('promptFiles.createFile')}</DialogTitle>
          <DialogDescription>
            {file ? t('promptFiles.editFileDesc') : t('promptFiles.createFileDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('promptFiles.fileName')} *</Label>
              <Input
                id="name"
                placeholder={t('promptFiles.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('promptFiles.fileDescription')}</Label>
              <Input
                id="description"
                placeholder={t('promptFiles.descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label htmlFor="prompt-file-tag-input">{t('promptFiles.tags')}</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                  {tag}
                  <button
                    type="button"
                    className="rounded-sm hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={() => handleRemoveTag(tag)}
                    aria-label={t('promptFiles.removeTag', { tag })}
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                id="prompt-file-tag-input"
                placeholder={t('promptFiles.tagInputPlaceholder')}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <Button type="button" variant="outline" onClick={handleAddTag} aria-label={t('promptFiles.addTag')}>
                <TagIcon className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {/* Content Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('promptFiles.fileContent')} *</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? (
                  <>
                    <EyeOff className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t('promptFiles.edit')}
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t('promptFiles.preview')}
                  </>
                )}
              </Button>
            </div>

            {showPreview ? (
              <div className="border rounded-lg p-4 max-h-[400px] overflow-y-auto prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{content}</ReactMarkdown>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden" style={{ height: '400px' }}>
                <MonacoEditor
                  language="markdown"
                  theme="vs-dark"
                  value={content}
                  onChange={(value) => setContent(value || '')}
                  options={{
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 14,
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    automaticLayout: true,
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('app.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || !content.trim() || saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                {t('saving')}
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                {t('app.save')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PromptFileEditor;

