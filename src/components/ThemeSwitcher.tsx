import React from 'react';
import { Sun, Moon, Monitor, Palette, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';

interface ThemeSwitcherProps {
  className?: string;
  showText?: boolean;
}

/**
 * 主题快速切换组件
 * 
 * @example
 * <ThemeSwitcher />
 * <ThemeSwitcher showText={true} className="ml-2" />
 */
export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ 
  className,
  showText = false 
}) => {
  const { theme, setTheme } = useTheme();
  const { currentLanguage } = useTranslation();

  const themes = [
    {
      key: 'light',
      name: currentLanguage === 'zh' ? '浅色' : 'Light',
      icon: Sun,
      description: currentLanguage === 'zh' ? '明亮模式' : 'Bright mode'
    },
    {
      key: 'gray',
      name: currentLanguage === 'zh' ? '灰色' : 'Gray',
      icon: Monitor,
      description: currentLanguage === 'zh' ? '舒适模式' : 'Comfortable mode'
    },
    {
      key: 'dark',
      name: currentLanguage === 'zh' ? '深色' : 'Dark',
      icon: Moon,
      description: currentLanguage === 'zh' ? '暗黑模式' : 'Dark mode'
    },
    {
      key: 'custom',
      name: currentLanguage === 'zh' ? '自定义' : 'Custom',
      icon: Palette,
      description: currentLanguage === 'zh' ? '个性化' : 'Personalized'
    }
  ] as const;

  const getCurrentThemeIcon = () => {
    const currentTheme = themes.find(t => t.key === theme);
    const IconComponent = currentTheme?.icon || Monitor;
    return IconComponent;
  };

  const getCurrentThemeName = () => {
    const currentTheme = themes.find(t => t.key === theme);
    return currentTheme?.name || (currentLanguage === 'zh' ? '主题' : 'Theme');
  };

  const handleThemeChange = async (themeKey: string) => {
    try {
      await setTheme(themeKey as any);
    } catch (error) {
      console.error('Failed to change theme:', error);
    }
  };

  const IconComponent = getCurrentThemeIcon();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-2", className)}
          title={currentLanguage === 'zh' ? '切换主题' : 'Switch theme'}
        >
          <IconComponent className="h-4 w-4" />
          {showText && <span className="hidden sm:inline">{getCurrentThemeName()}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {themes.map((themeOption) => {
          const ThemeIcon = themeOption.icon;
          return (
            <DropdownMenuItem
              key={themeOption.key}
              onClick={() => handleThemeChange(themeOption.key)}
              className="flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <ThemeIcon className="h-4 w-4" />
                <div className="flex flex-col">
                  <span className="font-medium">{themeOption.name}</span>
                  <span className="text-xs text-muted-foreground">{themeOption.description}</span>
                </div>
              </div>
              {theme === themeOption.key && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};