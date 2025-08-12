import React, { ReactNode, useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface LayoutPanel {
  id: string;
  content: ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
  visible?: boolean;
  position?: 'left' | 'center' | 'right';
  className?: string;
}

interface FlexLayoutContainerProps {
  panels: LayoutPanel[];
  className?: string;
  mainContentId: string;
  onPanelResize?: (panelId: string, width: number) => void;
  savedWidths?: Record<string, number>;
}

export const FlexLayoutContainer: React.FC<FlexLayoutContainerProps> = ({
  panels,
  className,
  mainContentId,
  onPanelResize,
  savedWidths = {}
}) => {
  const [panelWidths, setPanelWidths] = useState<Record<string, number>>({});
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartWidth, setDragStartWidth] = useState(0);

  // 初始化面板宽度
  useEffect(() => {
    const initialWidths: Record<string, number> = {};
    panels.forEach(panel => {
      if (panel.visible !== false && panel.id !== mainContentId) {
        initialWidths[panel.id] = savedWidths[panel.id] || panel.defaultWidth || 280;
      }
    });
    setPanelWidths(initialWidths);
  }, [panels, mainContentId, savedWidths]);

  // 处理拖拽开始
  const handleDragStart = useCallback((e: React.MouseEvent, panelId: string) => {
    e.preventDefault();
    setIsDragging(panelId);
    setDragStartX(e.clientX);
    setDragStartWidth(panelWidths[panelId] || 280);
  }, [panelWidths]);

  // 处理拖拽移动
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const panel = panels.find(p => p.id === isDragging);
      if (!panel) return;

      const delta = panel.position === 'left' 
        ? e.clientX - dragStartX 
        : dragStartX - e.clientX;
      
      const newWidth = Math.max(
        panel.minWidth || 200,
        Math.min(panel.maxWidth || 600, dragStartWidth + delta)
      );

      setPanelWidths(prev => ({
        ...prev,
        [isDragging]: newWidth
      }));

      if (onPanelResize) {
        onPanelResize(isDragging, newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStartX, dragStartWidth, panels, onPanelResize]);

  // 渲染面板
  const renderPanel = (panel: LayoutPanel) => {
    if (panel.visible === false) return null;

    const isMain = panel.id === mainContentId;
    const width = isMain ? 'flex-1' : `${panelWidths[panel.id] || panel.defaultWidth || 280}px`;

    return (
      <div
        key={panel.id}
        className={cn(
          'relative h-full',
          isMain ? 'flex-1 min-w-0' : 'overflow-hidden',
          panel.className
        )}
        style={!isMain ? { width, flexShrink: 0 } : undefined}
      >
        {panel.content}
        
        {/* 调整手柄 */}
        {!isMain && panel.resizable !== false && (
          <div
            className={cn(
              'absolute top-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors z-50',
              panel.position === 'left' ? 'right-0' : 'left-0',
              isDragging === panel.id && 'bg-primary/40'
            )}
            onMouseDown={(e) => handleDragStart(e, panel.id)}
          >
            <div className="absolute inset-y-0 w-4 -left-1.5" />
          </div>
        )}
      </div>
    );
  };

  // 按位置排序面板
  const sortedPanels = [...panels].sort((a, b) => {
    const positionOrder = { left: 0, center: 1, right: 2 };
    const aPos = a.position || (a.id === mainContentId ? 'center' : 'left');
    const bPos = b.position || (b.id === mainContentId ? 'center' : 'left');
    return positionOrder[aPos] - positionOrder[bPos];
  });

  return (
    <div className={cn('flex h-full w-full', className)}>
      {sortedPanels.map(renderPanel)}
    </div>
  );
};