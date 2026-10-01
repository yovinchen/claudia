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
  const { t } = useTranslation();

  const themes = [
    {
      key: 'light',
      name: t('settings.themeSelector.light'),
      icon: Sun,
      description: t('settings.themeSelector.lightDesc')
    },
    {
      key: 'gray',
      name: t('settings.themeSelector.gray'),
      icon: Monitor,
      description: t('settings.themeSelector.grayDesc')
    },
    {
      key: 'dark',
      name: t('settings.themeSelector.dark'),
      icon: Moon,
      description: t('settings.themeSelector.darkDesc')
    },
    {
      key: 'custom',
      name: t('settings.themeSelector.custom'),
      icon: Palette,
      description: t('settings.themeSelector.customDesc')
    }
  ] as const;

  const getCurrentThemeIcon = () => {
    const currentTheme = themes.find(item => item.key === theme);
    const IconComponent = currentTheme?.icon || Monitor;
    return IconComponent;
  };

  const getCurrentThemeName = () => {
    const currentTheme = themes.find(item => item.key === theme);
    return currentTheme?.name || t('settings.theme');
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
          title={t('settings.themeSelector.switchTheme')}
          aria-label={t('settings.themeSelector.switchThemeCurrent', { theme: getCurrentThemeName() })}
        >
          <IconComponent className="h-4 w-4" aria-hidden="true" />
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
                <ThemeIcon className="h-4 w-4" aria-hidden="true" />
                <div className="flex flex-col">
                  <span className="font-medium">{themeOption.name}</span>
                  <span className="text-xs text-muted-foreground">{themeOption.description}</span>
                </div>
              </div>
              {theme === themeOption.key && (
                <>
                  <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span className="sr-only">{t('settings.selected')}</span>
                </>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};