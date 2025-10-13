import React, { Suspense, lazy, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTabState } from '@/hooks/useTabState';
import { useScreenTracking } from '@/hooks/useAnalytics';
import { Tab } from '@/contexts/TabContext';
import { Loader2 } from 'lucide-react';
import { api, type Project, type Session, type ClaudeMdFile } from '@/lib/api';
import { ProjectList } from '@/components/ProjectList';
import { SessionList } from '@/components/SessionList';
import { RunningClaudeSessions } from '@/components/RunningClaudeSessions';
import { useTranslation } from '@/hooks/useTranslation';

// Lazy load heavy components
const ClaudeCodeSession = lazy(() => import('./ClaudeCodeSession'));
const AgentRunOutputViewer = lazy(() => import('@/components/AgentRunOutputViewer'));
const AgentExecution = lazy(() => import('@/components/AgentExecution').then(m => ({ default: m.AgentExecution })));
const CreateAgent = lazy(() => import('@/components/CreateAgent').then(m => ({ default: m.CreateAgent })));
const UsageDashboard = lazy(() => import('@/components/UsageDashboard').then(m => ({ default: m.UsageDashboard })));
const MCPManager = lazy(() => import('@/components/MCPManager').then(m => ({ default: m.MCPManager })));
const Settings = lazy(() => import('@/components/Settings').then(m => ({ default: m.Settings })));
const MarkdownEditor = lazy(() => import('@/components/MarkdownEditor').then(m => ({ default: m.MarkdownEditor })));
// const ClaudeFileEditor = lazy(() => import('@/components/ClaudeFileEditor').then(m => ({ default: m.ClaudeFileEditor })));

// Import non-lazy components for projects view

interface TabPanelProps {
  tab: Tab;
  isActive: boolean;
}

const TabPanel: React.FC<TabPanelProps> = ({ tab, isActive }) => {
  const { t } = useTranslation();
  const { updateTab, createChatTab } = useTabState();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = React.useState<Project | null>(null);
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [loading, setLoading] = React.useState(false);
  
  // Track screen when tab becomes active
  useScreenTracking(isActive ? tab.type : undefined, isActive ? tab.id : undefined);
  const [error, setError] = React.useState<string | null>(null);
  
  // Load projects when tab becomes active and is of type 'projects'
  useEffect(() => {
    if (isActive && tab.type === 'projects') {
      loadProjects();
    }
  }, [isActive, tab.type]);
  
  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const projectList = await api.listProjects();
      setProjects(projectList);
    } catch (err) {
      console.error("Failed to load projects:", err);
      setError(t('failedToLoadProjects'));
    } finally {
      setLoading(false);
    }
  };
  
  const handleProjectClick = async (project: Project) => {
    try {
      setLoading(true);
      setError(null);
      const sessionList = await api.getProjectSessions(project.id);
      setSessions(sessionList);
      setSelectedProject(project);
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError(t('failedToLoadSessions'));
    } finally {
      setLoading(false);
    }
  };
  
  const handleBack = () => {
    setSelectedProject(null);
    setSessions([]);
  };
  
  const handleNewSession = () => {
    // Create a new chat tab
    createChatTab();
  };
  
  // Panel visibility - hide when not active
  const panelVisibilityClass = isActive ? "" : "hidden";
  
  const renderContent = () => {
    switch (tab.type) {
      case 'projects':
        return (
          <div className="h-full overflow-y-auto">
            <div className="container mx-auto p-6">
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight">{t('ccProjects')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('browseClaudeCodeSessions')}
                </p>
              </div>

              {/* Error display */}
              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive max-w-2xl"
                >
                  {error}
                </motion.div>
              )}

              {/* Loading state */}
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Content */}
              {!loading && (
                <AnimatePresence mode="wait">
                  {selectedProject ? (
                    <motion.div
                      key="sessions"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <SessionList
                        sessions={sessions}
                        projectPath={selectedProject.path}
                        onBack={handleBack}
                        onSessionClick={(session) => {
                          // Update tab to show this session
                          updateTab(tab.id, {
                            type: 'chat',
                            title: session.project_path.split('/').pop() || 'Session',
                            sessionId: session.id,
                            sessionData: session, // Store full session object
                            initialProjectPath: session.project_path,
                          });
                        }}
                        onEditClaudeFile={(file: ClaudeMdFile) => {
                          // Open CLAUDE.md file in a new tab
                          window.dispatchEvent(new CustomEvent('open-claude-file', { 
                            detail: { file } 
                          }));
                        }}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="projects"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-6"
                    >
                      {/* Running Claude Sessions - moved before project list */}
                      <RunningClaudeSessions />

                      {/* Project list - now includes new session button and search */}
                      {projects.length > 0 ? (
                        <ProjectList
                          projects={projects}
                          onProjectClick={handleProjectClick}
                          onProjectSettings={(project) => {
                            console.log('Project settings clicked for:', project);
                          }}
                          onNewSession={handleNewSession}
                          loading={loading}
                          className="animate-fade-in"
                        />
                      ) : (
                        <div className="py-8 text-center">
                          <p className="text-sm text-muted-foreground">
                            {t('noProjectsFound')}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </div>
        );
      
      case 'chat':
        return (
          <ClaudeCodeSession
            session={tab.sessionData} // Pass the full session object if available
            initialProjectPath={tab.initialProjectPath || tab.sessionId}
            tabId={tab.id} // Pass tabId for state synchronization
            onBack={() => {
              // Go back to projects view in the same tab
              updateTab(tab.id, {
                type: 'projects',
                title: t('ccProjects'),
              });
            }}
          />
        );
      
      case 'agent':
        
        if (!tab.agentRunId) {
          console.error('[TabContent] No agentRunId in tab:', tab);
          return <div className="p-4">{t('messages.noAgentRunIdSpecified')}</div>;
        }
        
        return (
          <AgentRunOutputViewer
            agentRunId={tab.agentRunId}
            tabId={tab.id}
          />
        );
      
      
      case 'usage':
        return <UsageDashboard onBack={() => {}} />;
      
      case 'mcp':
        return <MCPManager onBack={() => {}} />;
      
      case 'settings':
        return <Settings onBack={() => {}} />;
      
      case 'claude-md':
        return <MarkdownEditor onBack={() => {}} />;
      
      case 'claude-file':
        if (!tab.claudeFileId) {
          return <div className="p-4">{t('messages.noClaudeFileIdSpecified')}</div>;
        }
        // Note: We need to get the actual file object for ClaudeFileEditor
        // For now, returning a placeholder
        return <div className="p-4">{t('messages.claudeFileEditorNotImplemented')}</div>;
      
      case 'agent-execution':
        if (!tab.agentData) {
          return <div className="p-4">{t('messages.noAgentDataSpecified')}</div>;
        }
        return (
          <AgentExecution
            agent={tab.agentData}
            onBack={() => {}}
          />
        );
      
      case 'create-agent':
        return (
          <CreateAgent
            onAgentCreated={() => {
              // Close this tab after agent is created
              window.dispatchEvent(new CustomEvent('close-tab', { detail: { tabId: tab.id } }));
            }}
            onBack={() => {
              // Close this tab when back is clicked
              window.dispatchEvent(new CustomEvent('close-tab', { detail: { tabId: tab.id } }));
            }}
          />
        );
      
      case 'import-agent':
        // TODO: Implement import agent component
        return <div className="p-4">{t('messages.importAgentComingSoon')}</div>;
      
      default:
        return <div className="p-4">{t('messages.unknownTabType')}: {tab.type}</div>;
    }
  };

  // Only render content when the tab is active or was previously active (to keep state)
  // This prevents unnecessary unmounting/remounting
  const shouldRenderContent = isActive;

  return (
    <div className={`h-full w-full ${panelVisibilityClass}`}>
      {shouldRenderContent && (
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          }
        >
          {renderContent()}
        </Suspense>
      )}
    </div>
  );
};

export const TabContent: React.FC = () => {
  const { t } = useTranslation();
  const { tabs, activeTabId, createChatTab, findTabBySessionId, createClaudeFileTab, createAgentExecutionTab, createCreateAgentTab, createImportAgentTab, closeTab, updateTab } = useTabState();
  const [hasInitialized, setHasInitialized] = React.useState(false);

  // Debug: Monitor activeTabId changes
  useEffect(() => {
  }, [activeTabId, tabs]);
  
  // Auto redirect to home when no tabs (but not on initial load)
  useEffect(() => {
    if (hasInitialized && tabs.length === 0) {
      // Dispatch event to switch back to welcome view
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('switch-to-welcome'));
      }, 100);
    }
  }, [tabs.length, hasInitialized]);
  
  // Mark as initialized after first render
  useEffect(() => {
    setHasInitialized(true);
  }, []);
  
  // Listen for events to open sessions in tabs
  useEffect(() => {
    const handleOpenSessionInTab = (event: CustomEvent) => {
      const { session } = event.detail;
      
      // Check if tab already exists for this session
      const existingTab = findTabBySessionId(session.id);
      if (existingTab) {
        // Update existing tab with session data and switch to it
        updateTab(existingTab.id, {
          sessionData: session,
          title: session.project_path.split('/').pop() || 'Session'
        });
        window.dispatchEvent(new CustomEvent('switch-to-tab', { detail: { tabId: existingTab.id } }));
      } else {
        // Create new tab for this session
        const projectName = session.project_path.split('/').pop() || 'Session';
        const newTabId = createChatTab(session.id, projectName);
        // Update the new tab with session data
        updateTab(newTabId, {
          sessionData: session,
          initialProjectPath: session.project_path
        });
      }
    };

    const handleOpenClaudeFile = (event: CustomEvent) => {
      const { file } = event.detail;
      createClaudeFileTab(file.id, file.name || 'CLAUDE.md');
    };

    const handleOpenAgentExecution = (event: CustomEvent) => {
      const { agent, tabId } = event.detail;
      createAgentExecutionTab(agent, tabId);
    };

    const handleOpenCreateAgentTab = () => {
      createCreateAgentTab();
    };

    const handleOpenImportAgentTab = () => {
      createImportAgentTab();
    };

    const handleCloseTab = (event: CustomEvent) => {
      const { tabId } = event.detail;
      closeTab(tabId);
    };

    const handleClaudeSessionSelected = (event: CustomEvent) => {
      const { session } = event.detail;
      // Reuse same logic as handleOpenSessionInTab
      const existingTab = findTabBySessionId(session.id);
      if (existingTab) {
        updateTab(existingTab.id, {
          sessionData: session,
          title: session.project_path.split('/').pop() || 'Session',
        });
        window.dispatchEvent(new CustomEvent('switch-to-tab', { detail: { tabId: existingTab.id } }));
      } else {
        const projectName = session.project_path.split('/').pop() || 'Session';
        const newTabId = createChatTab(session.id, projectName);
        updateTab(newTabId, {
          sessionData: session,
          initialProjectPath: session.project_path,
        });
      }
    };

    window.addEventListener('open-session-in-tab', handleOpenSessionInTab as EventListener);
    window.addEventListener('open-claude-file', handleOpenClaudeFile as EventListener);
    window.addEventListener('open-agent-execution', handleOpenAgentExecution as EventListener);
    window.addEventListener('open-create-agent-tab', handleOpenCreateAgentTab);
    window.addEventListener('open-import-agent-tab', handleOpenImportAgentTab);
    window.addEventListener('close-tab', handleCloseTab as EventListener);
    window.addEventListener('claude-session-selected', handleClaudeSessionSelected as EventListener);
    return () => {
      window.removeEventListener('open-session-in-tab', handleOpenSessionInTab as EventListener);
      window.removeEventListener('open-claude-file', handleOpenClaudeFile as EventListener);
      window.removeEventListener('open-agent-execution', handleOpenAgentExecution as EventListener);
      window.removeEventListener('open-create-agent-tab', handleOpenCreateAgentTab);
      window.removeEventListener('open-import-agent-tab', handleOpenImportAgentTab);
      window.removeEventListener('close-tab', handleCloseTab as EventListener);
      window.removeEventListener('claude-session-selected', handleClaudeSessionSelected as EventListener);
    };
  }, [createChatTab, findTabBySessionId, createClaudeFileTab, createAgentExecutionTab, createCreateAgentTab, createImportAgentTab, closeTab, updateTab]);
  
  return (
    <div className="flex-1 h-full relative">
      {tabs.map((tab) => (
        <TabPanel
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
        />
      ))}
      
      {tabs.length === 0 && (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <p className="text-lg mb-2">{t('messages.noTabsOpen')}</p>
            <p className="text-sm">{t('messages.clickPlusToStartChat')}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TabContent;
