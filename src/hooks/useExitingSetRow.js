import { useCallback, useRef } from 'react';

// How long the tapped row's own collapse takes — its own isolated height/
// opacity transition, matching (roughly) Add Set's own ~0.55s growth (see
// animateNewSetRow.js), just a touch snappier since removing something
// should feel quicker than adding it.
const COLLAPSE_DURATION_MS = 380;
// Backs up transitionend in case it never fires (prefers-reduced-motion,
// a backgrounded tab) — comfortably past COLLAPSE_DURATION_MS.
const COLLAPSE_FALLBACK_MS = 700;
// How long the rows below take to release into their new position once
// the collapse above finishes.
const RELEASE_DURATION_MS = 260;
const EASING = 'cubic-bezier(0.33, 0.9, 0.4, 1)';

// Delete a set row so it looks like Add Set in reverse — the row itself
// visibly shrinks away, then the rows below slide up to close the gap —
// without ever animating a property that forces the browser to re-run
// layout on every frame. Three earlier attempts at this all animated
// max-height (or a CSS transition/animation conflict around it) IN PLACE,
// which forces every sibling below the shrinking row to reflow continuously
// for the animation's whole duration. On the reporter's device that just
// didn't render as a smooth multi-frame animation at all — confirmed by
// inspecting a screen recording frame-by-frame, 2026-09-30: the row sat at
// full height with no visible change for nearly the entire duration, then
// snapped to gone in one frame. Switching to a two-phase, GPU-only
// approach (opacity/transform/fixed-position, never a layout property)
// fixed the underlying stutter, but a flat fade didn't visually read as
// "shrinking" the way this ticket asked for — hence this version, which
// gets the actual collapse look back without paying the reflow cost:
//
//  1. beginExit takes the tapped row OUT of the page's normal flow
//     entirely (position: fixed, pinned to its current on-screen spot) the
//     instant it's called. Because it's no longer in flow, the rows below
//     it in the SAME exercise jump into their final positions immediately
//     — before any animation has even started — so in that same instant,
//     each of those rows is held back with an un-transitioned
//     translateY() equal to the removed row's height, so nothing visibly
//     moves yet. The pinned row then transitions its own height and
//     opacity down to 0 — safe now, since being out of flow means this
//     can never trigger layout on anything else.
//  2. Once that finishes (transitionend, or the fallback timer), the row's
//     inline styles are cleared and the actual removal (onDone) runs.
//     Because the held rows' REAL flow position already reflects life
//     without the deleted row, releasing their translateY() hold back to
//     0 is the entire "slide up to fill the gap" motion.
//
// Rows are tracked by DOM node reference via registerRow, not by React key
// — set rows are keyed by array index (no stable id), so once the array
// shrinks, React reuses a surviving node for whatever LOGICAL row now sits
// at that index (a content swap in place, not a reposition — see this
// file's git history for the full explanation of why a real
// measure-before/measure-after FLIP never found any movement to animate).
// Holding/releasing specific node OBJECTS sidesteps that entirely: it never
// needs to know which logical set a node represents, only whether IT
// needs to visually settle into wherever it now really sits.
export function useExitingSetRow() {
  const rowRefs = useRef(new Map()); // "exIdx:setIdx" -> current DOM node
  const pending = useRef(new Map()); // key -> { onDone, fallbackTimer, done, rowEl, heldNodes }

  const registerRow = useCallback((exIdx, setIdx, node) => {
    const key = `${exIdx}:${setIdx}`;
    if (node) rowRefs.current.set(key, node);
    else rowRefs.current.delete(key);
  }, []);

  const clearPinnedRowStyles = (node) => {
    node.style.position = '';
    node.style.top = '';
    node.style.left = '';
    node.style.width = '';
    node.style.margin = '';
    node.style.zIndex = '';
    node.style.overflow = '';
    node.style.height = '';
    node.style.opacity = '';
    node.style.transition = '';
    node.style.pointerEvents = '';
  };

  const finish = useCallback((key) => {
    const entry = pending.current.get(key);
    if (!entry || entry.done) return;
    entry.done = true;
    clearTimeout(entry.fallbackTimer);
    pending.current.delete(key);
    if (entry.rowEl) clearPinnedRowStyles(entry.rowEl);
    entry.onDone();
    requestAnimationFrame(() => {
      entry.heldNodes.forEach(node => {
        if (!document.contains(node)) return;
        node.style.transition = `transform ${RELEASE_DURATION_MS}ms ${EASING}`;
        node.style.transform = '';
      });
      setTimeout(() => {
        entry.heldNodes.forEach(node => {
          if (document.contains(node)) node.style.transition = '';
        });
      }, RELEASE_DURATION_MS + 50);
    });
  }, []);

  const beginExit = useCallback((exIdx, setIdx, onDone) => {
    const key = `${exIdx}:${setIdx}`;
    const existing = pending.current.get(key);
    if (existing) clearTimeout(existing.fallbackTimer);

    const rowEl = rowRefs.current.get(key);
    const heldNodes = [];
    if (rowEl) {
      const rect = rowEl.getBoundingClientRect();
      for (const [rowKey, node] of rowRefs.current) {
        const [ki, kj] = rowKey.split(':').map(Number);
        if (ki === exIdx && kj > setIdx) heldNodes.push(node);
      }
      heldNodes.forEach(node => {
        node.style.transition = 'none';
        node.style.transform = `translateY(${rect.height}px)`;
      });
      rowEl.style.position = 'fixed';
      rowEl.style.top = `${rect.top}px`;
      rowEl.style.left = `${rect.left}px`;
      rowEl.style.width = `${rect.width}px`;
      rowEl.style.margin = '0';
      rowEl.style.zIndex = '5';
      rowEl.style.overflow = 'hidden';
      rowEl.style.pointerEvents = 'none';
      rowEl.style.height = `${rect.height}px`;
      // Force a style flush so the browser registers all of the above
      // before the next frame starts the actual transitions — otherwise
      // it can coalesce these writes with the ones below into a single
      // frame and skip straight to the end state.
      void rowEl.offsetHeight;
      const startTransition = () => {
        rowEl.style.transition = `height ${COLLAPSE_DURATION_MS}ms ${EASING}, opacity ${COLLAPSE_DURATION_MS}ms ${EASING}`;
        rowEl.style.height = '0px';
        rowEl.style.opacity = '0';
      };
      requestAnimationFrame(() => requestAnimationFrame(startTransition));
      rowEl.addEventListener('transitionend', () => finish(key), { once: true });
    }

    pending.current.set(key, {
      onDone,
      done: false,
      rowEl,
      heldNodes,
      fallbackTimer: setTimeout(() => finish(key), COLLAPSE_FALLBACK_MS)
    });
  }, [finish]);

  return { beginExit, registerRow };
}
