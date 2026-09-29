import { useCallback, useRef, useState } from 'react';

// Backs up animationend in case it never fires — prefers-reduced-motion
// disables the animation entirely (WorkoutTracker.css), and a backgrounded/
// hidden tab can throttle or skip animation frames outright. Deliberately
// well past the CSS's own 0.45s duration so it never preempts a real,
// on-time animationend (see the comment below on why that preemption is
// exactly what caused the end-of-animation jerk this replaced).
const EXIT_FALLBACK_MS = 900;

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
//
// The actual removal is triggered by the row's own `animationend` (wired up
// by the caller via onAnimationEnd(exIdx, setIdx) below), not a fixed timer.
// An earlier version used a plain setTimeout(450) started the moment the
// class was requested — but the class itself only lands on the DOM on the
// NEXT React commit (a render triggered by the state update here), a frame
// or so later than the timer started counting from. That's enough for the
// fixed timer to fire a few ms before the CSS animation it was meant to
// match actually finishes, snapping the row away instead of letting it
// settle at its animated end state — a small jerk right at the end.
// animationend fires whenever the animation really completes, so there's no
// clock to drift out of sync with. Reported 2026-09-29.
export function useExitingSetRow() {
  const [exiting, setExiting] = useState(() => new Set());
  // key -> { onDone, fallbackTimer, done }
  const pending = useRef(new Map());

  const finish = useCallback((key) => {
    const entry = pending.current.get(key);
    if (!entry || entry.done) return;
    entry.done = true;
    clearTimeout(entry.fallbackTimer);
    pending.current.delete(key);
    setExiting(prev => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    entry.onDone();
  }, []);

  // `rowEl` is only used to seed --row-h (the collapse's starting height) —
  // a plain inline style, harmless even if a later reused node keeps it,
  // since it does nothing without the exit class also being present.
  const beginExit = useCallback((exIdx, setIdx, rowEl, onDone) => {
    const key = `${exIdx}:${setIdx}`;
    if (rowEl) rowEl.style.setProperty('--row-h', `${rowEl.offsetHeight}px`);
    // A second exit requested for the same row before the first resolved
    // (shouldn't happen — the row is pointer-events: none while exiting —
    // but don't leak the old fallback timer if it somehow does).
    const existing = pending.current.get(key);
    if (existing) clearTimeout(existing.fallbackTimer);
    pending.current.set(key, {
      onDone,
      done: false,
      fallbackTimer: setTimeout(() => finish(key), EXIT_FALLBACK_MS)
    });
    setExiting(prev => new Set(prev).add(key));
  }, [finish]);

  const isExitingSet = useCallback((exIdx, setIdx) => exiting.has(`${exIdx}:${setIdx}`), [exiting]);

  // Wire this to the row's onAnimationEnd. Harmless (a no-op) if this row
  // isn't the one currently exiting.
  const handleAnimationEnd = useCallback((exIdx, setIdx) => finish(`${exIdx}:${setIdx}`), [finish]);

  return { isExitingSet, beginExit, handleAnimationEnd };
}
