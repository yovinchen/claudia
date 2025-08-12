import React from 'react';
import { cn } from '@/lib/utils';

interface ChatViewProps {
  projectPathInput?: React.ReactNode;
  messagesList: React.ReactNode;
  floatingInput?: React.ReactNode;
  floatingElements?: React.ReactNode;
  className?: string;
}

export const ChatView: React.FC<ChatViewProps> = ({
  projectPathInput,
  messagesList,
  floatingInput,
  floatingElements,
  className
}) => {
  return (
    <div className={cn('h-full w-full flex flex-col relative', className)}>
      {/* 项目路径输入（如果提供） */}
      {projectPathInput && (
        <div className="shrink-0">
          {projectPathInput}
        </div>
      )}
      
      {/* 消息列表区域 - 占据大部分空间 */}
      <div className="flex-1 min-h-0">
        {messagesList}
      </div>
      
      {/* 浮动输入框 - 最小化高度 */}
      {floatingInput && (
        <div className="shrink-0 relative">
          {floatingInput}
        </div>
      )}
      
      {/* 其他浮动元素（如队列提示、Token计数器等） */}
      {floatingElements && (
        <div className="absolute inset-0 pointer-events-none z-30">
          <div className="relative h-full w-full">
            {floatingElements}
          </div>
        </div>
      )}
    </div>
  );
};