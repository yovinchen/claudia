import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface SidePanelProps {
  children: ReactNode;
  title?: string;
  onClose?: () => void;
  className?: string;
  position?: 'left' | 'right';
}

export const SidePanel: React.FC<SidePanelProps> = ({
  children,
  title,
  onClose,
  className,
  position = 'left'
}) => {
  return (
    <div className={cn(
      'flex flex-col h-full',
      'bg-background',
      position === 'left' ? 'border-r' : 'border-l',
      'border-border',
      className
    )}>
      {title && (
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h3 className="text-sm font-semibold">{title}</h3>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-6 w-6"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
};