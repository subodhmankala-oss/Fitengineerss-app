import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// User-facing choice is one of 'light' | 'dark' | 'auto'; 'auto' follows the
// OS/browser prefers-color-scheme setting and updates live if that changes
// (e.g. system switches to dark at sunset) without needing a reload.
const ThemeContext = createContext(null);

const STORAGE_KEY = 'themePreference';
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function resolveTheme(preference) {
  if (preference === 'auto') {
    return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
  }
  return preference;
}

// Keeps the browser/OS chrome (status bar, task switcher card) matching the
// app's own background instead of the hardcoded dark value in index.html.
function applyResolvedTheme(resolved) {
  document.documentElement.setAttribute('data-theme', resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#f8fafc' : '#0B1220');
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto';
  });

  useEffect(() => {
    applyResolvedTheme(resolveTheme(preference));
    if (preference !== 'auto') return;

    // Live-follow the OS setting while "Auto" is selected.
    const mql = window.matchMedia(DARK_MEDIA_QUERY);
    const onChange = () => applyResolvedTheme(resolveTheme('auto'));
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [preference]);

  const setTheme = useCallback((next) => {
    localStorage.setItem(STORAGE_KEY, next);
    setPreference(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
