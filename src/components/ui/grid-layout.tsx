import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface GridLayoutContainerProps {
  children: ReactNode;
  className?: string;
  gridTemplateColumns: string;
  isMobile: boolean;
  isTablet: boolean;
  showFileExplorer: boolean;
  showGitPanel: boolean;
  showTimeline: boolean;
}

/**
 * Grid-based layout container for responsive panel management
 */
export const GridLayoutContainer: React.FC<GridLayoutContainerProps> = ({
  children,
  className,
  gridTemplateColumns,
  isMobile,
  isTablet,
  showFileExplorer,
  showGitPanel,
  showTimeline,
}) => {
  // Mobile layout: Stack panels as overlays
  if (isMobile) {
    return (
      <div className={cn('relative h-full w-full overflow-hidden', className)}>
        {children}
        
        {/* Mobile overlay panels */}
        <AnimatePresence>
          {(showFileExplorer || showGitPanel || showTimeline) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 z-40"
              onClick={() => {
                // This will be handled by parent component
              }}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }
  
  // Tablet layout: Adaptive grid with optional sidebar
  if (isTablet) {
    return (
      <div 
        className={cn(
          'h-full w-full grid transition-all duration-300',
          className
        )}
        style={{
          gridTemplateColumns: showTimeline ? '1fr 320px' : '1fr',
          gap: 0,
        }}
      >
        <div className="grid h-full" style={{ gridTemplateColumns: gridTemplateColumns }}>
          {React.Children.toArray(children).slice(0, -1)}
        </div>
        {showTimeline && React.Children.toArray(children).slice(-1)}
      </div>
    );
  }
  
  // Desktop/Widescreen layout: Full grid
  return (
    <div 
      className={cn(
        'h-full w-full grid transition-all duration-300',
        className
      )}
      style={{
        gridTemplateColumns: gridTemplateColumns,
        gap: 0,
      }}
    >
      {children}
    </div>
  );
};

interface ResponsivePanelProps {
  children: ReactNode;
  isVisible: boolean;
  position: 'left' | 'right' | 'overlay';
  width?: number;
  isMobile: boolean;
  onClose?: () => void;
  className?: string;
  resizable?: boolean;
  onResize?: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
}

/**
 * Responsive panel component with mobile overlay support
 */
export const ResponsivePanel: React.FC<ResponsivePanelProps> = ({
  children,
  isVisible,
  position,
  width = 320,
  isMobile,
  onClose,
  className,
  resizable = false,
  onResize,
  minWidth = 200,
  maxWidth = 600,
}) => {
  const [isResizing, setIsResizing] = React.useState(false);
  const [currentWidth, setCurrentWidth] = React.useState(width);
  const panelRef = React.useRef<HTMLDivElement>(null);
  
  React.useEffect(() => {
    setCurrentWidth(width);
  }, [width]);
  
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!resizable) return;
    
    e.preventDefault();
    setIsResizing(true);
    
    const startX = e.clientX;
    const startWidth = currentWidth;
    
    const handleMouseMove = (e: MouseEvent) => {
      const diff = position === 'left' ? e.clientX - startX : startX - e.clientX;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + diff));
      setCurrentWidth(newWidth);
      onResize?.(newWidth);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  
  if (!isVisible) return null;
  
  // Mobile: Full screen overlay
  if (isMobile) {
    return (
      <motion.div
        initial={{ x: position === 'left' ? '-100%' : '100%' }}
        animate={{ x: 0 }}
        exit={{ x: position === 'left' ? '-100%' : '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={cn(
          'absolute inset-y-0 z-50 bg-background shadow-2xl',
          position === 'left' ? 'left-0' : 'right-0',
          'w-[85vw] max-w-sm',
          className
        )}
        ref={panelRef}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-accent z-10"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <div className="h-full overflow-y-auto">
          {children}
        </div>
      </motion.div>
    );
  }
  
  // Desktop: Integrated panel with optional resize
  return (
    <div
      ref={panelRef}
      className={cn(
        'relative h-full overflow-hidden border-border',
        position === 'left' && 'border-r',
        position === 'right' && 'border-l',
        className
      )}
      style={{ width: currentWidth }}
    >
      {resizable && (
        <div
          className={cn(
            'absolute top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors z-10',
            position === 'left' ? 'right-0' : 'left-0',
            isResizing && 'bg-primary/30'
          )}
          onMouseDown={handleMouseDown}
        />
      )}
      <div className="h-full overflow-y-auto">
        {children}
      </div>
    </div>
  );
};