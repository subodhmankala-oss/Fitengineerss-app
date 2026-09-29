import { useCallback, useRef, useState } from 'react';

// How long the CSS collapse (WorkoutTracker.css's .set-row-exit /
// set-row-slide-out) takes — must match its `animation: ... 0.45s` duration.
const EXIT_DURATION = 450;

// Drives the "swipe a set row out, then remove it" animation entirely
// through React state instead of the previous approach (animateRemoveSetRow.js),
// which added the exit class straight to the clicked row's DOM node via
// classList.add. That worked for the row you clicked, but set rows are keyed
// by their array index (they have no stable id) — so once the removal
// actually ran and the array shrank, React's reconciliation reused that same
// DOM node (same key) for whatever row now sits at that index, i.e. the
// NEXT row down. React only ever touches a DOM prop when its own computed
// value changes between renders, so it had no way to know a class had been
// added outside its control, and never cleared it. The result: the row that
// slid out stayed gone (correctly), but the row that took its place
// inherited a `set-row-exit` node already pinned at its animation's end
// state (max-height: 0, opacity: 0, pointer-events: none) — permanently
// invisible and unclickable. From the coach/client's side, deleting the top
// set looked like it deleted the top TWO. Reported 2026-09-29.
//
// Tying the class to state keyed by exIdx/setIdx — re-evaluated fresh on
// every render — fixes this at the root: it only ever matches whichever row
// currently sits at that index, and stops matching the instant the data
// shifts underneath it.
export function useExitingSetRow() {
  const [exiting, setExiting] = useState(() => new Set());
  const timers = useRef(new Map());

  // `rowEl` is only used to seed --row-h (the collapse's starting height) —
  // a plain inline style, harmless even if a later reused node keeps it,
  // since it does nothing without the exit class also being present.
  const beginExit = useCallback((exIdx, setIdx, rowEl, onDone) => {
    const key = `${exIdx}:${setIdx}`;
    if (rowEl) rowEl.style.setProperty('--row-h', `${rowEl.offsetHeight}px`);
    setExiting(prev => new Set(prev).add(key));
    const existingTimer = timers.current.get(key);
    if (existingTimer) clearTimeout(existingTimer);
    timers.current.set(key, setTimeout(() => {
      timers.current.delete(key);
      setExiting(prev => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      onDone();
    }, EXIT_DURATION));
  }, []);

  const isExitingSet = useCallback((exIdx, setIdx) => exiting.has(`${exIdx}:${setIdx}`), [exiting]);

  return { isExitingSet, beginExit };
}
