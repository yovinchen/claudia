import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import { api } from '../lib/api';

export type ThemeMode = 'dark' | 'gray' | 'light' | 'custom';

export interface CustomThemeColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
}

interface ThemeContextType {
  theme: ThemeMode;
  customColors: CustomThemeColors;
  setTheme: (theme: ThemeMode) => Promise<void>;
  setCustomColors: (colors: Partial<CustomThemeColors>) => Promise<void>;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'theme_preference';
const CUSTOM_COLORS_STORAGE_KEY = 'theme_custom_colors';

// Default custom theme colors (based on current dark theme)
const DEFAULT_CUSTOM_COLORS: CustomThemeColors = {
  background: 'oklch(0.12 0.01 240)',
  foreground: 'oklch(0.98 0.01 240)',
  card: 'oklch(0.14 0.01 240)',
  cardForeground: 'oklch(0.98 0.01 240)',
  primary: 'oklch(0.98 0.01 240)',
  primaryForeground: 'oklch(0.12 0.01 240)',
  secondary: 'oklch(0.16 0.01 240)',
  secondaryForeground: 'oklch(0.98 0.01 240)',
  muted: 'oklch(0.16 0.01 240)',
  mutedForeground: 'oklch(0.65 0.01 240)',
  accent: 'oklch(0.16 0.01 240)',
  accentForeground: 'oklch(0.98 0.01 240)',
  destructive: 'oklch(0.6 0.2 25)',
  destructiveForeground: 'oklch(0.98 0.01 240)',
  border: 'oklch(0.16 0.01 240)',
  input: 'oklch(0.16 0.01 240)',
  ring: 'oklch(0.98 0.01 240)',
};

const VALID_THEMES: ThemeMode[] = ['dark', 'gray', 'light', 'custom'];
const DEFAULT_THEME: ThemeMode = 'gray';

const isThemeMode = (value: unknown): value is ThemeMode =>
  typeof value === 'string' && (VALID_THEMES as string[]).includes(value);

// Local cache so the saved theme is applied synchronously on startup/refresh,
// before the async backend read completes (avoids flashing the default theme).
const readLocalTheme = (): ThemeMode | null => {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(value) ? value : null;
  } catch {
    return null;
  }
};

const readLocalColors = (): CustomThemeColors | null => {
  try {
    const value = localStorage.getItem(CUSTOM_COLORS_STORAGE_KEY);
    return value ? { ...DEFAULT_CUSTOM_COLORS, ...JSON.parse(value) } : null;
  } catch {
    return null;
  }
};

const writeLocal = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota / unavailable storage
  }
};

// Apply theme to document
const applyThemeToDocument = (themeMode: ThemeMode, colors: CustomThemeColors) => {
  const root = document.documentElement;

  // Remove all theme classes
  root.classList.remove('theme-dark', 'theme-gray', 'theme-light', 'theme-custom');

  // Add new theme class
  root.classList.add(`theme-${themeMode}`);

  // If custom theme, apply custom colors as CSS variables
  if (themeMode === 'custom') {
    Object.entries(colors).forEach(([key, value]) => {
      const cssVarName = `--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      root.style.setProperty(cssVarName, value);
    });
  } else {
    // Clear custom CSS variables when not using custom theme
    Object.keys(colors).forEach((key) => {
      const cssVarName = `--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      root.style.removeProperty(cssVarName);
    });
  }
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const initialTheme = readLocalTheme() ?? DEFAULT_THEME;
    applyThemeToDocument(initialTheme, readLocalColors() ?? DEFAULT_CUSTOM_COLORS);
    return initialTheme;
  });
  const [customColors, setCustomColorsState] = useState<CustomThemeColors>(
    () => readLocalColors() ?? DEFAULT_CUSTOM_COLORS
  );
  const [isLoading, setIsLoading] = useState(true);
  // Set once the user changes the theme, so a slow initial load can't overwrite it
  const userChangedThemeRef = useRef(false);
  const userChangedColorsRef = useRef(false);

  const applyTheme = useCallback((themeMode: ThemeMode, colors: CustomThemeColors) => {
    applyThemeToDocument(themeMode, colors);
  }, []);

  // Load theme preference and custom colors from backend storage (source of truth)
  useEffect(() => {
    let cancelled = false;
    const loadTheme = async () => {
      try {
        const [savedTheme, savedColorsRaw] = await Promise.all([
          api.getSetting(THEME_STORAGE_KEY),
          api.getSetting(CUSTOM_COLORS_STORAGE_KEY),
        ]);
        if (cancelled) return;

        let colors: CustomThemeColors | null = null;
        if (savedColorsRaw && !userChangedColorsRef.current) {
          try {
            colors = { ...DEFAULT_CUSTOM_COLORS, ...JSON.parse(savedColorsRaw) };
          } catch (e) {
            console.error('Failed to parse saved custom colors:', e);
          }
        }
        if (colors) {
          setCustomColorsState(colors);
          writeLocal(CUSTOM_COLORS_STORAGE_KEY, JSON.stringify(colors));
        }

        if (!userChangedThemeRef.current) {
          const localTheme = readLocalTheme();
          let themeMode: ThemeMode;
          if (isThemeMode(savedTheme)) {
            themeMode = savedTheme;
            writeLocal(THEME_STORAGE_KEY, themeMode);
          } else if (localTheme) {
            // Backend has no value (e.g. an earlier save was lost) - migrate local cache to backend
            themeMode = localTheme;
            api.saveSetting(THEME_STORAGE_KEY, localTheme).catch(() => {});
          } else {
            themeMode = DEFAULT_THEME;
          }
          setThemeState(themeMode);
          applyTheme(themeMode, colors ?? readLocalColors() ?? DEFAULT_CUSTOM_COLORS);
        }
      } catch (error) {
        console.error('Failed to load theme settings:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadTheme();
    return () => {
      cancelled = true;
    };
  }, [applyTheme]);

  const setTheme = useCallback(async (newTheme: ThemeMode) => {
    try {
      setIsLoading(true);
      
      userChangedThemeRef.current = true;

      // Apply theme immediately and cache locally (survives refresh/restart even if backend is slow)
      setThemeState(newTheme);
      applyTheme(newTheme, customColors);
      writeLocal(THEME_STORAGE_KEY, newTheme);
      
      // Save to storage
      await api.saveSetting(THEME_STORAGE_KEY, newTheme);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    } finally {
      setIsLoading(false);
    }
  }, [customColors, applyTheme]);

  const setCustomColors = useCallback(async (colors: Partial<CustomThemeColors>) => {
    try {
      setIsLoading(true);
      
      userChangedColorsRef.current = true;
      const newColors = { ...customColors, ...colors };
      setCustomColorsState(newColors);
      writeLocal(CUSTOM_COLORS_STORAGE_KEY, JSON.stringify(newColors));
      
      // Apply immediately if custom theme is active
      if (theme === 'custom') {
        applyTheme('custom', newColors);
      }
      
      // Save to storage
      await api.saveSetting(CUSTOM_COLORS_STORAGE_KEY, JSON.stringify(newColors));
    } catch (error) {
      console.error('Failed to save custom colors:', error);
    } finally {
      setIsLoading(false);
    }
  }, [theme, customColors, applyTheme]);

  const value: ThemeContextType = {
    theme,
    customColors,
    setTheme,
    setCustomColors,
    isLoading,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeContext = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
};