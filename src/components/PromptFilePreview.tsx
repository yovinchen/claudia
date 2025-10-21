import React from 'react';
import { Edit, Play, Tag as TagIcon, Clock, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';
import type { PromptFile } from '@/lib/api';

interface PromptFilePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: PromptFile;
  onEdit: () => void;
  onApply: () => void;
}

export const PromptFilePreview: React.FC<PromptFilePreviewProps> = ({
  open,
  onOpenChange,
  file,
  onEdit,
  onApply,
}) => {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{file.name}</DialogTitle>
          {file.description && (
            <DialogDescription className="text-base mt-2">{file.description}</DialogDescription>
          )}
        </DialogHeader>

        {/* Metadata */}
        <div className="flex flex-wrap gap-4 py-4 border-y text-sm text-muted-foreground">
          {file.tags.length > 0 && (
            <div className="flex items-center gap-2">
              <TagIcon className="h-4 w-4" />
              <div className="flex gap-1 flex-wrap">
                {file.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            创建于: {formatDate(file.created_at)}
          </div>
          {file.updated_at !== file.created_at && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              更新于: {formatDate(file.updated_at)}
            </div>
          )}
          {file.last_used_at && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              最后使用: {formatDate(file.last_used_at)}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="prose prose-sm dark:prose-invert max-w-none py-4">
          <ReactMarkdown>{file.content}</ReactMarkdown>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onEdit}>
              <Edit className="mr-2 h-4 w-4" />
              编辑
            </Button>
            {!file.is_active && (
              <Button onClick={onApply}>
                <Play className="mr-2 h-4 w-4" />
                使用此文件
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PromptFilePreview;

