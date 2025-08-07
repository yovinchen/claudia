import { motion } from "framer-motion";
import { Bot, FolderCode, BarChart, ServerCog, FileText, Settings, Network } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { ClaudiaLogoMinimal } from "@/components/ClaudiaLogo";
import { BorderGlowCard } from "@/components/ui/glow-card";

interface WelcomePageProps {
  onNavigate: (view: string) => void;
  onNewSession: () => void;
}

export function WelcomePage({ onNavigate, onNewSession }: WelcomePageProps) {
  const { t } = useTranslation();

  const mainFeatures = [
    {
      id: "relay-stations",
      icon: Network,
      title: t("welcome.relayStationManagement"),
      subtitle: t("welcome.relayStationManagementDesc"),
      color: "text-indigo-500",
      bgColor: "bg-indigo-500/10",
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
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      view: "projects"
    }
  ];

  const bottomFeatures = [
    {
      id: "usage",
      icon: BarChart,
      title: t("welcome.usageStatistics"),
      subtitle: t("welcome.usageStatisticsDesc"),
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      view: "usage-dashboard"
    },
    {
      id: "mcp",
      icon: ServerCog,
      title: t("welcome.mcpBroker"),
      subtitle: t("welcome.mcpBrokerDesc"),
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      view: "mcp"
    },
    {
      id: "claude-md",
      icon: FileText,
      title: t("welcome.claudeMd"),
      subtitle: t("welcome.claudeMdDesc"),
      color: "text-cyan-500",
      bgColor: "bg-cyan-500/10",
      view: "editor"
    },
    {
      id: "settings",
      icon: Settings,
      title: t("welcome.settings"),
      subtitle: t("welcome.settingsDesc"),
      color: "text-gray-500",
      bgColor: "bg-gray-500/10",
      view: "settings"
    }
  ];

  const handleCardClick = (view: string) => {
    onNavigate(view);
  };

  const handleButtonClick = () => {
    onNewSession();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background overflow-hidden">
      <div className="w-full max-w-6xl px-8">
        {/* Header */}
        <motion.div 
          className="text-center mb-16"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-5xl font-bold mb-4 flex items-center justify-center gap-4 bg-gradient-to-r from-orange-400 via-pink-500 to-purple-600 bg-clip-text text-transparent">
            <ClaudiaLogoMinimal size={56} />
            {t("app.welcome")}
          </h1>
          <p className="text-muted-foreground text-xl">
            {t("app.tagline")}
          </p>
        </motion.div>

        {/* Main Feature Cards */}
        <div className="grid grid-cols-3 gap-8 mb-12">
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
              <BorderGlowCard 
                className="h-full group" 
                onClick={() => handleCardClick(feature.view)}
              >
                <div className="p-10">
                  <div className="flex items-start gap-6">
                    <div className={`p-4 ${feature.bgColor} rounded-2xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}>
                      <feature.icon className={`h-10 w-10 ${feature.color}`} strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold mb-3 group-hover:text-primary transition-colors">
                        {feature.title}
                      </h2>
                      <p className="text-muted-foreground text-base leading-relaxed">
                        {feature.subtitle}
                      </p>
                    </div>
                  </div>
                </div>
              </BorderGlowCard>
            </motion.div>
          ))}
        </div>

        {/* Bottom Feature Cards */}
        <div className="grid grid-cols-4 gap-6 mb-12">
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
              <BorderGlowCard 
                className="h-36 group" 
                onClick={() => handleCardClick(feature.view)}
              >
                <div className="h-full flex flex-col items-center justify-center p-6">
                  <div className={`p-3 ${feature.bgColor} rounded-xl mb-3 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6`}>
                    <feature.icon className={`h-8 w-8 ${feature.color}`} strokeWidth={1.5} />
                  </div>
                  <h3 className="text-sm font-semibold mb-1 group-hover:text-primary transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-muted-foreground text-center line-clamp-2">
                    {feature.subtitle}
                  </p>
                </div>
              </BorderGlowCard>
            </motion.div>
          ))}
        </div>

        {/* Quick Action Button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ 
            duration: 0.5, 
            delay: 0.6,
            type: "spring",
            stiffness: 100
          }}
          className="flex justify-center"
        >
          <Button
            size="lg"
            className="relative px-10 py-7 text-lg font-semibold bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white border-0 shadow-2xl hover:shadow-orange-500/25 transition-all duration-300 hover:scale-105 rounded-2xl group overflow-hidden"
            onClick={handleButtonClick}
          >
            {/* Shimmer effect on button */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            </div>
            
            <span className="relative z-10 flex items-center gap-3">
              <span className="text-2xl">✨</span>
              {t("welcome.quickStartSession")}
              <span className="text-2xl">🚀</span>
            </span>
          </Button>
        </motion.div>
      </div>
    </div>
  );
}