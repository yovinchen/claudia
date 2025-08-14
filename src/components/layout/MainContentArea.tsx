import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MainContentAreaProps {
  children: ReactNode;
  className?: string;
  isEditing?: boolean;
}

export const MainContentArea: React.FC<MainContentAreaProps> = ({
  children,
  className,
  isEditing = false
}) => {
  return (
    <div className={cn(
      'h-full w-full flex flex-col overflow-hidden',
      'bg-background',
      isEditing && 'relative',
      className
    )}>
      {children}
    </div>
  );
};