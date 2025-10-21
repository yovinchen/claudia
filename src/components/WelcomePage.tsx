import { motion } from "framer-motion";
import { Bot, FolderCode, BarChart, ServerCog, FileText, Settings, Network, Router, Zap, FolderOpen, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { ClaudiaLogoMinimal } from "@/components/ClaudiaLogo";
import { useState } from "react";

interface WelcomePageProps {
  onNavigate: (view: string) => void;
  onNewSession: () => void;
  onSmartQuickStart?: () => void;
}

export function WelcomePage({ onNavigate, onNewSession, onSmartQuickStart }: WelcomePageProps) {
  const { t } = useTranslation();
  const [isCreatingSmartSession, setIsCreatingSmartSession] = useState(false);

  const mainFeatures = [
    {
      id: "relay-stations",
      icon: Network,
      title: t("welcome.relayStationManagement"),
      subtitle: t("welcome.relayStationManagementDesc"),
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      view: "relay-stations"
    },
    {
      id: "agents",
      icon: Bot,
      title: t("welcome.agentManagement"),
      subtitle: t("welcome.agentManagementDesc"),
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      view: "cc-agents"
    },
    {
      id: "projects",
      icon: FolderCode,
      title: t("welcome.projectManagement"),
      subtitle: t("welcome.projectManagementDesc"),
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      view: "projects"
    }
  ];

  const bottomFeatures = [
    {
      id: "usage",
      icon: BarChart,
      title: t("welcome.usageStatistics"),
      subtitle: t("welcome.usageStatisticsDesc"),
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      view: "usage-dashboard"
    },
    {
      id: "mcp",
      icon: ServerCog,
      title: t("welcome.mcpBroker"),
      subtitle: t("welcome.mcpBrokerDesc"),
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      view: "mcp"
    },
    {
      id: "ccr-router",
      icon: Router,
      title: t("welcome.ccrRouter"),
      subtitle: t("welcome.ccrRouterDesc"),
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      view: "ccr-router"
    },
    {
      id: "prompt-files",
      icon: FileText,
      title: t("welcome.promptFiles"),
      subtitle: t("welcome.promptFilesDesc"),
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      view: "prompt-files"
    },
    {
      id: "settings",
      icon: Settings,
      title: t("welcome.settings"),
      subtitle: t("welcome.settingsDesc"),
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
      view: "settings"
    }
  ];

  const handleCardClick = (view: string) => {
    onNavigate(view);
  };

  const handleButtonClick = () => {
    onNewSession();
  };

  const handleSmartQuickStartClick = async () => {
    if (!onSmartQuickStart) return;
    
    setIsCreatingSmartSession(true);
    try {
      await onSmartQuickStart();
    } finally {
      setIsCreatingSmartSession(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background overflow-hidden">
      <div className="w-full max-w-6xl px-8 -mt-20">
        {/* Header */}
        <motion.div 
          className="text-center mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-5xl font-bold mb-4 flex items-center justify-center gap-4 text-foreground">
            <ClaudiaLogoMinimal size={56} />
            {t("app.welcome")}
          </h1>
          <p className="text-muted-foreground text-xl">
            {t("app.tagline")}
          </p>
        </motion.div>

        {/* Main Feature Cards */}
        <div className="grid grid-cols-3 gap-8 mb-10">
          {mainFeatures.map((feature, index) => (
            <motion.div
              key={feature.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ 
                duration: 0.4, 
                delay: 0.1 * index,
                type: "spring",
                stiffness: 100
              }}
            >
              <div 
                className="h-full group bg-card/50 border border-border rounded-lg hover:bg-card hover:border-orange-500/50 transition-all duration-300 cursor-pointer" 
                onClick={() => handleCardClick(feature.view)}
              >
                <div className="p-10">
                  <div className="flex items-start gap-6">
                    <div className={`p-4 ${feature.bgColor} rounded-2xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}>
                      <feature.icon className={`h-10 w-10 ${feature.color}`} strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold mb-3 text-foreground group-hover:text-primary transition-colors">
                        {feature.title}
                      </h2>
                      <p className="text-muted-foreground text-base leading-relaxed">
                        {feature.subtitle}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom Feature Cards */}
        <div className="grid grid-cols-5 gap-6 mb-10">
          {bottomFeatures.map((feature, index) => (
            <motion.div
              key={feature.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                duration: 0.4, 
                delay: 0.3 + 0.05 * index,
                type: "spring",
                stiffness: 100
              }}
            >
              <div 
                className="h-32 group bg-card/50 border border-border rounded-lg hover:bg-card hover:border-orange-500/50 transition-all duration-300 cursor-pointer" 
                onClick={() => handleCardClick(feature.view)}
              >
                <div className="h-full flex items-center p-6">
                  <div className={`p-3 ${feature.bgColor} rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6 mr-4 flex-shrink-0`}>
                    <feature.icon className={`h-7 w-7 ${feature.color}`} strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold mb-1 text-foreground group-hover:text-primary transition-colors truncate">
                      {feature.title}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {feature.subtitle}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Quick Action Buttons */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ 
            duration: 0.5, 
            delay: 0.6,
            type: "spring",
            stiffness: 100
          }}
          className="flex justify-center gap-4"
        >
          {/* 智能快速开始 - 新功能 */}
          {onSmartQuickStart && (
            <Button
              size="lg"
              className="relative px-8 py-6 text-lg font-semibold bg-orange-500 hover:bg-orange-600 text-white border-0 shadow-2xl hover:shadow-orange-500/25 transition-all duration-300 hover:scale-105 rounded-2xl group overflow-hidden"
              onClick={handleSmartQuickStartClick}
              disabled={isCreatingSmartSession}
            >
              {/* Shimmer effect on button */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
              </div>
              
              <span className="relative z-10 flex items-center gap-2">
                {isCreatingSmartSession ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t("welcome.creatingSmartSession")}
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    {t("welcome.smartQuickStart")}
                  </>
                )}
              </span>
            </Button>
          )}

          {/* 传统快速开始 - 保持原功能 */}
          <Button
            size="lg"
            variant="outline"
            className="relative px-8 py-6 text-lg font-semibold border-2 border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white transition-all duration-300 hover:scale-105 rounded-2xl group"
            onClick={handleButtonClick}
          >
            <span className="relative z-10 flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              {t("welcome.choosePathStart")}
            </span>
          </Button>
        </motion.div>
      </div>
    </div>
  );
}