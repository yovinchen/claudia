import React from 'react';
import { Globe, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/hooks/useTranslation';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  className?: string;
  showText?: boolean;
}

/**
 * 语言切换组件
 * 
 * @example
 * <LanguageSwitcher />
 * <LanguageSwitcher showText={true} className="ml-2" />
 */
export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ 
  className,
  showText = false 
}) => {
  const { changeLanguage, currentLanguage, supportedLanguages } = useTranslation();

  const handleLanguageChange = async (languageCode: string) => {
    try {
      // 映射前端语言代码到后端格式
      const backendLocale = languageCode === 'zh' ? 'zh-CN' : 'en-US';
      
      // 同步到后端
      await api.setLanguage(backendLocale);
      
      // 更新前端
      changeLanguage(languageCode);
    } catch (error) {
      console.error('Failed to change language:', error);
      // 即使后端同步失败，也要尝试更新前端
      changeLanguage(languageCode);
    }
  };

  const getCurrentLanguageDisplay = () => {
    const currentLang = supportedLanguages.find(lang => lang.code === currentLanguage);
    return currentLang?.nativeName || currentLanguage.toUpperCase();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("gap-2", className)}
        >
          <Globe className="h-4 w-4" />
          {showText && <span className="hidden sm:inline">{getCurrentLanguageDisplay()}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {supportedLanguages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => handleLanguageChange(language.code)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex flex-col">
              <span className="font-medium">{language.nativeName}</span>
              <span className="text-xs text-muted-foreground">{language.name}</span>
            </div>
            {currentLanguage === language.code && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};