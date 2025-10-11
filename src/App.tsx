import { useState, useEffect, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ArrowLeft } from "lucide-react";
import { api, type Project, type Session, type ClaudeMdFile } from "@/lib/api";
import { OutputCacheProvider } from "@/lib/outputCache";
import { TabProvider } from "@/contexts/TabContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { ProjectList } from "@/components/ProjectList";
import { SessionList } from "@/components/SessionList";
import { RunningClaudeSessions } from "@/components/RunningClaudeSessions";
import { Topbar } from "@/components/Topbar";
import { ClaudeFileEditor } from "@/components/ClaudeFileEditor";
import { CCAgents } from "@/components/CCAgents";
import { NFOCredits } from "@/components/NFOCredits";
import { ClaudeBinaryDialog } from "@/components/ClaudeBinaryDialog";
import { Toast, ToastContainer } from "@/components/ui/toast";
import { ProjectSettings } from '@/components/ProjectSettings';
import { TabManager } from "@/components/TabManager";
import { TabContent } from "@/components/TabContent";
import { AgentsModal } from "@/components/AgentsModal";
import { useTabState } from "@/hooks/useTabState";
import { AnalyticsConsentBanner } from "@/components/AnalyticsConsent";
import { useAppLifecycle, useTrackEvent } from "@/hooks";
import { useTranslation } from "@/hooks/useTranslation";
import { WelcomePage } from "@/components/WelcomePage";
import RelayStationManager from "@/components/RelayStationManager";
import { CcrRouterManager } from "@/components/CcrRouterManager";
import i18n from "@/lib/i18n";

// Lazy load these components to match TabContent's dynamic imports
const MarkdownEditor = lazy(() => import('@/components/MarkdownEditor').then(m => ({ default: m.MarkdownEditor })));
const Settings = lazy(() => import('@/components/Settings').then(m => ({ default: m.Settings })));
const UsageDashboard = lazy(() => import('@/components/UsageDashboard').then(m => ({ default: m.UsageDashboard })));
const MCPManager = lazy(() => import('@/components/MCPManager').then(m => ({ default: m.MCPManager })));

type View = 
  | "welcome" 
  | "projects" 
  | "editor" 
  | "claude-file-editor" 
  | "settings"
  | "cc-agents"
  | "create-agent"
  | "github-agents"
  | "agent-execution"
  | "agent-run-view"
  | "mcp"
  | "relay-stations"
  | "ccr-router"
  | "usage-dashboard"
  | "project-settings"
  | "tabs"; // New view for tab-based interface

/**
 * AppContent component - Contains the main app logic, wrapped by providers
 */
function AppContent() {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("welcome");
  const { createClaudeMdTab, createSettingsTab, createUsageTab, createMCPTab } = useTabState();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editingClaudeFile, setEditingClaudeFile] = useState<ClaudeMdFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNFO, setShowNFO] = useState(false);
  const [showClaudeBinaryDialog, setShowClaudeBinaryDialog] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [projectForSettings, setProjectForSettings] = useState<Project | null>(null);
  const [previousView] = useState<View>("welcome");
  const [showAgentsModal, setShowAgentsModal] = useState(false);
  
  // Initialize analytics lifecycle tracking
  useAppLifecycle();
  const trackEvent = useTrackEvent();
  
  // Track user journey milestones
  const [hasTrackedFirstChat] = useState(false);
  // const [hasTrackedFirstAgent] = useState(false);
  
  // Initialize backend language on app startup
  useEffect(() => {
    const initializeBackendLanguage = async () => {
      try {
        // Get the current frontend language
        const frontendLang = i18n.language;
        // Map to backend format
        const backendLocale = frontendLang === 'zh' ? 'zh-CN' : 'en-US';
        // Sync to backend
        await api.setLanguage(backendLocale);
      } catch (error) {
        console.error('Failed to initialize backend language:', error);
      }
    };
    
    initializeBackendLanguage();
  }, []); // Run once on app startup

  // Update document title based on current language
  useEffect(() => {
    try {
      document.title = `${t('app.name')} - ${t('app.tagline')}`;
    } catch {}
  }, [t]);
  
  // Track when user reaches different journey stages
  useEffect(() => {
    if (view === "projects" && projects.length > 0 && !hasTrackedFirstChat) {
      // User has projects - they're past onboarding
      trackEvent.journeyMilestone({
        journey_stage: 'onboarding',
        milestone_reached: 'projects_created',
        time_to_milestone_ms: Date.now() - performance.timing.navigationStart
      });
    }
  }, [view, projects.length, hasTrackedFirstChat, trackEvent]);

  // Load projects on mount when in projects view
  useEffect(() => {
    if (view === "projects") {
      loadProjects();
    } else if (view === "welcome") {
      // Reset loading state for welcome view
      setLoading(false);
    }
  }, [view]);

  // Keyboard shortcuts for tab navigation
  useEffect(() => {
    if (view !== "tabs") return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      
      if (modKey) {
        switch (e.key) {
          case 't':
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('create-chat-tab'));
            break;
          case 'w':
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('close-current-tab'));
            break;
          case 'Tab':
            e.preventDefault();
            if (e.shiftKey) {
              window.dispatchEvent(new CustomEvent('switch-to-previous-tab'));
            } else {
              window.dispatchEvent(new CustomEvent('switch-to-next-tab'));
            }
            break;
          default:
            // Handle number keys 1-9
            if (e.key >= '1' && e.key <= '9') {
              e.preventDefault();
              const index = parseInt(e.key) - 1;
              window.dispatchEvent(new CustomEvent('switch-to-tab-by-index', { detail: { index } }));
            }
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view]);

  // Listen for Claude not found events
  useEffect(() => {
    const handleClaudeNotFound = () => {
      setShowClaudeBinaryDialog(true);
    };

    window.addEventListener('claude-not-found', handleClaudeNotFound as EventListener);
    return () => {
      window.removeEventListener('claude-not-found', handleClaudeNotFound as EventListener);
    };
  }, []);

  // Listen for switch to welcome view event
  useEffect(() => {
    const handleSwitchToWelcome = () => {
      setView("welcome");
    };

    window.addEventListener('switch-to-welcome', handleSwitchToWelcome);
    return () => {
      window.removeEventListener('switch-to-welcome', handleSwitchToWelcome);
    };
  }, []);

  // Listen for a global request to switch to the tabbed interface
  useEffect(() => {
    const handleSwitchToTabs = (event: Event) => {
      // Accept optional tabId in event detail
      const detail = (event as CustomEvent).detail || {};
      const tabId = detail.tabId as string | undefined;
      setView('tabs');
      if (tabId) {
        // Wait a tick for TabManager to mount, then switch to the tab
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('switch-to-tab', { detail: { tabId } }));
        }, 50);
      }
    };

    window.addEventListener('switch-to-tabs', handleSwitchToTabs as EventListener);
    return () => {
      window.removeEventListener('switch-to-tabs', handleSwitchToTabs as EventListener);
    };
  }, []);

  /**
   * Loads all projects from the ~/.claude/projects directory
   */
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

  /**
   * Handles project selection and loads its sessions
   */
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

  /**
   * Opens a new Claude Code session in the interactive UI
   */
  const handleNewSession = async () => {
    handleViewChange("tabs");
    // The tab system will handle creating a new chat tab
  };

  /**
   * Returns to project list view
   */
  const handleBack = () => {
    setSelectedProject(null);
    setSessions([]);
  };

  /**
   * Handles editing a CLAUDE.md file from a project
   */
  const handleEditClaudeFile = (file: ClaudeMdFile) => {
    setEditingClaudeFile(file);
    handleViewChange("claude-file-editor");
  };

  /**
   * Returns from CLAUDE.md file editor to projects view
   */
  const handleBackFromClaudeFileEditor = () => {
    setEditingClaudeFile(null);
    handleViewChange("projects");
  };

  /**
   * Handles view changes with navigation protection
   */
  const handleViewChange = (newView: string) => {
    // No need for navigation protection with tabs since sessions stay open
    setView(newView as View);
  };

  /**
   * Handles navigating to hooks configuration
   */
  const handleProjectSettings = (project: Project) => {
    setProjectForSettings(project);
    handleViewChange("project-settings");
  };


  const renderContent = () => {
    switch (view) {
      case "welcome":
        return (
          <WelcomePage 
            onNavigate={handleViewChange}
            onNewSession={handleNewSession}
          />
        );

      case "relay-stations":
        return (
          <div className="h-full overflow-hidden">
            <RelayStationManager onBack={() => handleViewChange("welcome")} />
          </div>
        );

      case "ccr-router":
        return (
          <div className="h-full overflow-hidden">
            <CcrRouterManager onBack={() => handleViewChange("welcome")} />
          </div>
        );

      case "cc-agents":
        return (
          <div className="h-full overflow-hidden">
            <CCAgents 
              onBack={() => handleViewChange("welcome")} 
            />
          </div>
        );

      case "editor":
        return (
          <div className="h-full overflow-hidden">
            <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
              <MarkdownEditor onBack={() => handleViewChange("welcome")} />
            </Suspense>
          </div>
        );
      
      case "settings":
        return (
          <div className="h-full overflow-hidden">
            <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
              <Settings onBack={() => handleViewChange("welcome")} />
            </Suspense>
          </div>
        );
      
      case "projects":
        return (
          <div className="flex-1 overflow-y-auto">
            <div className="container mx-auto p-6">
              {/* Header with back button */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewChange("welcome")}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('ccProjects')}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('browseClaudeCodeSessions')}
                    </p>
                  </div>
                </div>
              </motion.div>

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
                        onEditClaudeFile={handleEditClaudeFile}
                        onSessionClick={(session) => {
                          // Navigate to session detail view in tabs mode
                          setView("tabs");
                          // Create a new tab for this session
                          setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('open-session-tab', { 
                              detail: { 
                                session,
                                projectPath: selectedProject.path
                              } 
                            }));
                          }, 100);
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
                    >
                      {/* Running Claude Sessions */}
                      <RunningClaudeSessions />

                      {/* Project list with integrated new session button */}
                      {projects.length > 0 ? (
                        <ProjectList
                          projects={projects}
                          onProjectClick={handleProjectClick}
                          onProjectSettings={handleProjectSettings}
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
      
      case "claude-file-editor":
        return editingClaudeFile ? (
          <div className="h-full overflow-hidden">
            <ClaudeFileEditor
              file={editingClaudeFile}
              onBack={handleBackFromClaudeFileEditor}
            />
          </div>
        ) : null;
      
      case "tabs":
        return (
          <div className="h-full flex flex-col">
            <TabManager className="flex-shrink-0" />
            <div className="flex-1 overflow-hidden">
              <TabContent />
            </div>
          </div>
        );
      
      case "usage-dashboard":
        return (
          <div className="h-full overflow-hidden">
            <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
              <UsageDashboard onBack={() => handleViewChange("welcome")} />
            </Suspense>
          </div>
        );
      
      case "mcp":
        return (
          <div className="h-full overflow-hidden">
            <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
              <MCPManager onBack={() => handleViewChange("welcome")} />
            </Suspense>
          </div>
        );
      
      case "project-settings":
        if (projectForSettings) {
          return (
            <div className="h-full overflow-hidden">
              <ProjectSettings
                project={projectForSettings}
                onBack={() => {
                  setProjectForSettings(null);
                  handleViewChange(previousView || "projects");
                }}
              />
            </div>
          );
        }
        break;
      
      default:
        return null;
    }
  };

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Topbar */}
      <Topbar
        onClaudeClick={() => view === 'tabs' ? createClaudeMdTab() : handleViewChange('editor')}
        onSettingsClick={() => view === 'tabs' ? createSettingsTab() : handleViewChange('settings')}
        onUsageClick={() => view === 'tabs' ? createUsageTab() : handleViewChange('usage-dashboard')}
        onMCPClick={() => view === 'tabs' ? createMCPTab() : handleViewChange('mcp')}
        onInfoClick={() => setShowNFO(true)}
        onAgentsClick={() => view === 'tabs' ? setShowAgentsModal(true) : handleViewChange('cc-agents')}
      />
      
      {/* Analytics Consent Banner */}
      <AnalyticsConsentBanner />
      
      {/* Main Content */}
      <div className="flex-1 overflow-hidden relative">
        {renderContent()}
      </div>
      
      {/* NFO Credits Modal */}
      {showNFO && <NFOCredits onClose={() => setShowNFO(false)} />}
      
      {/* Agents Modal */}
      <AgentsModal 
        open={showAgentsModal} 
        onOpenChange={setShowAgentsModal} 
      />
      
      {/* Claude Binary Dialog */}
      <ClaudeBinaryDialog
        open={showClaudeBinaryDialog}
        onOpenChange={setShowClaudeBinaryDialog}
        onSuccess={() => {
          setToast({ message: t('claudeBinaryPathSaved'), type: "success" });
          // Trigger a refresh of the Claude version check
          window.location.reload();
        }}
        onError={(message) => setToast({ message, type: "error" })}
      />
      
      {/* Toast Container */}
      <ToastContainer>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        )}
      </ToastContainer>
    </div>
  );
}

/**
 * Main App component - Wraps the app with providers
 */
function App() {
  return (
    <ThemeProvider>
      <OutputCacheProvider>
        <TabProvider>
          <AppContent />
        </TabProvider>
      </OutputCacheProvider>
    </ThemeProvider>
  );
}

export default App;
