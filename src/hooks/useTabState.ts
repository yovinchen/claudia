import { useCallback, useMemo } from 'react';
import { useTabContext } from '@/contexts/TabContext';
import { Tab } from '@/contexts/TabContext';
import { useTranslation } from '@/hooks/useTranslation';

interface UseTabStateReturn {
  // State
  tabs: Tab[];
  activeTab: Tab | undefined;
  activeTabId: string | null;
  tabCount: number;
  chatTabCount: number;
  agentTabCount: number;
  
  // Operations
  createChatTab: (projectId?: string, title?: string) => string;
  createAgentTab: (agentRunId: string, agentName: string) => string;
  createAgentExecutionTab: (agent: any, tabId: string) => string;
  createProjectsTab: () => string | null;
  createUsageTab: () => string | null;
  createMCPTab: () => string | null;
  createSettingsTab: () => string | null;
  createClaudeMdTab: () => string | null;
  createClaudeFileTab: (fileId: string, fileName: string) => string;
  createCreateAgentTab: () => string;
  createImportAgentTab: () => string;
  closeTab: (id: string, force?: boolean) => Promise<boolean>;
  closeCurrentTab: () => Promise<boolean>;
  switchToTab: (id: string) => void;
  switchToNextTab: () => void;
  switchToPreviousTab: () => void;
  switchToTabByIndex: (index: number) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;
  updateTabTitle: (id: string, title: string) => void;
  updateTabStatus: (id: string, status: Tab['status']) => void;
  markTabAsChanged: (id: string, hasChanges: boolean) => void;
  findTabBySessionId: (sessionId: string) => Tab | undefined;
  findTabByAgentRunId: (agentRunId: string) => Tab | undefined;
  findTabByType: (type: Tab['type']) => Tab | undefined;
  canAddTab: () => boolean;
}

export const useTabState = (): UseTabStateReturn => {
  const { t } = useTranslation();
  const {
    tabs,
    activeTabId,
    addTab,
    removeTab,
    updateTab,
    setActiveTab,
    getTabById,
    getTabsByType
  } = useTabContext();

  const activeTab = useMemo(() => 
    activeTabId ? getTabById(activeTabId) : undefined,
    [activeTabId, getTabById]
  );

  const tabCount = tabs.length;
  const chatTabCount = useMemo(() => getTabsByType('chat').length, [getTabsByType]);
  const agentTabCount = useMemo(() => getTabsByType('agent').length, [getTabsByType]);

  const createChatTab = useCallback((projectId?: string, title?: string): string => {
    const tabTitle = title || `Chat ${chatTabCount + 1}`;
    return addTab({
      type: 'chat',
      title: tabTitle,
      sessionId: projectId,
      status: 'idle',
      hasUnsavedChanges: false,
      icon: 'message-square'
    });
  }, [addTab, chatTabCount]);

  const createAgentTab = useCallback((agentRunId: string, agentName: string): string => {
    // Check if tab already exists
    const existingTab = tabs.find(tab => tab.agentRunId === agentRunId);
    if (existingTab) {
      setActiveTab(existingTab.id);
      return existingTab.id;
    }

    return addTab({
      type: 'agent',
      title: agentName,
      agentRunId,
      status: 'running',
      hasUnsavedChanges: false,
      icon: 'bot'
    });
  }, [addTab, tabs, setActiveTab]);

  const createProjectsTab = useCallback((): string | null => {
    // Check if projects tab already exists (singleton)
    const existingTab = tabs.find(tab => tab.type === 'projects');
    if (existingTab) {
      setActiveTab(existingTab.id);
      return existingTab.id;
    }

    return addTab({
      type: 'projects',
      title: t('ccProjects'),
      status: 'idle',
      hasUnsavedChanges: false,
      icon: 'folder'
    });
  }, [addTab, tabs, setActiveTab, t]);

  const createUsageTab = useCallback((): string | null => {
    // Check if usage tab already exists (singleton)
    const existingTab = tabs.find(tab => tab.type === 'usage');
    if (existingTab) {
      setActiveTab(existingTab.id);
      return existingTab.id;
    }

    return addTab({
      type: 'usage',
      title: t('messages.usage'),
      status: 'idle',
      hasUnsavedChanges: false,
      icon: 'bar-chart'
    });
  }, [addTab, tabs, setActiveTab, t]);

  const createMCPTab = useCallback((): string | null => {
    // Check if MCP tab already exists (singleton)
    const existingTab = tabs.find(tab => tab.type === 'mcp');
    if (existingTab) {
      setActiveTab(existingTab.id);
      return existingTab.id;
    }

    return addTab({
      type: 'mcp',
      title: t('messages.mcpServersTitle'),
      status: 'idle',
      hasUnsavedChanges: false,
      icon: 'server'
    });
  }, [addTab, tabs, setActiveTab, t]);

  const createSettingsTab = useCallback((): string | null => {
    // Check if settings tab already exists (singleton)
    const existingTab = tabs.find(tab => tab.type === 'settings');
    if (existingTab) {
      setActiveTab(existingTab.id);
      return existingTab.id;
    }

    return addTab({
      type: 'settings',
      title: t('settings.title'),
      status: 'idle',
      hasUnsavedChanges: false,
      icon: 'settings'
    });
  }, [addTab, tabs, setActiveTab, t]);

  const createClaudeMdTab = useCallback((): string | null => {
    // Check if claude-md tab already exists (singleton)
    const existingTab = tabs.find(tab => tab.type === 'claude-md');
    if (existingTab) {
      setActiveTab(existingTab.id);
      return existingTab.id;
    }

    return addTab({
      type: 'claude-md',
      title: t('messages.claudemdTitle'),
      status: 'idle',
      hasUnsavedChanges: false,
      icon: 'file-text'
    });
  }, [addTab, tabs, setActiveTab, t]);

  const createClaudeFileTab = useCallback((fileId: string, fileName: string): string => {
    // Check if tab already exists for this file
    const existingTab = tabs.find(tab => tab.type === 'claude-file' && tab.claudeFileId === fileId);
    if (existingTab) {
      setActiveTab(existingTab.id);
      return existingTab.id;
    }

    return addTab({
      type: 'claude-file',
      title: fileName,
      claudeFileId: fileId,
      status: 'idle',
      hasUnsavedChanges: false,
      icon: 'file-text'
    });
  }, [addTab, tabs, setActiveTab]);

  const createAgentExecutionTab = useCallback((agent: any, _tabId: string): string => {
    return addTab({
      type: 'agent-execution',
      title: t('messages.runAgent', { name: agent.name }),
      agentData: agent,
      status: 'idle',
      hasUnsavedChanges: false,
      icon: 'bot'
    });
  }, [addTab, t]);

  const createCreateAgentTab = useCallback((): string => {
    // Check if create agent tab already exists (singleton)
    const existingTab = tabs.find(tab => tab.type === 'create-agent');
    if (existingTab) {
      setActiveTab(existingTab.id);
      return existingTab.id;
    }

    return addTab({
      type: 'create-agent',
      title: t('messages.createAgent'),
      status: 'idle',
      hasUnsavedChanges: false,
      icon: 'plus'
    });
  }, [addTab, tabs, setActiveTab, t]);

  const createImportAgentTab = useCallback((): string => {
    // Check if import agent tab already exists (singleton)
    const existingTab = tabs.find(tab => tab.type === 'import-agent');
    if (existingTab) {
      setActiveTab(existingTab.id);
      return existingTab.id;
    }

    return addTab({
      type: 'import-agent',
      title: t('messages.importAgent'),
      status: 'idle',
      hasUnsavedChanges: false,
      icon: 'import'
    });
  }, [addTab, tabs, setActiveTab, t]);

  const closeTab = useCallback(async (id: string, force: boolean = false): Promise<boolean> => {
    const tab = getTabById(id);
    if (!tab) return true;

    // Check for unsaved changes
    if (!force && tab.hasUnsavedChanges) {
      // In a real implementation, you'd show a confirmation dialog here
      const confirmed = window.confirm(t('messages.unsavedChangesCloseConfirm', { title: tab.title }));
      if (!confirmed) return false;
    }

    removeTab(id);
    return true;
  }, [getTabById, removeTab, t]);

  const closeCurrentTab = useCallback(async (): Promise<boolean> => {
    if (!activeTabId) return true;
    return closeTab(activeTabId);
  }, [activeTabId, closeTab]);

  const switchToNextTab = useCallback(() => {
    if (tabs.length === 0) return;
    
    const currentIndex = tabs.findIndex(tab => tab.id === activeTabId);
    const nextIndex = (currentIndex + 1) % tabs.length;
    setActiveTab(tabs[nextIndex].id);
  }, [tabs, activeTabId, setActiveTab]);

  const switchToPreviousTab = useCallback(() => {
    if (tabs.length === 0) return;
    
    const currentIndex = tabs.findIndex(tab => tab.id === activeTabId);
    const previousIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
    setActiveTab(tabs[previousIndex].id);
  }, [tabs, activeTabId, setActiveTab]);

  const switchToTabByIndex = useCallback((index: number) => {
    if (index >= 0 && index < tabs.length) {
      setActiveTab(tabs[index].id);
    }
  }, [tabs, setActiveTab]);

  const updateTabTitle = useCallback((id: string, title: string) => {
    updateTab(id, { title });
  }, [updateTab]);

  const updateTabStatus = useCallback((id: string, status: Tab['status']) => {
    updateTab(id, { status });
  }, [updateTab]);

  const markTabAsChanged = useCallback((id: string, hasChanges: boolean) => {
    updateTab(id, { hasUnsavedChanges: hasChanges });
  }, [updateTab]);

  const findTabBySessionId = useCallback((sessionId: string): Tab | undefined => {
    return tabs.find(tab => tab.type === 'chat' && tab.sessionId === sessionId);
  }, [tabs]);

  const findTabByAgentRunId = useCallback((agentRunId: string): Tab | undefined => {
    return tabs.find(tab => tab.type === 'agent' && tab.agentRunId === agentRunId);
  }, [tabs]);

  const findTabByType = useCallback((type: Tab['type']): Tab | undefined => {
    return tabs.find(tab => tab.type === type);
  }, [tabs]);

  const canAddTab = useCallback((): boolean => {
    return tabs.length < 20; // MAX_TABS from context
  }, [tabs.length]);

  return {
    // State
    tabs,
    activeTab,
    activeTabId,
    tabCount,
    chatTabCount,
    agentTabCount,
    
    // Operations
    createChatTab,
    createAgentTab,
    createAgentExecutionTab,
    createProjectsTab,
    createUsageTab,
    createMCPTab,
    createSettingsTab,
    createClaudeMdTab,
    createClaudeFileTab,
    createCreateAgentTab,
    createImportAgentTab,
    closeTab,
    closeCurrentTab,
    switchToTab: setActiveTab,
    switchToNextTab,
    switchToPreviousTab,
    switchToTabByIndex,
    updateTab,
    updateTabTitle,
    updateTabStatus,
    markTabAsChanged,
    findTabBySessionId,
    findTabByAgentRunId,
    findTabByType,
    canAddTab
  };
};