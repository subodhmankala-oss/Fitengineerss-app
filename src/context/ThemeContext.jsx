import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// User-facing choice is one of 'light' | 'dark' | 'auto'; 'auto' follows the
// time of day on the device's own clock — light 6am-6pm, dark otherwise —
// and flips live at each boundary without needing a reload. Kept in sync
// with the identical LIGHT_START_HOUR/LIGHT_END_HOUR + resolution logic
// duplicated in index.html's pre-paint script.
const ThemeContext = createContext(null);

const STORAGE_KEY = 'themePreference';
const LIGHT_START_HOUR = 6; // 6am
const LIGHT_END_HOUR = 18; // 6pm

function resolveTheme(preference) {
  if (preference === 'auto') {
    const hour = new Date().getHours();
    return hour >= LIGHT_START_HOUR && hour < LIGHT_END_HOUR ? 'light' : 'dark';
  }
  return preference;
}

// Milliseconds until the next light/dark boundary (today's remaining one,
// or tomorrow's first one), so "auto" can flip exactly on time instead of
// polling.
function msUntilNextBoundary() {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  const hour = now.getHours();
  if (hour < LIGHT_START_HOUR) next.setHours(LIGHT_START_HOUR);
  else if (hour < LIGHT_END_HOUR) next.setHours(LIGHT_END_HOUR);
  else { next.setDate(next.getDate() + 1); next.setHours(LIGHT_START_HOUR); }
  return Math.max(1000, next.getTime() - now.getTime());
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

    // Flip exactly at the next 6am/6pm boundary while "Auto" is selected.
    // Re-checks (not just re-schedules) on each firing and on regaining
    // visibility/focus, so a laptop asleep across a boundary — or a clock
    // change — still lands on the correct theme instead of a stale timer.
    let cancelled = false;
    let timeoutId;
    const scheduleNext = () => {
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        applyResolvedTheme(resolveTheme('auto'));
        scheduleNext();
      }, msUntilNextBoundary());
    };
    scheduleNext();

    const onVisible = () => {
      if (document.visibilityState === 'visible') applyResolvedTheme(resolveTheme('auto'));
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
