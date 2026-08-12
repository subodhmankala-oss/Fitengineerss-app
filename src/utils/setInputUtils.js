// Shared behavior for the weight/reps/km/time number inputs in the set-logging
// tables (WorkoutTracker's client view and TrainerDashboard's coach Live Log
// tab both render the same "hevy-set-row" markup and hit the same three
// on-device-keyboard problems, so the fixes live here once).
import { useCallback, useEffect, useRef } from 'react';

// Native mobile keyboards drop the caret wherever the tap landed (often the
// start or middle of the existing value). For these fields you always want
// to keep typing from the end, so pin the caret there on every focus.
export function moveCaretToEnd(e) {
  const el = e.target;
  if (!el || typeof el.setSelectionRange !== 'function') return;
  const len = el.value != null ? String(el.value).length : 0;
  // Needs a tick — iOS/Android both reset the selection right after the
  // focus event fires, so setting it synchronously gets overwritten.
  requestAnimationFrame(() => {
    try { el.setSelectionRange(len, len); } catch { /* not all input types support selection */ }
  });
}

// The browser's default "scroll focused input above the keyboard" jump is
// instant and fires mid-keyboard-animation, which is what reads as a sudden
// glitch. Doing our own smooth, slightly-delayed scroll (after the keyboard
// has started sliding in) keeps the field comfortably clear of it instead.
export function scrollInputIntoView(e) {
  const el = e.target;
  if (!el) return;
  setTimeout(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 250);
}

// Combined onFocus handler for every set-row number input.
export function handleSetInputFocus(e) {
  moveCaretToEnd(e);
  scrollInputIntoView(e);
}

// Once the user stops typing a value in one field (e.g. weight) for `delay`ms,
// auto-advance focus to the next field in the row (e.g. reps) — mirrors how
// OTP/multi-field numeric entry usually behaves. Debounced (not "on every
// keystroke") so multi-digit numbers finish before focus jumps away, and it
// re-checks that the source field is still focused before stealing focus, so
// it never yanks the user back after they've already tapped elsewhere.
export function useAutoAdvance(delay = 550) {
  const timers = useRef({});

  useEffect(() => () => {
    Object.values(timers.current).forEach(clearTimeout);
  }, []);

  const schedule = useCallback((key, sourceEl, focusNext) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    const value = sourceEl?.value;
    if (!value) return;
    timers.current[key] = setTimeout(() => {
      if (document.activeElement !== sourceEl) return;
      const next = typeof focusNext === 'function' ? focusNext() : focusNext;
      next?.focus?.();
    }, delay);
  }, [delay]);

  const cancel = useCallback((key) => {
    if (timers.current[key]) {
      clearTimeout(timers.current[key]);
      delete timers.current[key];
    }
  }, []);

  return { schedule, cancel };
}
