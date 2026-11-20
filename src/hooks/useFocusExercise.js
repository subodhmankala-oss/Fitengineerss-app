import { useCallback, useEffect, useRef, useState } from 'react';
import { isWarmupCardExercise } from '../utils/warmupBlocks';

// Focus mode for the set logger (client WorkoutTracker + coach Live Log).
//
// Ticking a set on a real exercise (not the warm-up block) puts that
// exercise alone on screen: every other exercise row and the bits below the
// list (Add Exercise, Save) hide until the user taps the "show all" chevron
// under the card. Ticking a set on another exercise after that focuses that
// one instead. Keyed by the reorderable list's stable row key, so reorders
// and removals never leave the focus on the wrong card.
export default function useFocusExercise() {
  const [focusKey, setFocusKey] = useState(null);
  const [expanded, setExpanded] = useState(false);
  // Key to scroll to after the next commit (the rows above it just vanished).
  const scrollToRef = useRef(null);

  const onSetTicked = useCallback((key, turningOn) => {
    if (!turningOn || !key) return;
    setFocusKey(prev => {
      if (prev !== key || expanded) scrollToRef.current = key;
      return key;
    });
    setExpanded(false);
  }, [expanded]);

  const expand = useCallback(() => setExpanded(true), []);
  const clear = useCallback(() => { setFocusKey(null); setExpanded(false); }, []);

  useEffect(() => {
    const key = scrollToRef.current;
    if (!key) return;
    scrollToRef.current = null;
    const el = typeof document !== 'undefined'
      ? [...document.querySelectorAll('[data-focus-key]')].find(n => n.dataset.focusKey === key)
      : null;
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [focusKey, expanded]);

  return { focusKey, expanded, onSetTicked, expand, clear };
}

// Whether focus mode is currently hiding the rest of the list.
export function isFocusActive(focus, keys, disabled) {
  return !!focus.focusKey && !focus.expanded && !disabled && keys.includes(focus.focusKey);
}

// What the "show all" chevron says: the next exercise still to do (after the
// focused one first, then from the top) and how many others are hidden.
// Warm-up rows don't count — they're one block, not exercises to train.
export function focusSummary(exercises, focusIdx) {
  const others = exercises
    .map((ex, i) => ({ ex, i }))
    .filter(({ ex, i }) => i !== focusIdx && !isWarmupCardExercise(ex));
  const unfinished = others.filter(({ ex }) => !(ex.sets || []).every(s => s.isCompleted));
  const next = unfinished.find(({ i }) => i > focusIdx) || unfinished[0];
  return { hiddenCount: others.length, nextName: next?.ex.name || null };
}
