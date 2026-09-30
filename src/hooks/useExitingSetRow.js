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
//     then runs a FLIP: it already knows where every surviving row in that
//     exercise sat right before the removal (a snapshot taken the instant
//     before onDone() fires), compares that against where they land in the
//     DOM right after React's re-render, and for any row that moved, snaps
//     it back to its old spot with transition: none, then releases it into
//     a transform transition on the next frame — so it visibly slides up
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
// The FLIP match is by DOM NODE IDENTITY (via rowRefs, a live node per
// "exIdx:setIdx"), not by key/index — set rows are keyed by array index
// (they have no stable id), so once the array shrinks, React reuses a
// surviving DOM node for whatever LOGICAL row now sits at its key. That's
// fine here: this only asks "did this exact node move, and by how much,"
// never "which logical set is this."
export function useExitingSetRow() {
  const [exiting, setExiting] = useState(() => new Set());
  const pending = useRef(new Map()); // key -> { onDone, fallbackTimer, done, exIdx }
  const rowRefs = useRef(new Map()); // "exIdx:setIdx" -> current DOM node
  const flipSnapshot = useRef(null); // Map(node -> its top just before a removal)

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
    const before = new Map();
    for (const [rowKey, node] of rowRefs.current) {
      if (rowKey.startsWith(`${entry.exIdx}:`)) before.set(node, node.getBoundingClientRect().top);
    }
    flipSnapshot.current = before;
    entry.onDone();
  }, []);

  const beginExit = useCallback((exIdx, setIdx, onDone) => {
    const key = `${exIdx}:${setIdx}`;
    const existing = pending.current.get(key);
    if (existing) clearTimeout(existing.fallbackTimer);
    pending.current.set(key, {
      onDone,
      done: false,
      exIdx,
      fallbackTimer: setTimeout(() => finish(key), FADE_FALLBACK_MS)
    });
    setExiting(prev => new Set(prev).add(key));
  }, [finish]);

  const isExitingSet = useCallback((exIdx, setIdx) => exiting.has(`${exIdx}:${setIdx}`), [exiting]);

  // Wire this to the row's onAnimationEnd. Harmless (a no-op) if this row
  // isn't the one currently fading out.
  const handleAnimationEnd = useCallback((exIdx, setIdx) => finish(`${exIdx}:${setIdx}`), [finish]);

  useLayoutEffect(() => {
    const before = flipSnapshot.current;
    if (!before) return;
    flipSnapshot.current = null;
    const moved = [];
    for (const [node, oldTop] of before) {
      if (!document.contains(node)) continue; // this one was the row that got removed
      const delta = oldTop - node.getBoundingClientRect().top;
      if (Math.abs(delta) > 0.5) moved.push({ node, delta });
    }
    if (moved.length === 0) return;
    moved.forEach(({ node, delta }) => {
      node.style.transition = 'none';
      node.style.transform = `translateY(${delta}px)`;
    });
    // Force a style flush so the browser registers the "from" position
    // above before the next frame releases it — otherwise both writes can
    // land in the same frame and the transition never gets a chance to run.
    void moved[0].node.offsetHeight;
    requestAnimationFrame(() => {
      moved.forEach(({ node }) => {
        node.style.transition = `transform ${SHIFT_DURATION_MS}ms ${SHIFT_EASING}`;
        node.style.transform = '';
      });
      setTimeout(() => {
        moved.forEach(({ node }) => {
          if (document.contains(node)) node.style.transition = '';
        });
      }, SHIFT_DURATION_MS + 50);
    });
  });

  return { isExitingSet, beginExit, handleAnimationEnd, registerRow };
}
