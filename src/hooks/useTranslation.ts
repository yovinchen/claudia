import { useTranslation as useI18nTranslation } from 'react-i18next';

/**
 * 自定义 i18n Hook，提供类型安全的翻译功能
 */
export const useTranslation = (namespace?: string) => {
  const { t, i18n } = useI18nTranslation(namespace || 'common');

  /**
   * 切换语言
   * @param language 语言代码 ('en' | 'zh')
   */
  const changeLanguage = (language: string) => {
    i18n.changeLanguage(language);
  };

  /**
   * 获取当前语言
   */
  const currentLanguage = i18n.language;

  /**
   * 检查是否是中文
   */
  const isChineseLang = currentLanguage.startsWith('zh');

  /**
   * 获取支持的语言列表
   */
  const supportedLanguages = [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'zh', name: 'Chinese', nativeName: '中文' },
  ];

  return {
    t,
    changeLanguage,
    currentLanguage,
    isChineseLang,
    supportedLanguages,
    i18n,
  };
};

/**
 * 语言选择器组件的辅助函数
 */
export const getLanguageDisplayName = (code: string, displayInNative = false) => {
  const languages = {
    en: displayInNative ? 'English' : 'English',
    zh: displayInNative ? '中文' : 'Chinese',
  };
  
  return languages[code as keyof typeof languages] || code;
};