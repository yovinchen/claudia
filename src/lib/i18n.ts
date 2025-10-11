import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// 引入语言资源文件
import en from '@/locales/en/common.json';
import zh from '@/locales/zh/common.json';

// 配置语言检测器
const languageDetectorOptions = {
    // 检测顺序
    order: ['localStorage', 'navigator', 'htmlTag'],
    // 缓存语言到localStorage
    caches: ['localStorage'],
    // 检查所有可用语言
    checkWhitelist: true,
};

const i18nDebug = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_I18N_DEBUG === 'true');

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        // 回退语言
        fallbackLng: 'en',
        debug: i18nDebug,

        // 语言资源
        resources: {
            en: {
                common: en,
            },
            zh: {
                common: zh,
            },
            'zh-CN': {
                common: zh,
            },
            'zh-TW': {
                common: zh,
            },
        },

        // 命名空间配置
        defaultNS: 'common',
        ns: ['common'],

        // 语言检测选项
        detection: languageDetectorOptions,

        // 插值配置
        interpolation: {
            escapeValue: false, // React 已经默认防止XSS
        },

        // 白名单支持的语言
        supportedLngs: ['en', 'zh', 'zh-CN', 'zh-TW'],

        // 非显式支持的语言回退到en
        nonExplicitSupportedLngs: true,
    });

export default i18n;
