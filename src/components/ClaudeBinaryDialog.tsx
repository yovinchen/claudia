import { useState, useEffect } from "react";
import { api, type ClaudeInstallation } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExternalLink, FileQuestion, Terminal, AlertCircle, Loader2 } from "lucide-react";
import { ClaudeVersionSelector } from "./ClaudeVersionSelector";
import { useTranslation } from "@/hooks/useTranslation";

interface ClaudeBinaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function ClaudeBinaryDialog({ open, onOpenChange, onSuccess, onError }: ClaudeBinaryDialogProps) {
  const { t } = useTranslation();
  const [selectedInstallation, setSelectedInstallation] = useState<ClaudeInstallation | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [hasInstallations, setHasInstallations] = useState(true);
  const [checkingInstallations, setCheckingInstallations] = useState(true);

  useEffect(() => {
    if (open) {
      checkInstallations();
    }
  }, [open]);

  const checkInstallations = async () => {
    try {
      setCheckingInstallations(true);
      const installations = await api.listClaudeInstallations();
      setHasInstallations(installations.length > 0);
    } catch (error) {
      // If the API call fails, it means no installations found
      setHasInstallations(false);
    } finally {
      setCheckingInstallations(false);
    }
  };

  const handleSave = async () => {
    if (!selectedInstallation) {
      onError(t('pleaseSelectInstallation'));
      return;
    }

    setIsValidating(true);
    try {
      await api.setClaudeBinaryPath(selectedInstallation.path);
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save Claude binary path:", error);
      onError(error instanceof Error ? error.message : "Failed to save Claude binary path");
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileQuestion className="w-5 h-5" />
            {t('selectClaudeCodeInstallation')}
          </DialogTitle>
          <DialogDescription className="space-y-3 mt-4">
            {checkingInstallations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">{t('searchingInstallations')}</span>
              </div>
            ) : hasInstallations ? (
              <p>
                {t('multipleInstallationsFound')}
              </p>
            ) : (
              <>
                <p>
                  {t('claudeCodeNotFoundDialog')}
                </p>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                  <AlertCircle className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">{t('searchedLocations')}:</span> PATH, /usr/local/bin, 
                    /opt/homebrew/bin, ~/.nvm/versions/node/*/bin, ~/.claude/local, ~/.local/bin
                  </p>
                </div>
              </>
            )}
            {!checkingInstallations && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                <Terminal className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">{t('validation.required')}:</span> {t('installationTip')}{" "}
                  <code className="px-1 py-0.5 bg-black/10 dark:bg-white/10 rounded">npm install -g @claude</code>
                </p>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        {!checkingInstallations && hasInstallations && (
          <div className="py-4">
            <ClaudeVersionSelector
              onSelect={(installation) => setSelectedInstallation(installation)}
              selectedPath={null}
            />
          </div>
        )}

        <DialogFooter className="gap-3">
          <Button
            variant="outline"
            onClick={() => window.open("https://docs.claude.ai/claude/how-to-install", "_blank")}
            className="mr-auto"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            {t('installationGuide')}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isValidating}
          >
            {t('app.cancel')}
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isValidating || !selectedInstallation || !hasInstallations}
          >
            {isValidating ? t('validating') : hasInstallations ? t('saveSelection') : t('noInstallationsFound')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 