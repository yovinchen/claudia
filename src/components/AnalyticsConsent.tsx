import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, Shield, X, Check, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';

interface AnalyticsConsentProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onComplete?: () => void;
}

export const AnalyticsConsent: React.FC<AnalyticsConsentProps> = ({
  open: controlledOpen,
  onOpenChange,
  onComplete,
}) => {
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);
  const [hasShownConsent, setHasShownConsent] = useState(false);
  
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  
  useEffect(() => {
    // Check if we should show the consent dialog
    const checkConsent = async () => {
      await analytics.initialize();
      const settings = analytics.getSettings();
      
      if (!settings?.hasConsented && !hasShownConsent) {
        if (!isControlled) {
          setInternalOpen(true);
        }
        setHasShownConsent(true);
      }
    };
    
    checkConsent();
  }, [isControlled, hasShownConsent]);
  
  const handleOpenChange = (newOpen: boolean) => {
    if (isControlled && onOpenChange) {
      onOpenChange(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
  };
  
  const handleAccept = async () => {
    await analytics.enable();
    handleOpenChange(false);
    onComplete?.();
  };
  
  const handleDecline = async () => {
    await analytics.disable();
    handleOpenChange(false);
    onComplete?.();
  };
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <div className="p-6 pb-0">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                <BarChart3 className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <DialogTitle className="text-2xl">{t('settings.analytics.helpImproveClaudia')}</DialogTitle>
            </div>
            <DialogDescription className="text-base mt-2">
              {t('settings.analytics.collectAnonymousData')}
            </DialogDescription>
          </DialogHeader>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="space-y-3">
            <Card className="p-4 border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20">
              <div className="flex gap-3">
                <Check className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-green-900 dark:text-green-100">{t('settings.analytics.whatWeCollect')}</p>
                  <ul className="text-sm text-green-800 dark:text-green-200 space-y-1">
                    <li>• {t('settings.analytics.featureUsageDesc')}</li>
                    <li>• {t('settings.analytics.performanceMetricsDesc')}</li>
                    <li>• {t('settings.analytics.errorReportsDesc')}</li>
                    <li>• {t('settings.analytics.usagePatternsDesc')}</li>
                  </ul>
                </div>
              </div>
            </Card>
            
            <Card className="p-4 border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20">
              <div className="flex gap-3">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-blue-900 dark:text-blue-100">{t('settings.analytics.privacyProtected')}</p>
                  <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                    <li>• {t('settings.analytics.noPersonalInfo')}</li>
                    <li>• {t('settings.analytics.noFileContents')}</li>
                    <li>• {t('settings.analytics.noApiKeys')}</li>
                    <li>• {t('settings.analytics.anonymousData')}</li>
                    <li>• {t('settings.analytics.canOptOut')}</li>
                  </ul>
                </div>
              </div>
            </Card>
          </div>
          
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
            <div className="flex gap-2 items-start">
              <Info className="h-4 w-4 text-gray-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('settings.analytics.dataHelpsUs')}
              </p>
            </div>
          </div>
        </div>
        
        <div className="p-6 pt-0 flex gap-3">
          <Button
            onClick={handleDecline}
            variant="outline"
            className="flex-1"
          >
            {t('settings.analytics.noThanks')}
          </Button>
          <Button
            onClick={handleAccept}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
          >
            {t('settings.analytics.allowAnalytics')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface AnalyticsConsentBannerProps {
  className?: string;
}

export const AnalyticsConsentBanner: React.FC<AnalyticsConsentBannerProps> = ({
  className,
}) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  
  useEffect(() => {
    const checkConsent = async () => {
      if (hasChecked) return;
      
      // Check if we've already shown the consent dialog before
      const hasShownBefore = localStorage.getItem('claudia-analytics-consent-shown');
      if (hasShownBefore === 'true') {
        setHasChecked(true);
        return;
      }
      
      await analytics.initialize();
      const settings = analytics.getSettings();
      
      // Only show if user hasn't made a decision yet
      if (!settings?.hasConsented) {
        setVisible(true);
      }
      setHasChecked(true);
    };
    
    // Delay banner appearance for better UX
    const timer = setTimeout(checkConsent, 2000);
    return () => clearTimeout(timer);
  }, [hasChecked]);
  
  const handleAccept = async () => {
    await analytics.enable();
    // Mark that we've shown the consent dialog
    localStorage.setItem('claudia-analytics-consent-shown', 'true');
    setVisible(false);
  };
  
  const handleDecline = async () => {
    await analytics.disable();
    // Mark that we've shown the consent dialog
    localStorage.setItem('claudia-analytics-consent-shown', 'true');
    setVisible(false);
  };
  
  const handleClose = () => {
    // Even if they close without choosing, mark as shown
    localStorage.setItem('claudia-analytics-consent-shown', 'true');
    setVisible(false);
  };
  
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className={cn(
            "fixed bottom-4 right-4 z-50 max-w-md",
            className
          )}
        >
          <Card className="p-4 shadow-lg border-purple-200 dark:border-purple-800">
            <div className="flex items-start gap-3">
              <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <p className="text-sm font-medium">{t('settings.analytics.helpImproveClaudia')}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {t('settings.analytics.collectAnonymousData')}
                </p>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDecline}
                    className="text-xs"
                  >
                    {t('settings.analytics.noThanks')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAccept}
                    className="text-xs bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {t('settings.analytics.allowAnalytics')}
                  </Button>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
