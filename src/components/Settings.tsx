import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Save, 
  AlertCircle,
  Loader2,
  BarChart3,
  Shield,
  Trash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  api, 
  type ClaudeSettings,
  type ClaudeInstallation,
  type ModelMapping
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Toast, ToastContainer } from "@/components/ui/toast";
import { ClaudeVersionSelector } from "./ClaudeVersionSelector";
import { StorageTab } from "./StorageTab";
import { HooksEditor } from "./HooksEditor";
import { SlashCommandsManager } from "./SlashCommandsManager";
import { ProxySettings } from "./ProxySettings";
import { AnalyticsConsent } from "./AnalyticsConsent";
import { useTheme, useTrackEvent, useTranslation } from "@/hooks";
import { analytics } from "@/lib/analytics";

interface SettingsProps {
  /**
   * Callback to go back to the main view
   */
  onBack: () => void;
  /**
   * Optional className for styling
   */
  className?: string;
}

interface PermissionRule {
  id: string;
  value: string;
}

interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
}

/**
 * Comprehensive Settings UI for managing Claude Code settings
 * Provides a no-code interface for editing the settings.json file
 */
export const Settings: React.FC<SettingsProps> = ({
  onBack,
  className,
}) => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ClaudeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("general");
  const [currentBinaryPath, setCurrentBinaryPath] = useState<string | null>(null);
  const [selectedInstallation, setSelectedInstallation] = useState<ClaudeInstallation | null>(null);
  const [binaryPathChanged, setBinaryPathChanged] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Permission rules state
  const [allowRules, setAllowRules] = useState<PermissionRule[]>([]);
  const [denyRules, setDenyRules] = useState<PermissionRule[]>([]);
  
  // Environment variables state
  const [envVars, setEnvVars] = useState<EnvironmentVariable[]>([]);
  
  // Hooks state
  const [userHooksChanged, setUserHooksChanged] = useState(false);
  const getUserHooks = React.useRef<(() => any) | null>(null);
  
  // Theme hook
  const { theme, setTheme, customColors, setCustomColors } = useTheme();
  
  // Proxy state
  const [proxySettingsChanged, setProxySettingsChanged] = useState(false);
  const saveProxySettings = React.useRef<(() => Promise<void>) | null>(null);
  
  // Analytics state
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [analyticsConsented, setAnalyticsConsented] = useState(false);
  const [showAnalyticsConsent, setShowAnalyticsConsent] = useState(false);
  const trackEvent = useTrackEvent();
  
  // Model mappings state
  const [modelMappings, setModelMappings] = useState<ModelMapping[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [modelMappingsChanged, setModelMappingsChanged] = useState(false);
  
  // Load settings on mount
  useEffect(() => {
    loadSettings();
    loadClaudeBinaryPath();
    loadAnalyticsSettings();
    loadModelMappings();
  }, []);

  /**
   * Loads analytics settings
   */
  const loadAnalyticsSettings = async () => {
    const settings = analytics.getSettings();
    if (settings) {
      setAnalyticsEnabled(settings.enabled);
      setAnalyticsConsented(settings.hasConsented);
    }
  };

  /**
   * Loads model mappings
   * @author yovinchen
   */
  const loadModelMappings = async () => {
    try {
      setLoadingMappings(true);
      const mappings = await api.getModelMappings();
      console.log("Loaded model mappings:", mappings);
      setModelMappings(mappings);
    } catch (err) {
      console.error("Failed to load model mappings:", err);
      setToast({ message: t('settings.modelMappings.loadFailed'), type: "error" });
    } finally {
      setLoadingMappings(false);
    }
  };

  /**
   * Updates a model mapping
   * @author yovinchen
   */
  const updateModelMapping = (alias: string, modelName: string) => {
    setModelMappings(prev =>
      prev.map(m => (m.alias === alias ? { ...m, model_name: modelName } : m))
    );
    setModelMappingsChanged(true);
  };

  /**
   * Saves model mappings
   * @author yovinchen
   */
  const saveModelMappings = async () => {
    try {
      for (const mapping of modelMappings) {
        await api.updateModelMapping(mapping.alias, mapping.model_name);
      }
      setModelMappingsChanged(false);
      setToast({ message: t('settings.modelMappings.saved'), type: "success" });
    } catch (err) {
      console.error("Failed to save model mappings:", err);
      setToast({ message: t('settings.modelMappings.saveFailed'), type: "error" });
    }
  };

  /**
   * Loads the current Claude binary path
   */
  const loadClaudeBinaryPath = async () => {
    try {
      const path = await api.getClaudeBinaryPath();
      setCurrentBinaryPath(path);
    } catch (err) {
      console.error("Failed to load Claude binary path:", err);
    }
  };

  /**
   * Loads the current Claude settings
   */
  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const loadedSettings = await api.getClaudeSettings();
      
      // Ensure loadedSettings is an object
      if (!loadedSettings || typeof loadedSettings !== 'object') {
        console.warn("Loaded settings is not an object:", loadedSettings);
        setSettings({});
        return;
      }
      
      setSettings(loadedSettings);

      // Parse permissions
      if (loadedSettings.permissions && typeof loadedSettings.permissions === 'object') {
        if (Array.isArray(loadedSettings.permissions.allow)) {
          setAllowRules(
            loadedSettings.permissions.allow.map((rule: string, index: number) => ({
              id: `allow-${index}`,
              value: rule,
            }))
          );
        }
        if (Array.isArray(loadedSettings.permissions.deny)) {
          setDenyRules(
            loadedSettings.permissions.deny.map((rule: string, index: number) => ({
              id: `deny-${index}`,
              value: rule,
            }))
          );
        }
      }

      // Parse environment variables
      if (loadedSettings.env && typeof loadedSettings.env === 'object' && !Array.isArray(loadedSettings.env)) {
        setEnvVars(
          Object.entries(loadedSettings.env).map(([key, value], index) => ({
            id: `env-${index}`,
            key,
            value: value as string,
          }))
        );
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
      setError(t('settings.messages.loadFailed'));
      setSettings({});
    } finally {
      setLoading(false);
    }
  };

  /**
   * Saves the current settings
   */
  const saveSettings = async () => {
    try {
      setSaving(true);
      setError(null);
      setToast(null);

      // Build the settings object
      const updatedSettings: ClaudeSettings = {
        ...settings,
        permissions: {
          allow: allowRules.map(rule => rule.value).filter(v => v && String(v).trim()),
          deny: denyRules.map(rule => rule.value).filter(v => v && String(v).trim()),
        },
        env: envVars.reduce((acc, { key, value }) => {
          if (key && String(key).trim() && value && String(value).trim()) {
            acc[key] = String(value);
          }
          return acc;
        }, {} as Record<string, string>),
      };

      await api.saveClaudeSettings(updatedSettings);
      setSettings(updatedSettings);

      // Save Claude binary path if changed
      if (binaryPathChanged && selectedInstallation) {
        await api.setClaudeBinaryPath(selectedInstallation.path);
        setCurrentBinaryPath(selectedInstallation.path);
        setBinaryPathChanged(false);
      }

      // Save user hooks if changed
      if (userHooksChanged && getUserHooks.current) {
        const hooks = getUserHooks.current();
        await api.updateHooksConfig('user', hooks);
        setUserHooksChanged(false);
      }

      // Save proxy settings if changed
      if (proxySettingsChanged && saveProxySettings.current) {
        await saveProxySettings.current();
        setProxySettingsChanged(false);
      }

      // Save model mappings if changed
      if (modelMappingsChanged) {
        await saveModelMappings();
      }

      setToast({ message: t('settings.saveButton.settingsSavedSuccess'), type: "success" });
    } catch (err) {
      console.error("Failed to save settings:", err);
      setError(t('settings.messages.saveFailed'));
      setToast({ message: t('settings.saveButton.settingsSaveFailed'), type: "error" });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Updates a simple setting value
   */
  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  /**
   * Adds a new permission rule
   */
  const addPermissionRule = (type: "allow" | "deny") => {
    const newRule: PermissionRule = {
      id: `${type}-${Date.now()}`,
      value: "",
    };
    
    if (type === "allow") {
      setAllowRules(prev => [...prev, newRule]);
    } else {
      setDenyRules(prev => [...prev, newRule]);
    }
  };

  /**
   * Updates a permission rule
   */
  const updatePermissionRule = (type: "allow" | "deny", id: string, value: string) => {
    if (type === "allow") {
      setAllowRules(prev => prev.map(rule => 
        rule.id === id ? { ...rule, value } : rule
      ));
    } else {
      setDenyRules(prev => prev.map(rule => 
        rule.id === id ? { ...rule, value } : rule
      ));
    }
  };

  /**
   * Removes a permission rule
   */
  const removePermissionRule = (type: "allow" | "deny", id: string) => {
    if (type === "allow") {
      setAllowRules(prev => prev.filter(rule => rule.id !== id));
    } else {
      setDenyRules(prev => prev.filter(rule => rule.id !== id));
    }
  };

  /**
   * Adds a new environment variable
   */
  const addEnvVar = () => {
    const newVar: EnvironmentVariable = {
      id: `env-${Date.now()}`,
      key: "",
      value: "",
    };
    setEnvVars(prev => [...prev, newVar]);
  };

  /**
   * Updates an environment variable
   */
  const updateEnvVar = (id: string, field: "key" | "value", value: string) => {
    setEnvVars(prev => prev.map(envVar => 
      envVar.id === id ? { ...envVar, [field]: value } : envVar
    ));
  };

  /**
   * Removes an environment variable
   */
  const removeEnvVar = (id: string) => {
    setEnvVars(prev => prev.filter(envVar => envVar.id !== id));
  };

  /**
   * Handle Claude installation selection
   */
  const handleClaudeInstallationSelect = (installation: ClaudeInstallation) => {
    setSelectedInstallation(installation);
    setBinaryPathChanged(installation.path !== currentBinaryPath);
  };

  return (
    <div className={cn("flex flex-col h-full bg-background text-foreground", className)}>
      <div className="max-w-4xl mx-auto w-full flex flex-col h-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-between p-4 border-b border-border"
        >
        <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">{t('settings.title')}</h2>
          <p className="text-xs text-muted-foreground">
              {t('settings.configurePreferences')}
          </p>
          </div>
        </div>
        
        <Button
          onClick={saveSettings}
          disabled={saving || loading}
          size="sm"
          className="gap-2 bg-primary hover:bg-primary/90"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('settings.saveButton.saving')}
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {t('settings.saveButton.saveSettings')}
            </>
          )}
        </Button>
      </motion.div>
      
      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-4 mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/50 flex items-center gap-2 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-9 w-full sticky top-0 z-10 bg-background">
                <TabsTrigger value="general">{t('settings.general')}</TabsTrigger>
                <TabsTrigger value="permissions">{t('settings.permissionsTab')}</TabsTrigger>
                <TabsTrigger value="environment">{t('settings.environmentTab')}</TabsTrigger>
                <TabsTrigger value="advanced">{t('settings.advancedTab')}</TabsTrigger>
                <TabsTrigger value="hooks">{t('settings.hooksTab')}</TabsTrigger>
                <TabsTrigger value="commands">{t('settings.commands')}</TabsTrigger>
                <TabsTrigger value="storage">{t('settings.storage')}</TabsTrigger>
                <TabsTrigger value="proxy">{t('settings.proxy')}</TabsTrigger>
                <TabsTrigger value="analytics">{t('settings.analyticsTab')}</TabsTrigger>
              </TabsList>
            
            {/* General Settings */}
            <TabsContent value="general" className="space-y-6 mt-6">
              <Card className="p-6 space-y-6">
                <div>
                  <h3 className="text-base font-semibold mb-4">{t('settings.generalSettings')}</h3>
                  
                  <div className="space-y-4">
                    {/* Theme Selector */}
                    <div className="space-y-2">
                      <Label htmlFor="theme">{t('settings.theme')}</Label>
                      <Select
                        value={theme}
                        onValueChange={(value) => setTheme(value as any)}
                      >
                        <SelectTrigger id="theme" className="w-full">
                          <SelectValue placeholder={t('settings.themeSelector.selectATheme')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dark">{t('settings.themeSelector.dark')}</SelectItem>
                          <SelectItem value="gray">{t('settings.themeSelector.gray')}</SelectItem>
                          <SelectItem value="light">{t('settings.themeSelector.light')}</SelectItem>
                          <SelectItem value="custom">{t('settings.themeSelector.custom')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {t('settings.themeSelector.choosePreferredTheme')}
                      </p>
                    </div>
                    
                    {/* Custom Color Editor */}
                    {theme === 'custom' && (
                      <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
                        <h4 className="text-sm font-medium">{t('settings.customTheme.title')}</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                          {/* Background Color */}
                          <div className="space-y-2">
                            <Label htmlFor="color-background" className="text-xs">{t('settings.customTheme.background')}</Label>
                            <div className="flex gap-2">
                              <Input
                                id="color-background"
                                type="text"
                                value={customColors.background}
                                onChange={(e) => setCustomColors({ background: e.target.value })}
                                placeholder="oklch(0.12 0.01 240)"
                                className="font-mono text-xs"
                              />
                              <div 
                                className="w-10 h-10 rounded border"
                                style={{ backgroundColor: customColors.background }}
                              />
                            </div>
                          </div>
                          
                          {/* Foreground Color */}
                          <div className="space-y-2">
                            <Label htmlFor="color-foreground" className="text-xs">{t('settings.customTheme.foreground')}</Label>
                            <div className="flex gap-2">
                              <Input
                                id="color-foreground"
                                type="text"
                                value={customColors.foreground}
                                onChange={(e) => setCustomColors({ foreground: e.target.value })}
                                placeholder="oklch(0.98 0.01 240)"
                                className="font-mono text-xs"
                              />
                              <div 
                                className="w-10 h-10 rounded border"
                                style={{ backgroundColor: customColors.foreground }}
                              />
                            </div>
                          </div>
                          
                          {/* Primary Color */}
                          <div className="space-y-2">
                            <Label htmlFor="color-primary" className="text-xs">{t('settings.customTheme.primary')}</Label>
                            <div className="flex gap-2">
                              <Input
                                id="color-primary"
                                type="text"
                                value={customColors.primary}
                                onChange={(e) => setCustomColors({ primary: e.target.value })}
                                placeholder="oklch(0.98 0.01 240)"
                                className="font-mono text-xs"
                              />
                              <div 
                                className="w-10 h-10 rounded border"
                                style={{ backgroundColor: customColors.primary }}
                              />
                            </div>
                          </div>
                          
                          {/* Card Color */}
                          <div className="space-y-2">
                            <Label htmlFor="color-card" className="text-xs">{t('settings.customTheme.card')}</Label>
                            <div className="flex gap-2">
                              <Input
                                id="color-card"
                                type="text"
                                value={customColors.card}
                                onChange={(e) => setCustomColors({ card: e.target.value })}
                                placeholder="oklch(0.14 0.01 240)"
                                className="font-mono text-xs"
                              />
                              <div 
                                className="w-10 h-10 rounded border"
                                style={{ backgroundColor: customColors.card }}
                              />
                            </div>
                          </div>
                          
                          {/* Accent Color */}
                          <div className="space-y-2">
                            <Label htmlFor="color-accent" className="text-xs">{t('settings.customTheme.accent')}</Label>
                            <div className="flex gap-2">
                              <Input
                                id="color-accent"
                                type="text"
                                value={customColors.accent}
                                onChange={(e) => setCustomColors({ accent: e.target.value })}
                                placeholder="oklch(0.16 0.01 240)"
                                className="font-mono text-xs"
                              />
                              <div 
                                className="w-10 h-10 rounded border"
                                style={{ backgroundColor: customColors.accent }}
                              />
                            </div>
                          </div>
                          
                          {/* Destructive Color */}
                          <div className="space-y-2">
                            <Label htmlFor="color-destructive" className="text-xs">{t('settings.customTheme.destructive')}</Label>
                            <div className="flex gap-2">
                              <Input
                                id="color-destructive"
                                type="text"
                                value={customColors.destructive}
                                onChange={(e) => setCustomColors({ destructive: e.target.value })}
                                placeholder="oklch(0.6 0.2 25)"
                                className="font-mono text-xs"
                              />
                              <div 
                                className="w-10 h-10 rounded border"
                                style={{ backgroundColor: customColors.destructive }}
                              />
                            </div>
                          </div>
                        </div>
                        
                        <p className="text-xs text-muted-foreground">
                          {t('settings.customTheme.colorValuesDesc')}
                        </p>
                      </div>
                    )}
                    
                    {/* Include Co-authored By */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 flex-1">
                        <Label htmlFor="coauthored">{t('settings.generalOptions.includeCoAuthor')}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t('settings.generalOptions.includeCoAuthorDesc')}
                        </p>
                      </div>
                      <Switch
                        id="coauthored"
                        checked={settings?.includeCoAuthoredBy !== false}
                        onCheckedChange={(checked) => updateSetting("includeCoAuthoredBy", checked)}
                      />
                    </div>
                    
                    {/* Verbose Output */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 flex-1">
                        <Label htmlFor="verbose">{t('settings.generalOptions.verboseOutput')}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t('settings.generalOptions.verboseOutputDesc')}
                        </p>
                      </div>
                      <Switch
                        id="verbose"
                        checked={settings?.verbose === true}
                        onCheckedChange={(checked) => updateSetting("verbose", checked)}
                      />
                    </div>
                    
                    {/* Cleanup Period */}
                    <div className="space-y-2">
                      <Label htmlFor="cleanup">{t('settings.generalOptions.chatRetention')}</Label>
                      <Input
                        id="cleanup"
                        type="number"
                        min="1"
                        placeholder="30"
                        value={settings?.cleanupPeriodDays || ""}
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : undefined;
                          updateSetting("cleanupPeriodDays", value);
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('settings.generalOptions.chatRetentionDesc')}
                      </p>
                    </div>
                    
                    {/* Claude Binary Path Selector */}
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium mb-2 block">{t('settings.generalOptions.claudeCodeInstallation')}</Label>
                        <p className="text-xs text-muted-foreground mb-4">
                          {t('settings.generalOptions.claudeCodeInstallationDesc')}
                        </p>
                      </div>
                      <ClaudeVersionSelector
                        selectedPath={currentBinaryPath}
                        onSelect={handleClaudeInstallationSelect}
                      />
                      {binaryPathChanged && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          {t('settings.generalOptions.binaryPathChanged')}
                        </p>
                      )}
                    </div>
                    
                    {/* Model Mappings Configuration */}
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium mb-2 block">{t('settings.modelMappings.title')}</Label>
                        <p className="text-xs text-muted-foreground mb-4">
                          {t('settings.modelMappings.description')}
                        </p>
                      </div>
                      
                      {loadingMappings ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {modelMappings.map((mapping) => (
                            <div key={mapping.alias} className="space-y-2">
                              <Label htmlFor={`model-${mapping.alias}`} className="text-sm">
                                {mapping.alias}
                              </Label>
                              <Input
                                id={`model-${mapping.alias}`}
                                value={mapping.model_name}
                                onChange={(e) => updateModelMapping(mapping.alias, e.target.value)}
                                className="font-mono text-sm"
                              />
                              <p className="text-xs text-muted-foreground">
                                {mapping.alias === 'sonnet' && t('settings.modelMappings.aliasDescriptions.sonnet')}
                                {mapping.alias === 'opus' && t('settings.modelMappings.aliasDescriptions.opus')}
                                {mapping.alias === 'haiku' && t('settings.modelMappings.aliasDescriptions.haiku')}
                              </p>
                            </div>
                          ))}
                          
                          {modelMappings.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                              <p className="text-sm">{t('settings.modelMappings.emptyTitle')}</p>
                              <p className="text-xs mt-2">{t('settings.modelMappings.emptySubtitle')}</p>
                            </div>
                          )}
                          
                          {modelMappingsChanged && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              {t('settings.modelMappings.changedNotice')}
                            </p>
                          )}
                          
                          <div className="pt-2">
                            <p className="text-xs text-muted-foreground">
                              <strong>{t('settings.modelMappings.note')}</strong> {t('settings.modelMappings.noteContent')}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>
            
            {/* Permissions Settings */}
            <TabsContent value="permissions" className="space-y-6 mt-6">
              <Card className="p-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold mb-2">{t('settings.permissions.permissionRules')}</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t('settings.permissions.permissionRulesDesc')}
                    </p>
                  </div>
                  
                  {/* Allow Rules */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium text-green-500">{t('settings.permissions.allowRules')}</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addPermissionRule("allow")}
                        className="gap-2 hover:border-green-500/50 hover:text-green-500"
                      >
                        <Plus className="h-3 w-3" />
                        {t('settings.permissions.addRule')}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {allowRules.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">
                          {t('settings.permissions.noAllowRules')}
                        </p>
                      ) : (
                        allowRules.map((rule) => (
                          <motion.div
                            key={rule.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-2"
                          >
                            <Input
                              placeholder={t('settings.placeholders.allowRuleExample')}
                              value={rule.value}
                              onChange={(e) => updatePermissionRule("allow", rule.id, e.target.value)}
                              className="flex-1"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removePermissionRule("allow", rule.id)}
                              className="h-8 w-8"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>
                  
                  {/* Deny Rules */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium text-red-500">{t('settings.permissions.denyRules')}</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addPermissionRule("deny")}
                        className="gap-2 hover:border-red-500/50 hover:text-red-500"
                      >
                        <Plus className="h-3 w-3" />
                        {t('settings.permissions.addRule')}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {denyRules.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">
                          {t('settings.permissions.noDenyRules')}
                        </p>
                      ) : (
                        denyRules.map((rule) => (
                          <motion.div
                            key={rule.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-2"
                          >
                            <Input
                              placeholder={t('settings.placeholders.denyRuleExample')}
                              value={rule.value}
                              onChange={(e) => updatePermissionRule("deny", rule.id, e.target.value)}
                              className="flex-1"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removePermissionRule("deny", rule.id)}
                              className="h-8 w-8"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>
                  
                  <div className="pt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      <strong>{t('settings.permissions.examples')}</strong>
                    </p>
                    <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                      <li>• <code className="px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">Bash</code> - {t('settings.permissions.exampleBash')}</li>
                      <li>• <code className="px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">Bash(npm run build)</code> - {t('settings.permissions.exampleExactCommand')}</li>
                      <li>• <code className="px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">Bash(npm run test:*)</code> - {t('settings.permissions.examplePrefix')}</li>
                      <li>• <code className="px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">Read(~/.zshrc)</code> - {t('settings.permissions.exampleReadFile')}</li>
                      <li>• <code className="px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">Edit(docs/**)</code> - {t('settings.permissions.exampleEditDir')}</li>
                    </ul>
                  </div>
                </div>
              </Card>
            </TabsContent>
            
            {/* Environment Variables */}
            <TabsContent value="environment" className="space-y-6 mt-6">
              <Card className="p-6">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold">{t('settings.environment.environmentVariables')}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('settings.environment.environmentVariablesDesc')}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addEnvVar}
                      className="gap-2"
                    >
                      <Plus className="h-3 w-3" />
                      {t('settings.environment.addVariable')}
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {envVars.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">
                        {t('settings.environment.noEnvironmentVariables')}
                      </p>
                    ) : (
                      envVars.map((envVar) => (
                        <motion.div
                          key={envVar.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-2"
                        >
                          <Input
                            placeholder={t('settings.placeholders.envVarKey')}
                            value={envVar.key}
                            onChange={(e) => updateEnvVar(envVar.id, "key", e.target.value)}
                            className="flex-1 font-mono text-sm"
                          />
                          <span className="text-muted-foreground">=</span>
                          <Input
                            placeholder={t('settings.placeholders.envVarValue')}
                            value={envVar.value}
                            onChange={(e) => updateEnvVar(envVar.id, "value", e.target.value)}
                            className="flex-1 font-mono text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeEnvVar(envVar.id)}
                            className="h-8 w-8 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </motion.div>
                      ))
                    )}
                  </div>
                  
                  <div className="pt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      <strong>{t('settings.environment.commonVariables')}</strong>
                    </p>
                    <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                      <li>• <code className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">CLAUDE_CODE_ENABLE_TELEMETRY</code> - {t('settings.environment.telemetryDesc')}</li>
                      <li>• <code className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">ANTHROPIC_MODEL</code> - {t('settings.environment.modelDesc')}</li>
                      <li>• <code className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">DISABLE_COST_WARNINGS</code> - {t('settings.environment.costWarningsDesc')}</li>
                    </ul>
                  </div>
                </div>
              </Card>
            </TabsContent>
            {/* Advanced Settings */}
            <TabsContent value="advanced" className="space-y-6 mt-6">
              <Card className="p-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold mb-4">{t('settings.advanced.advancedSettings')}</h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      {t('settings.advanced.advancedSettingsDesc')}
                    </p>
                  </div>
                  
                  {/* API Key Helper */}
                  <div className="space-y-2">
                    <Label htmlFor="apiKeyHelper">{t('settings.advanced.apiKeyHelper')}</Label>
                    <Input
                      id="apiKeyHelper"
                      placeholder={t('settings.placeholders.apiKeyHelperPath')}
                      value={settings?.apiKeyHelper || ""}
                      onChange={(e) => updateSetting("apiKeyHelper", e.target.value || undefined)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('settings.advanced.apiKeyHelperDesc')}
                    </p>
                  </div>
                  
                  {/* Raw JSON Editor */}
                  <div className="space-y-2">
                    <Label>{t('settings.advanced.rawSettings')}</Label>
                    <div className="p-3 rounded-md bg-muted font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                      <pre>{JSON.stringify(settings, null, 2)}</pre>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.advanced.rawSettingsDesc')}
                    </p>
                  </div>
                </div>
              </Card>
            </TabsContent>
            
            {/* Hooks Settings */}
            <TabsContent value="hooks" className="space-y-6 mt-6">
              <Card className="p-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold mb-2">{t('settings.hooks.userHooks')}</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t('settings.hooks.userHooksDesc')}
                    </p>
                  </div>
                  
                  <HooksEditor
                    key={activeTab}
                    scope="user"
                    className="border-0"
                    hideActions={true}
                    onChange={(hasChanges, getHooks) => {
                      setUserHooksChanged(hasChanges);
                      getUserHooks.current = getHooks;
                    }}
                  />
                </div>
              </Card>
            </TabsContent>
            
            {/* Commands Tab */}
            <TabsContent value="commands" className="mt-6">
              <Card className="p-6">
                <SlashCommandsManager className="p-0" />
              </Card>
            </TabsContent>
            
            {/* Removed CLAUDE.md management tab from Settings */}
            
            {/* Storage Tab */}
            <TabsContent value="storage" className="mt-6">
              <StorageTab />
            </TabsContent>
            
            {/* Proxy Settings */}
            <TabsContent value="proxy" className="mt-6">
              <Card className="p-6">
                <ProxySettings 
                  setToast={setToast}
                  onChange={(hasChanges, _getSettings, save) => {
                    setProxySettingsChanged(hasChanges);
                    saveProxySettings.current = save;
                  }}
                />
              </Card>
            </TabsContent>
            
            {/* Analytics Settings */}
            <TabsContent value="analytics" className="space-y-6 mt-6">
              <Card className="p-6 space-y-6">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    <h3 className="text-base font-semibold">{t('settings.analytics.analyticsSettings')}</h3>
                  </div>
                  
                  <div className="space-y-6">
                    {/* Analytics Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="analytics-enabled" className="text-base">{t('settings.analytics.enableAnalytics')}</Label>
                        <p className="text-sm text-muted-foreground">
                          {t('settings.analytics.enableAnalyticsDesc')}
                        </p>
                      </div>
                      <Switch
                        id="analytics-enabled"
                        checked={analyticsEnabled}
                        onCheckedChange={async (checked) => {
                          if (checked && !analyticsConsented) {
                            setShowAnalyticsConsent(true);
                          } else if (checked) {
                            await analytics.enable();
                            setAnalyticsEnabled(true);
                            trackEvent.settingsChanged('analytics_enabled', true);
                            setToast({ message: t('settings.analytics.analyticsEnabled'), type: "success" });
                          } else {
                            await analytics.disable();
                            setAnalyticsEnabled(false);
                            trackEvent.settingsChanged('analytics_enabled', false);
                            setToast({ message: t('settings.analytics.analyticsDisabled'), type: "success" });
                          }
                        }}
                      />
                    </div>
                    
                    {/* Privacy Info */}
                    <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20 p-4">
                      <div className="flex gap-3">
                        <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <div className="space-y-2">
                          <p className="font-medium text-blue-900 dark:text-blue-100">{t('settings.analytics.privacyProtected')}</p>
                          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                            <li>• {t('settings.analytics.noPersonalInfo')}</li>
                            <li>• {t('settings.analytics.noFileContents')}</li>
                            <li>• {t('settings.analytics.anonymousData')}</li>
                            <li>• {t('settings.analytics.canDisable')}</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                    
                    {/* Data Collection Info */}
                    {analyticsEnabled && (
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-medium mb-2">{t('settings.analytics.whatWeCollect')}</h4>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            <li>• {t('settings.analytics.featureUsage')}</li>
                            <li>• {t('settings.analytics.performanceMetrics')}</li>
                            <li>• {t('settings.analytics.errorReports')}</li>
                            <li>• {t('settings.analytics.sessionFrequency')}</li>
                          </ul>
                        </div>
                        
                        {/* Delete Data Button */}
                        <div className="pt-4 border-t">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={async () => {
                              await analytics.deleteAllData();
                              setAnalyticsEnabled(false);
                              setAnalyticsConsented(false);
                              setToast({ message: t('settings.analytics.allDataDeleted'), type: "success" });
                            }}
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            {t('settings.analytics.deleteAllData')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
          </div>
        </div>
      )}
      </div>
      
      {/* Toast Notification */}
      <ToastContainer>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        )}
      </ToastContainer>
      
      {/* Analytics Consent Dialog */}
      <AnalyticsConsent
        open={showAnalyticsConsent}
        onOpenChange={setShowAnalyticsConsent}
        onComplete={async () => {
          await loadAnalyticsSettings();
          setShowAnalyticsConsent(false);
        }}
      />
    </div>
  );
}; 
