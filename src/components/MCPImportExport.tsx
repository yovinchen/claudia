import React, { useState } from "react";
import { Download, Upload, FileText, Loader2, Info, Network, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SelectComponent } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";

interface MCPImportExportProps {
  /**
   * Callback when import is completed
   */
  onImportCompleted: (imported: number, failed: number) => void;
  /**
   * Callback for error messages
   */
  onError: (message: string) => void;
}

/**
 * Component for importing and exporting MCP server configurations
 */
export const MCPImportExport: React.FC<MCPImportExportProps> = ({
  onImportCompleted,
  onError,
}) => {
  const { t } = useTranslation();
  const [importingDesktop, setImportingDesktop] = useState(false);
  const [importingJson, setImportingJson] = useState(false);
  const [importScope, setImportScope] = useState("local");
  const [exporting, setExporting] = useState(false);

  /**
   * Imports servers from Claude Desktop
   */
  const handleImportFromDesktop = async () => {
    try {
      setImportingDesktop(true);
      // Always use "user" scope for Claude Desktop imports (was previously "global")
      const result = await api.mcpAddFromClaudeDesktop("user");
      
      // Show detailed results if available
      if (result.servers && result.servers.length > 0) {
        const successfulServers = result.servers.filter(s => s.success);
        const failedServers = result.servers.filter(s => !s.success);
        
        if (successfulServers.length > 0) {
          const successMessage = `Successfully imported: ${successfulServers.map(s => s.name).join(", ")}`;
          onImportCompleted(result.imported_count, result.failed_count);
          // Show success details
          if (failedServers.length === 0) {
            onError(successMessage);
          }
        }
        
        if (failedServers.length > 0) {
          const failureDetails = failedServers
            .map(s => `${s.name}: ${s.error || "Unknown error"}`)
            .join("\n");
          onError(`Failed to import some servers:\n${failureDetails}`);
        }
      } else {
        onImportCompleted(result.imported_count, result.failed_count);
      }
    } catch (error: any) {
      console.error("Failed to import from Claude Desktop:", error);
      onError(error.toString() || "Failed to import from Claude Desktop");
    } finally {
      setImportingDesktop(false);
    }
  };

  /**
   * Handles JSON file import
   */
  const handleJsonFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImportingJson(true);
      const content = await file.text();
      
      // Parse the JSON to validate it
      let jsonData;
      try {
        jsonData = JSON.parse(content);
      } catch (e) {
        onError("Invalid JSON file. Please check the format.");
        return;
      }

      // Check if it's a single server or multiple servers
      if (jsonData.mcpServers) {
        // Multiple servers format
        let imported = 0;
        let failed = 0;

        for (const [name, config] of Object.entries(jsonData.mcpServers)) {
          try {
            const serverConfig = {
              type: "stdio",
              command: (config as any).command,
              args: (config as any).args || [],
              env: (config as any).env || {}
            };
            
            const result = await api.mcpAddJson(name, JSON.stringify(serverConfig), importScope);
            if (result.success) {
              imported++;
            } else {
              failed++;
            }
          } catch (e) {
            failed++;
          }
        }
        
        onImportCompleted(imported, failed);
      } else if (jsonData.type && jsonData.command) {
        // Single server format
        const name = prompt("Enter a name for this server:");
        if (!name) return;

        const result = await api.mcpAddJson(name, content, importScope);
        if (result.success) {
          onImportCompleted(1, 0);
        } else {
          onError(result.message);
        }
      } else {
        onError("Unrecognized JSON format. Expected MCP server configuration.");
      }
    } catch (error) {
      console.error("Failed to import JSON:", error);
      onError("Failed to import JSON file");
    } finally {
      setImportingJson(false);
      // Reset the input
      event.target.value = "";
    }
  };

  /**
   * Handles exporting servers
   */
  const handleExport = async () => {
    try {
      setExporting(true);
      const result = await api.mcpExportServers();
      
      if (result.servers.length === 0) {
        onError("No MCP servers configured to export");
        return;
      }

      let jsonContent: string;
      let defaultFileName: string;

      if (result.format === "single" && result.servers.length === 1) {
        // Single server format
        const server = result.servers[0];
        const exportData: any = {
          type: server.transport,
        };

        if (server.transport === "stdio") {
          exportData.command = server.command;
          exportData.args = server.args;
          exportData.env = server.env;
        } else if (server.transport === "sse") {
          exportData.url = server.url;
        }

        jsonContent = JSON.stringify(exportData, null, 2);
        defaultFileName = `mcp-server-${server.name}.json`;
      } else {
        // Multiple servers format
        const exportData: any = {
          mcpServers: {}
        };

        for (const server of result.servers) {
          const serverConfig: any = {
            command: server.command || "",
            args: server.args,
            env: server.env
          };

          if (server.transport === "sse") {
            serverConfig.url = server.url;
          }

          exportData.mcpServers[server.name] = serverConfig;
        }

        jsonContent = JSON.stringify(exportData, null, 2);
        defaultFileName = "mcp-servers.json";
      }

      // Use Tauri's save dialog
      const { save } = await import('@tauri-apps/plugin-dialog');
      const filePath = await save({
        defaultPath: defaultFileName,
        filters: [{
          name: 'JSON',
          extensions: ['json']
        }]
      });

      if (filePath) {
        // Use Tauri's file system API to write the file
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        await writeTextFile(filePath, jsonContent);
        onError(`Successfully exported ${result.servers.length} server(s) to ${filePath}`);
      }
    } catch (error: any) {
      console.error("Failed to export servers:", error);
      onError(error.toString() || "Failed to export servers");
    } finally {
      setExporting(false);
    }
  };

  /**
   * Starts Claude Code as MCP server
   */
  const handleStartMCPServer = async () => {
    try {
      await api.mcpServe();
      onError("Claude Code MCP server started. You can now connect to it from other applications.");
    } catch (error) {
      console.error("Failed to start MCP server:", error);
      onError("Failed to start Claude Code as MCP server");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-base font-semibold">{t('mcp.importExport')}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t('mcp.importExportDescription')}
        </p>
      </div>

      <div className="space-y-4">
        {/* Import Scope Selection */}
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Settings2 className="h-4 w-4 text-slate-500" />
              <Label className="text-sm font-medium">{t('mcp.importScope')}</Label>
            </div>
            <SelectComponent
              value={importScope}
              onValueChange={(value: string) => setImportScope(value)}
              options={[
                { value: "local", label: t('mcp.localProjectOnly') },
                { value: "project", label: t('mcp.projectShared') },
                { value: "user", label: t('mcp.userAllProjects') },
              ]}
            />
            <p className="text-xs text-muted-foreground">
              {t('mcp.chooseImportLocation')}
            </p>
          </div>
        </Card>

        {/* Import from Claude Desktop */}
        <Card className="p-4 hover:bg-accent/5 transition-colors">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-blue-500/10 rounded-lg">
                <Download className="h-5 w-5 text-blue-500" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium">{t('mcp.importFromClaudeDesktop')}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('mcp.importFromClaudeDesktopDescription')}
                </p>
              </div>
            </div>
            <Button
              onClick={handleImportFromDesktop}
              disabled={importingDesktop}
              className="w-full gap-2 bg-primary hover:bg-primary/90"
            >
              {importingDesktop ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('mcp.importing')}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  {t('mcp.importFromClaudeDesktop')}
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Import from JSON */}
        <Card className="p-4 hover:bg-accent/5 transition-colors">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-purple-500/10 rounded-lg">
                <FileText className="h-5 w-5 text-purple-500" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium">{t('mcp.importFromJSON')}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('mcp.importFromJSONDescription')}
                </p>
              </div>
            </div>
            <div>
              <input
                type="file"
                accept=".json"
                onChange={handleJsonFileSelect}
                disabled={importingJson}
                className="hidden"
                id="json-file-input"
              />
              <Button
                onClick={() => document.getElementById("json-file-input")?.click()}
                disabled={importingJson}
                className="w-full gap-2"
                variant="outline"
              >
                {importingJson ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('mcp.importing')}
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    {t('mcp.chooseJSONFile')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* Export Configuration */}
        <Card className="p-4 hover:bg-accent/5 transition-colors">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-green-500/10 rounded-lg">
                <Upload className="h-5 w-5 text-green-500" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium">{t('mcp.exportConfiguration')}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('mcp.exportConfigurationDescription')}
                </p>
              </div>
            </div>
            <Button
              onClick={handleExport}
              disabled={exporting}
              variant="outline"
              className="w-full gap-2"
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('mcp.exporting')}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {t('mcp.exportConfiguration')}
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Serve as MCP */}
        <Card className="p-4 border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-green-500/20 rounded-lg">
                <Network className="h-5 w-5 text-green-500" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium">{t('mcp.useClaudeCodeAsMCPServer')}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('mcp.useClaudeCodeAsMCPServerDescription')}
                </p>
              </div>
            </div>
            <Button
              onClick={handleStartMCPServer}
              variant="outline"
              className="w-full gap-2 border-green-500/20 hover:bg-green-500/10 hover:text-green-600 hover:border-green-500/50"
            >
              <Network className="h-4 w-4" />
              {t('mcp.startMCPServer')}
            </Button>
          </div>
        </Card>
      </div>

      {/* Info Box */}
      <Card className="p-4 bg-muted/30">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Info className="h-4 w-4 text-primary" />
            <span>{t('mcp.jsonFormatExamples')}</span>
          </div>
          <div className="space-y-3 text-xs">
            <div>
              <p className="font-medium text-muted-foreground mb-1">{t('mcp.singleServer')}:</p>
              <pre className="bg-background p-3 rounded-lg overflow-x-auto">
{`{
  "type": "stdio",
  "command": "/path/to/server",
  "args": ["--arg1", "value"],
  "env": { "KEY": "value" }
}`}
              </pre>
            </div>
            <div>
              <p className="font-medium text-muted-foreground mb-1">{t('mcp.multipleServers')}:</p>
              <pre className="bg-background p-3 rounded-lg overflow-x-auto">
{`{
  "mcpServers": {
    "server1": {
      "command": "/path/to/server1",
      "args": [],
      "env": {}
    },
    "server2": {
      "command": "/path/to/server2",
      "args": ["--port", "8080"],
      "env": { "API_KEY": "..." }
    }
  }
}`}
              </pre>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}; 