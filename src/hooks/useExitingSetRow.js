import { useCallback, useLayoutEffect, useRef, useState } from 'react';

// Backs up the fade's animationend in case it never fires — prefers-reduced-
// motion disables the animation entirely, and a backgrounded/hidden tab can
// throttle animation frames outright. Well past the CSS's own 0.3s so it
// never preempts a real, on-time animationend.
const FADE_FALLBACK_MS = 600;
// How long the surviving rows take to slide up into their new position.
const SHIFT_DURATION_MS = 260;
const SHIFT_EASING = 'cubic-bezier(0.33, 0.9, 0.4, 1)';

// Drives "delete a set row, the rest slide up to fill the gap" in two
// GPU-only phases instead of animating layout (max-height/padding/border)
// directly, which is what every earlier attempt at this did:
//
//  1. beginExit fades the tapped row out in place (opacity + transform
//     only — see .hevy-set-row.set-row-exit in WorkoutTracker.css) while it
//     keeps its full height, so nothing else moves yet.
//  2. Once the fade finishes (handleAnimationEnd, or the fallback timer),
//     the row is actually removed from the array. The useLayoutEffect below
//     then FLIPs the rows below it: snap each one back down by the removed
//     row's own height (transition: none), then release it into a
//     transform transition on the next frame — so it visibly slides up
//     instead of teleporting.
//
// Both phases only ever touch `transform`/`opacity`, which the compositor
// can animate without re-running layout on every frame — unlike max-height,
// which forces a full reflow each tick and is why the collapse looked like
// nothing happening for most of its duration, then snapping instantly at
// the end (confirmed by inspecting a screen recording frame-by-frame,
// 2026-09-30, after two earlier attempts — syncing removal to animationend,
// then killing a `transition: all` that was racing the keyframe — didn't
// fix it: the jerk was never a timing or transition-conflict problem, it
// was max-height simply not rendering as a smooth multi-frame animation on
// that device at all).
//
// The shift is computed from the removed row's INDEX and measured height,
// not from comparing a DOM node's position before vs. after — an earlier
// version of this hook tried the "real" FLIP (snapshot every row's
// getBoundingClientRect().top, diff it against the same node after the
// re-render) and it never animated anything, because it never moves at
// all: set rows are keyed by array index (no stable id), so when an EARLIER
// row is removed, React's reconciliation doesn't relocate any DOM nodes —
// it reuses each surviving position's existing node and just swaps its
// CONTENT to the next item's data, and only ever unmounts the LAST node
// (there's one fewer item now). The node sitting at position 0 never moves
// in the DOM at all; it just starts rendering different values a moment
// after the row above it — no positional delta for a real FLIP to find.
// Since we already know exactly which positions logically shifted (every
// index from the removed one down) and by how much (the removed row's own
// height), we can fake the same visual effect without needing the nodes to
// have actually moved: apply the compensating offset to whichever DOM
// nodes now occupy those positions, then release it.
export function useExitingSetRow() {
  const [exiting, setExiting] = useState(() => new Set());
  const pending = useRef(new Map()); // key -> { onDone, fallbackTimer, done, exIdx, setIdx }
  const rowRefs = useRef(new Map()); // "exIdx:setIdx" -> current DOM node
  const pendingShift = useRef(null); // { exIdx, fromIdx, rowHeight } set right before a removal

  const registerRow = useCallback((exIdx, setIdx, node) => {
    const key = `${exIdx}:${setIdx}`;
    if (node) rowRefs.current.set(key, node);
    else rowRefs.current.delete(key);
  }, []);

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

  const beginExit = useCallback((exIdx, setIdx, onDone) => {
    const key = `${exIdx}:${setIdx}`;
    const existing = pending.current.get(key);
    if (existing) clearTimeout(existing.fallbackTimer);
    // Measured now, while the row is still at its normal (pre-fade) full
    // height, so the later shift matches exactly what's about to vanish.
    const rowEl = rowRefs.current.get(key);
    const rowHeight = rowEl ? rowEl.getBoundingClientRect().height : 0;
    pending.current.set(key, {
      onDone: () => {
        pendingShift.current = { exIdx, fromIdx: setIdx, rowHeight };
        onDone();
      },
      done: false,
      fallbackTimer: setTimeout(() => finish(key), FADE_FALLBACK_MS)
    });
    setExiting(prev => new Set(prev).add(key));
  }, [finish]);

  const isExitingSet = useCallback((exIdx, setIdx) => exiting.has(`${exIdx}:${setIdx}`), [exiting]);

  // Wire this to the row's onAnimationEnd. Harmless (a no-op) if this row
  // isn't the one currently fading out.
  const handleAnimationEnd = useCallback((exIdx, setIdx) => finish(`${exIdx}:${setIdx}`), [finish]);

  useLayoutEffect(() => {
    const shift = pendingShift.current;
    if (!shift || !shift.rowHeight) return;
    pendingShift.current = null;
    const { exIdx, fromIdx, rowHeight } = shift;
    const moved = [];
    for (const [rowKey, node] of rowRefs.current) {
      const [ki, kj] = rowKey.split(':').map(Number);
      if (ki === exIdx && kj >= fromIdx) moved.push(node);
    }
    if (moved.length === 0) return;
    moved.forEach(node => {
      node.style.transition = 'none';
      node.style.transform = `translateY(${rowHeight}px)`;
    });
    // Force a style flush so the browser registers the "from" position
    // above before the next frame releases it — otherwise both writes can
    // land in the same frame and the transition never gets a chance to run.
    void moved[0].offsetHeight;
    requestAnimationFrame(() => {
      moved.forEach(node => {
        node.style.transition = `transform ${SHIFT_DURATION_MS}ms ${SHIFT_EASING}`;
        node.style.transform = '';
      });
      setTimeout(() => {
        moved.forEach(node => {
          if (document.contains(node)) node.style.transition = '';
        });
      }, SHIFT_DURATION_MS + 50);
    });
  });

  return { isExitingSet, beginExit, handleAnimationEnd, registerRow };
}
