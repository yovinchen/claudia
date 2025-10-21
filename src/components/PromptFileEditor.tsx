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
    setTags(tags.filter((t) => t !== tag));
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
          <DialogTitle>{file ? '编辑提示词文件' : '创建提示词文件'}</DialogTitle>
          <DialogDescription>
            {file ? '修改提示词文件的内容和信息' : '创建一个新的提示词文件模板'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">文件名称 *</Label>
              <Input
                id="name"
                placeholder="例如: React 项目指南"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">描述</Label>
              <Input
                id="description"
                placeholder="简短描述..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>标签</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                  {tag}
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-destructive"
                    onClick={() => handleRemoveTag(tag)}
                  />
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="添加标签（按 Enter）"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <Button type="button" variant="outline" onClick={handleAddTag}>
                <TagIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>文件内容 *</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? (
                  <>
                    <EyeOff className="mr-2 h-4 w-4" />
                    编辑
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-4 w-4" />
                    预览
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
            取消
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || !content.trim() || saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                保存
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PromptFileEditor;

