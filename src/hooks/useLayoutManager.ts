import { useState, useEffect, useCallback } from 'react';

interface LayoutState {
  fileExplorerWidth: number;
  gitPanelWidth: number;
  timelineWidth: number;
  showFileExplorer: boolean;
  showGitPanel: boolean;
  showTimeline: boolean;
  splitPosition: number;
  isCompactMode: boolean;
  activeView: 'chat' | 'editor' | 'preview' | 'terminal';  // 新增终端视图
  editingFile: string | null;  // 新增：正在编辑的文件
  previewUrl: string | null;  // 新增：预览URL
  isTerminalMaximized: boolean;  // 新增：终端是否最大化
}

interface LayoutBreakpoints {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWidescreen: boolean;
  screenWidth: number;
  screenHeight: number;
}

const DEFAULT_LAYOUT: LayoutState = {
  fileExplorerWidth: 280,
  gitPanelWidth: 320,
  timelineWidth: 384,
  showFileExplorer: false,
  showGitPanel: false,
  showTimeline: false,
  splitPosition: 50,
  isCompactMode: false,
  activeView: 'chat',  // 默认显示聊天视图
  editingFile: null,
  previewUrl: null,
  isTerminalMaximized: false,  // 默认终端不最大化
};

const STORAGE_KEY = 'claudia_layout_preferences';

/**
 * Custom hook for managing responsive layout with persistent state
 */
export function useLayoutManager(projectPath?: string) {
  const [layout, setLayout] = useState<LayoutState>(DEFAULT_LAYOUT);
  const [breakpoints, setBreakpoints] = useState<LayoutBreakpoints>({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isWidescreen: false,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
  });
  
  // Load saved layout preferences
  useEffect(() => {
    const loadLayout = async () => {
      try {
        // Try to load project-specific layout first
        const key = projectPath ? `${STORAGE_KEY}_${projectPath.replace(/[^a-zA-Z0-9]/g, '_')}` : STORAGE_KEY;
        const saved = localStorage.getItem(key);
        
        if (saved) {
          const savedLayout = JSON.parse(saved) as Partial<LayoutState>;
          setLayout(prev => ({ ...prev, ...savedLayout }));
        }
      } catch (error) {
        console.error('Failed to load layout preferences:', error);
      }
    };
    
    loadLayout();
  }, [projectPath]);
  
  // Save layout changes
  const saveLayout = useCallback((newLayout: Partial<LayoutState>) => {
    const updated = { ...layout, ...newLayout };
    setLayout(updated);
    
    // Save to localStorage
    try {
      const key = projectPath ? `${STORAGE_KEY}_${projectPath.replace(/[^a-zA-Z0-9]/g, '_')}` : STORAGE_KEY;
      localStorage.setItem(key, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save layout preferences:', error);
    }
  }, [layout, projectPath]);
  
  // Update breakpoints on resize
  useEffect(() => {
    const updateBreakpoints = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      setBreakpoints({
        isMobile: width < 640,
        isTablet: width >= 640 && width < 1024,
        isDesktop: width >= 1024 && width < 1536,
        isWidescreen: width >= 1536,
        screenWidth: width,
        screenHeight: height,
      });
      
      // Auto-adjust layout for mobile
      if (width < 640) {
        saveLayout({
          isCompactMode: true,
          showFileExplorer: false,
          showGitPanel: false,
          showTimeline: false,
        });
      }
    };
    
    updateBreakpoints();
    window.addEventListener('resize', updateBreakpoints);
    return () => window.removeEventListener('resize', updateBreakpoints);
  }, [saveLayout]);
  
  // Panel toggle functions
  const toggleFileExplorer = useCallback(() => {
    const newState = !layout.showFileExplorer;
    
    // On mobile, close other panels when opening one
    if (breakpoints.isMobile && newState) {
      saveLayout({
        showFileExplorer: true,
        showGitPanel: false,
        showTimeline: false,
      });
    } else {
      saveLayout({ showFileExplorer: newState });
    }
  }, [layout.showFileExplorer, breakpoints.isMobile, saveLayout]);
  
  const toggleGitPanel = useCallback(() => {
    const newState = !layout.showGitPanel;
    
    // On mobile, close other panels when opening one
    if (breakpoints.isMobile && newState) {
      saveLayout({
        showFileExplorer: false,
        showGitPanel: true,
        showTimeline: false,
      });
    } else {
      saveLayout({ showGitPanel: newState });
    }
  }, [layout.showGitPanel, breakpoints.isMobile, saveLayout]);
  
  const toggleTimeline = useCallback(() => {
    const newState = !layout.showTimeline;
    
    // On mobile, close other panels when opening one
    if (breakpoints.isMobile && newState) {
      saveLayout({
        showFileExplorer: false,
        showGitPanel: false,
        showTimeline: true,
      });
    } else {
      saveLayout({ showTimeline: newState });
    }
  }, [layout.showTimeline, breakpoints.isMobile, saveLayout]);
  
  // Update panel width
  const setPanelWidth = useCallback((panel: 'fileExplorer' | 'gitPanel' | 'timeline', width: number) => {
    const key = `${panel}Width` as keyof LayoutState;
    saveLayout({ [key]: width });
  }, [saveLayout]);
  
  // Set split position
  const setSplitPosition = useCallback((position: number) => {
    saveLayout({ splitPosition: position });
  }, [saveLayout]);
  
  // Toggle compact mode
  const toggleCompactMode = useCallback(() => {
    saveLayout({ isCompactMode: !layout.isCompactMode });
  }, [layout.isCompactMode, saveLayout]);
  
  // Reset layout to defaults
  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    try {
      const key = projectPath ? `${STORAGE_KEY}_${projectPath.replace(/[^a-zA-Z0-9]/g, '_')}` : STORAGE_KEY;
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to reset layout:', error);
    }
  }, [projectPath]);
  
  // Calculate available content width
  const getContentWidth = useCallback(() => {
    let width = breakpoints.screenWidth;
    
    if (layout.showFileExplorer && !breakpoints.isMobile) {
      width -= layout.fileExplorerWidth;
    }
    if (layout.showGitPanel && !breakpoints.isMobile) {
      width -= layout.gitPanelWidth;
    }
    if (layout.showTimeline && !breakpoints.isMobile) {
      width -= layout.timelineWidth;
    }
    
    return width;
  }, [breakpoints, layout]);
  
  // Get grid template columns for CSS Grid layout
  const getGridTemplateColumns = useCallback(() => {
    const parts: string[] = [];
    
    // Mobile: stack everything
    if (breakpoints.isMobile) {
      return '1fr';
    }
    
    // Desktop: dynamic grid
    if (layout.showFileExplorer) {
      parts.push(`${layout.fileExplorerWidth}px`);
    }
    
    parts.push('1fr'); // Main content
    
    if (layout.showGitPanel) {
      parts.push(`${layout.gitPanelWidth}px`);
    }
    
    if (layout.showTimeline) {
      parts.push(`${layout.timelineWidth}px`);
    }
    
    return parts.join(' ');
  }, [breakpoints.isMobile, layout]);
  
  // Get responsive class names
  const getResponsiveClasses = useCallback(() => {
    const classes: string[] = [];
    
    if (breakpoints.isMobile) {
      classes.push('mobile-layout');
    } else if (breakpoints.isTablet) {
      classes.push('tablet-layout');
    } else if (breakpoints.isDesktop) {
      classes.push('desktop-layout');
    } else if (breakpoints.isWidescreen) {
      classes.push('widescreen-layout');
    }
    
    if (layout.isCompactMode) {
      classes.push('compact-mode');
    }
    
    return classes.join(' ');
  }, [breakpoints, layout.isCompactMode]);
  
  // 打开文件编辑器
  const openFileEditor = useCallback((filePath: string) => {
    saveLayout({
      activeView: 'editor',
      editingFile: filePath,
      previewUrl: null,  // 关闭预览
    });
  }, [saveLayout]);
  
  // 关闭文件编辑器
  const closeFileEditor = useCallback(() => {
    saveLayout({
      activeView: 'chat',
      editingFile: null,
    });
  }, [saveLayout]);
  
  // 打开预览
  const openPreview = useCallback((url: string) => {
    saveLayout({
      activeView: 'preview',
      previewUrl: url,
      editingFile: null,  // 关闭编辑器
    });
  }, [saveLayout]);
  
  // 关闭预览
  const closePreview = useCallback(() => {
    saveLayout({
      activeView: 'chat',
      previewUrl: null,
    });
  }, [saveLayout]);
  
  // 切换到聊天视图
  const switchToChatView = useCallback(() => {
    saveLayout({
      activeView: 'chat',
      editingFile: null,
      previewUrl: null,
    });
  }, [saveLayout]);

  // 打开终端
  const openTerminal = useCallback(() => {
    saveLayout({
      activeView: 'terminal',
      editingFile: null,
      previewUrl: null,
    });
  }, [saveLayout]);

  // 关闭终端
  const closeTerminal = useCallback(() => {
    saveLayout({
      activeView: 'chat',
    });
  }, [saveLayout]);

  // 切换终端最大化状态
  const toggleTerminalMaximize = useCallback(() => {
    saveLayout({
      isTerminalMaximized: !layout.isTerminalMaximized,
    });
  }, [layout.isTerminalMaximized, saveLayout]);
  
  return {
    layout,
    breakpoints,
    toggleFileExplorer,
    toggleGitPanel,
    toggleTimeline,
    setPanelWidth,
    setSplitPosition,
    toggleCompactMode,
    resetLayout,
    getContentWidth,
    getGridTemplateColumns,
    getResponsiveClasses,
    saveLayout,
    // 新增的方法
    openFileEditor,
    closeFileEditor,
    openPreview,
    closePreview,
    switchToChatView,
    // 终端相关方法
    openTerminal,
    closeTerminal,
    toggleTerminalMaximize,
  };
}