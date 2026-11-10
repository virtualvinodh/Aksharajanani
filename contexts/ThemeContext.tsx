import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { Theme, ThemePreference } from '../types';

interface ThemeContextType {
  /** The theme actually shown ('auto' resolved against the OS setting). */
  theme: Theme;
  /** What the user picked. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** Shorthand for picking a fixed theme. */
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// New storage key on purpose: the old 'theme' key was written automatically on
// every first visit (copying the OS setting), so it is not a real user choice.
const PREFERENCE_KEY = 'themePreference';
const DEFAULT_PREFERENCE: ThemePreference = 'light';
const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');

const readPreference = (): ThemePreference => {
  try {
    const saved = localStorage.getItem(PREFERENCE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
  } catch { /* storage unavailable */ }
  return DEFAULT_PREFERENCE;
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => !!darkQuery()?.matches);

  // Keep following the OS while on 'auto'.
  useEffect(() => {
    const mq = darkQuery();
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const theme: Theme = preference === 'auto' ? (systemIsDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    try { localStorage.setItem(PREFERENCE_KEY, next); } catch { /* storage unavailable */ }
  };

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference, setTheme: setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
