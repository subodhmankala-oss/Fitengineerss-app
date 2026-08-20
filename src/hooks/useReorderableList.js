import { useCallback, useEffect, useRef, useState } from 'react';

// How close the pointer needs to get to the scroll container's top/bottom
// edge (in px) before auto-scroll kicks in, and how fast it scrolls right
// at the edge (px per animation frame, ~60fps). Scroll speed ramps linearly
// from 0 at the edge of this zone up to the max right at the container's
// boundary — the same "closer to the edge = faster" feel as iOS/most
// native drag-and-drop.
const AUTO_SCROLL_EDGE = 70;
const AUTO_SCROLL_MAX_SPEED = 16;

// Walks up from the drag handle to find the actual scrolling ancestor,
// rather than assuming the window/page scrolls. In this app that's
// `.main-content` (see the comment on .workout-tracker-container in
// WorkoutTracker.css — "the real scroll container"), but walking up by
// computed style instead of querying that class by name keeps this working
// if reorder is ever used somewhere with its own scroll box (a modal, a
// panel), without needing to know about it here.
//
// Reading `.scrollHeight`/`.clientHeight` here forces a synchronous layout
// (not just a style recalc) on every ancestor it checks — cheap once, but
// this used to run on *every single pointerdown*, i.e. inside the
// touch-critical path that decides whether iOS recognizes the gesture as a
// drag at all. That synchronous layout cost sitting in the drag's opening
// milliseconds was the actual regression (see startReorderDrag below for
// where this is now cached instead of re-walked per drag).
function findScrollContainer(el) {
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return document.querySelector('.main-content') || document.scrollingElement || document.documentElement;
}

// The visible viewport bounds of the scroll container, in the same
// viewport coordinate space as PointerEvent.clientY. For an actual
// scrollable element this is just its own rect; for page-level scrolling
// (the documentElement/body fallback above) getBoundingClientRect() would
// report the full scrollHeight instead of the visible window, so that case
// is measured against the window itself.
function getViewportBounds(container) {
  if (container === document.documentElement || container === document.body) {
    return { top: 0, bottom: window.innerHeight };
  }
  const rect = container.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom };
}

// Stable per-item React keys, without touching the exercise data shape.
// Exercises are plain { name, sets } objects with no id field, and adding
// one everywhere they're constructed (templates, drafts, the plan editor,
// coach Live Log, AI-drafted plans, …) would be exactly the kind of
// data-structure change this fix is explicitly not supposed to make.
//
// A reorder only ever permutes existing object references (see
// orderIdsRef.current.map(id => itemsRef.current[id]) in endDrag) — it
// never clones or recreates the exercise objects — so identity-keying off
// the object reference itself is both sufficient and free of any data
// migration. Rows were previously keyed by array index (`key={exIdx}`),
// which is exactly wrong for a reorder: React reads "index 2 is still
// index 2" and patches that slot's *content* in place instead of moving
// the DOM node, which is what turned an otherwise-correct settle
// transition into a snap the instant the underlying array (and therefore
// what content lives at each index) changed on commit.
const keyRegistry = new WeakMap();
let nextKeyId = 0;
function stableKeyFor(item) {
  if (item === null || typeof item !== 'object') return String(item);
  let key = keyRegistry.get(item);
  if (key === undefined) {
    key = `ex-${nextKeyId++}`;
    keyRegistry.set(item, key);
  }
  return key;
}

// How long to keep correcting scroll drift after a drag settles/cancels.
// Needs to comfortably outlast both animations that can move content above
// the viewport once reorder mode ends: the row's own 280ms settle glide
// (endDrag) and the compact-card morph-back (.ex-reorder-morph's max-height
// transition, 240ms — see WorkoutTracker.css). A CSS transition's target
// value is committed to the DOM instantly but the actual *rendered* size
// animates over the following frames, so a single before/after measurement
// right after commit isn't enough — this has to keep re-measuring for the
// duration, which is exactly what the rAF loop below does.
const SCROLL_ANCHOR_WINDOW_MS = 360;

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// Reads where `anchorEl` currently sits in the viewport, to be handed to
// startAnchorCorrection AFTER the state changes that are about to move it —
// has to run before those changes (a plain synchronous read, not tied to
// React's render), since anchorEl's own position is exactly what we're
// trying to hold fixed across them.
function captureAnchorTop(anchorEl) {
  return anchorEl ? anchorEl.getBoundingClientRect().top : null;
}

// Keeps `anchorEl` pinned at `targetTop` (in viewport coordinates) for
// SCROLL_ANCHOR_WINDOW_MS by nudging `container.scrollTop` every frame —
// the same "capture where something is, then keep correcting for it" idea
// the auto-scroll loop above already uses, applied to the opposite
// problem: instead of moving the viewport on purpose, this cancels out
// movement caused by *other* rows animating open/closed elsewhere in the
// list while the user's eyes are still on the row they just dropped.
function startAnchorCorrection(container, anchorEl, targetTop) {
  if (!container || !anchorEl || targetTop == null) return;
  const start = now();
  const step = () => {
    if (!anchorEl.isConnected) return; // row's DOM node is gone — nothing left to anchor to
    const drift = anchorEl.getBoundingClientRect().top - targetTop;
    if (drift !== 0) container.scrollTop += drift;
    if (now() - start < SCROLL_ANCHOR_WINDOW_MS) {
      requestAnimationFrame(step);
    }
  };
  requestAnimationFrame(step);
}

// Press-and-drag "reorder mode" for an exercise list (client logger, coach
// Live Log, plan editor). Pressing a row's drag handle:
//   1. flips the whole list into compact name-only rows (see the
//      .ex-reorder-* classes in WorkoutTracker.css — a CSS grid-rows morph,
//      no JS height measurement needed for the collapse/expand),
//   2. lets that row be dragged to a new position, with the other rows
//      sliding into their new slots via a plain CSS transform transition,
//      auto-scrolling the list when the pointer nears the top/bottom edge,
//   3. on release, commits the new order and morphs back to normal cards.
//
// Deliberately reimplemented on Pointer Events rather than adding a
// drag-and-drop dependency — there wasn't one already in the project (no
// dnd-kit/react-beautiful-dnd/framer-motion in package.json), and this is
// the only interaction that needs it. Pointer Events cover mouse, trackpad,
// and touch in one code path.
//
// `items` is the array being reordered (exercises) — nothing about its
// shape or how it's persisted changes. `onReorder(newArray)` fires once, on
// drop, with the full array in its new order; callers pass their existing
// setXExercises state setter (or a thin wrapper around it), so saving the
// new order goes through the exact same mechanism that already persists
// that array today.
export function useReorderableList(items, onReorder) {
  const [isReordering, setIsReordering] = useState(false);
  const [dragIndex, setDragIndex] = useState(null); // original index of the item being dragged
  const [orderIds, setOrderIds] = useState([]); // permutation of original indices = current visual order
  const [dragOffset, setDragOffset] = useState(0); // px the dragged row has moved from its start position
  // True for the brief window between release and commit, while the
  // dragged row eases from "wherever the pointer let go" into its exact
  // slot — without this, releasing mid-row snapped the row instantly
  // (transition: none while dragging), which read as a jump/flicker.
  const [isSettling, setIsSettling] = useState(false);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const orderIdsRef = useRef([]);
  const dragIndexRef = useRef(null);
  // The pointer position that maps to dragOffset 0. Pure pointer movement
  // (onMove) is the only thing that ever *reads* this; auto-scroll's only
  // interaction with it is nudging it backward by however many pixels the
  // container just scrolled (see tickAutoScroll), which makes the exact
  // same "clientY - startYRef" formula below automatically account for the
  // scroll with no separate scroll-delta term anywhere in the hot path.
  const startYRef = useRef(0);
  const startPositionRef = useRef(0);
  const rowHeightRef = useRef(44);
  const listenersRef = useRef(null);
  const settleTimeoutRef = useRef(null);
  // Auto-scroll bookkeeping. scrollContainerCacheRef is resolved once (see
  // startReorderDrag) and reused for every drag rather than re-walked each
  // time. lastClientYRef tracks the pointer so the rAF loop keeps scrolling
  // even while the finger/cursor is completely still near the edge (a real
  // pointermove won't keep firing on its own, but native drag-and-drop
  // still keeps scrolling in that case — the loop has to drive itself
  // rather than wait for events).
  const scrollContainerCacheRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const lastClientYRef = useRef(0);
  const autoScrollFrameRef = useRef(null);
  // The dragged row's own DOM node (the .ex-reorder-row wrapper, not the
  // handle button) — captured once at drag start and used purely as a
  // fixed point for anchorScrollTo when the drag ends. Stable identity here
  // depends on the row being keyed by stableKeyFor (see above) rather than
  // index, so this node is still the same one, still showing the exercise
  // the user was actually dragging, after the array reorders.
  const draggedRowElRef = useRef(null);

  // Attach to the compact row's DOM node to learn its real rendered height
  // (font size / padding vary slightly by device), used to convert pointer
  // movement into "how many rows did we move past".
  const measureRowHeight = useCallback((el) => {
    if (el) {
      const h = el.getBoundingClientRect().height;
      if (h) rowHeightRef.current = h;
    }
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current != null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }, []);

  // The single place drag position is ever computed, from pointer position
  // alone — deliberately the exact same shape as before auto-scroll existed
  // (setDragOffset + steps/target-slot math off one deltaY). Auto-scroll
  // never adds a competing term here; it only ever moves startYRef (see
  // tickAutoScroll), so this function can't tell the difference between
  // "the pointer moved" and "the container scrolled out from under a still
  // pointer" — which is exactly the point: one formula, always correct.
  const applyPointerDelta = useCallback((deltaY) => {
    setDragOffset(deltaY);

    const rowHeight = rowHeightRef.current || 44;
    const steps = Math.round(deltaY / rowHeight);
    const targetPos = Math.max(0, Math.min(orderIdsRef.current.length - 1, startPositionRef.current + steps));
    const currentPos = orderIdsRef.current.indexOf(dragIndexRef.current);
    if (targetPos !== currentPos) {
      const next = [...orderIdsRef.current];
      next.splice(currentPos, 1);
      next.splice(targetPos, 0, dragIndexRef.current);
      orderIdsRef.current = next;
      setOrderIds(next);
    }
  }, []);

  // The auto-scroll loop itself: while the pointer sits within
  // AUTO_SCROLL_EDGE px of the container's top/bottom, nudge scrollTop
  // every frame (speed ramping up closer to the edge), shift startYRef by
  // however much the container actually moved (see the comment on
  // startYRef above), re-run applyPointerDelta so the dragged row stays
  // glued to the pointer and reordering keeps pace, and reschedule. Stops
  // rescheduling itself the moment the pointer isn't near an edge —
  // pointermove restarts it (ensureAutoScroll below) the next time it
  // re-enters the zone, so nothing spins in the background once the drag
  // stops needing to scroll.
  //
  // Kept in a ref (rather than referencing `tickAutoScroll` by name inside
  // itself) purely to dodge the temporal-dead-zone error that recursive
  // self-reference through a `useCallback` binding hits — assigned via the
  // effect below, which always runs before any drag (a user gesture) could
  // possibly reach it.
  const tickAutoScrollRef = useRef(null);
  const tickAutoScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || dragIndexRef.current == null) {
      autoScrollFrameRef.current = null;
      return;
    }
    const bounds = getViewportBounds(container);
    const y = lastClientYRef.current;
    const topGap = y - bounds.top;
    const bottomGap = bounds.bottom - y;

    let speed = 0;
    if (topGap < AUTO_SCROLL_EDGE) {
      const intensity = Math.min(1, (AUTO_SCROLL_EDGE - Math.max(0, topGap)) / AUTO_SCROLL_EDGE);
      speed = -AUTO_SCROLL_MAX_SPEED * intensity;
    } else if (bottomGap < AUTO_SCROLL_EDGE) {
      const intensity = Math.min(1, (AUTO_SCROLL_EDGE - Math.max(0, bottomGap)) / AUTO_SCROLL_EDGE);
      speed = AUTO_SCROLL_MAX_SPEED * intensity;
    }

    if (speed === 0) {
      autoScrollFrameRef.current = null;
      return;
    }

    const maxScrollTop = container.scrollHeight - container.clientHeight;
    const before = container.scrollTop;
    const after = Math.max(0, Math.min(maxScrollTop, before + speed));
    if (after !== before) {
      container.scrollTop = after;
      // The content just moved (after - before)px under a pointer that
      // hasn't necessarily moved at all — shift the baseline so the next
      // "clientY - startYRef" in applyPointerDelta already reflects it,
      // instead of teaching applyPointerDelta a second input to reconcile.
      startYRef.current -= (after - before);
      applyPointerDelta(y - startYRef.current);
    }
    autoScrollFrameRef.current = requestAnimationFrame(tickAutoScrollRef.current);
  }, [applyPointerDelta]);
  useEffect(() => {
    tickAutoScrollRef.current = tickAutoScroll;
  }, [tickAutoScroll]);

  const ensureAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current == null) {
      autoScrollFrameRef.current = requestAnimationFrame(tickAutoScroll);
    }
  }, [tickAutoScroll]);

  const resetDragState = useCallback(() => {
    stopAutoScroll();
    scrollContainerRef.current = null;
    dragIndexRef.current = null;
    setIsReordering(false);
    setDragIndex(null);
    setDragOffset(0);
    setOrderIds([]);
    setIsSettling(false);
    orderIdsRef.current = [];
  }, [stopAutoScroll]);

  const endDrag = useCallback((commit) => {
    if (listenersRef.current) {
      window.removeEventListener('pointermove', listenersRef.current.move);
      window.removeEventListener('pointerup', listenersRef.current.up);
      window.removeEventListener('pointercancel', listenersRef.current.cancel);
      listenersRef.current = null;
    }
    document.body.style.userSelect = '';
    // No more scrolling once the pointer's released — only the settle
    // glide below should move the dragged row from here.
    stopAutoScroll();

    const canCommit = commit && dragIndexRef.current != null && orderIdsRef.current.length === itemsRef.current.length;
    if (!canCommit) {
      // Cancelling still flips isReordering off, which morphs every row's
      // card back open at once (see WorkoutTracker.css's .ex-reorder-morph)
      // — that alone can drift the viewport if rows above it are expanding,
      // exactly like a real commit would. Anchor here too. The position
      // read has to happen before resetDragState's setState calls, not
      // after — it's what "unchanged" means for the correction below.
      const container = scrollContainerRef.current;
      const anchorEl = draggedRowElRef.current;
      const targetTop = captureAnchorTop(anchorEl);
      resetDragState();
      startAnchorCorrection(container, anchorEl, targetTop);
      return;
    }

    // Ease the dragged row from wherever the pointer released into its
    // exact final slot (same offset math the other rows already use), then
    // commit the real order once that settle finishes. Keeps the row from
    // snapping the instant it's dropped.
    const rowHeight = rowHeightRef.current || 44;
    const finalPos = orderIdsRef.current.indexOf(dragIndexRef.current);
    const exactOffset = (finalPos - dragIndexRef.current) * rowHeight;
    const newOrder = orderIdsRef.current.map((id) => itemsRef.current[id]);

    setDragOffset(exactOffset);
    setIsSettling(true);

    // Matches the settle transition's duration in getRowStyle below — long
    // enough to actually read as a glide rather than a snap, short enough
    // to still feel immediate.
    settleTimeoutRef.current = window.setTimeout(() => {
      // Captured before onReorder/resetDragState fire: resetDragState nulls
      // scrollContainerRef, and draggedRowElRef's target row is about to
      // both change array position (onReorder) and morph back to a full
      // card (isReordering flipping off) in the same commit — its viewport
      // position has to be read before either of those lands, or "where it
      // was" is already "where it just moved to".
      const container = scrollContainerRef.current;
      const anchorEl = draggedRowElRef.current;
      const targetTop = captureAnchorTop(anchorEl);
      onReorder(newOrder);
      resetDragState();
      startAnchorCorrection(container, anchorEl, targetTop);
    }, 280);
  }, [onReorder, resetDragState, stopAutoScroll]);

  const startReorderDrag = useCallback((index) => (e) => {
    // Only the primary button/touch/pen starts a drag; avoids right-click
    // or a secondary touch point hijacking the gesture.
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();

    dragIndexRef.current = index;
    const initialOrder = itemsRef.current.map((_, i) => i);
    orderIdsRef.current = initialOrder;
    startPositionRef.current = index;
    startYRef.current = e.clientY;
    lastClientYRef.current = e.clientY;

    // Resolved once per component instance, not on every drag: this walk
    // reads scrollHeight/clientHeight up the ancestor chain, which forces a
    // synchronous layout on each node it checks. Doing that inside every
    // single pointerdown — the exact handler that has to complete quickly
    // enough for the browser/OS to recognize a drag gesture rather than a
    // tap or a scroll — was enough added latency there to make dragging
    // itself unreliable on-device, even though the logic was otherwise
    // correct. The list's DOM structure (and therefore its scroll
    // ancestor) doesn't change between drags, so caching the result is
    // both cheaper and just as correct.
    if (!scrollContainerCacheRef.current) {
      scrollContainerCacheRef.current = findScrollContainer(e.currentTarget);
    }
    scrollContainerRef.current = scrollContainerCacheRef.current;
    // For the scroll-anchor correction in endDrag — the wrapper, not the
    // handle button itself, since that's the node whose position on screen
    // is "where the workout the user just moved" visually is.
    draggedRowElRef.current = e.currentTarget.closest('.ex-reorder-row');

    setDragIndex(index);
    setOrderIds(initialOrder);
    setDragOffset(0);
    setIsReordering(true);
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      if (dragIndexRef.current == null) return;
      lastClientYRef.current = ev.clientY;
      applyPointerDelta(ev.clientY - startYRef.current);
      // Cheap no-op if a scroll is already in flight; (re)starts it the
      // moment the pointer is back within the edge zone otherwise. The
      // loop itself decides speed each frame and stops rescheduling once
      // the pointer isn't near an edge, so this is safe to call on every
      // move regardless of whether we're actually near an edge right now.
      ensureAutoScroll();
    };
    const onUp = () => endDrag(true);
    const onCancel = () => endDrag(false);

    listenersRef.current = { move: onMove, up: onUp, cancel: onCancel };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }, [endDrag, ensureAutoScroll, applyPointerDelta]);

  // Keyboard fallback (section 9: reorder without a pointer) — Alt/Option +
  // Arrow Up/Down on a focused handle nudges the row one slot and commits
  // immediately, no drag session needed.
  const moveByKeyboard = useCallback((index, direction) => {
    const list = itemsRef.current;
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const next = [...list];
    const [moved] = next.splice(index, 1);
    next.splice(targetIdx, 0, moved);
    onReorder(next);
  }, [onReorder]);

  // Stable React key for the row at `index` in the *current* items array —
  // see stableKeyFor above for why this exists instead of `key={index}`.
  const getItemKey = useCallback((index) => stableKeyFor(itemsRef.current[index]), []);

  // Per-row inline style: the dragged row follows the pointer 1:1 with no
  // transition while actively held (feels attached to the finger/cursor)
  // plus a subtle lift; on release it eases into its exact slot instead
  // (isSettling — see endDrag) with the lift relaxing back to normal at
  // the same time. Every other row animates to its new slot with a short
  // CSS transition throughout.
  const getRowStyle = useCallback((index) => {
    if (!isReordering) return undefined;
    const rowHeight = rowHeightRef.current || 44;
    if (index === dragIndex) {
      return {
        transform: `translateY(${dragOffset}px) scale(${isSettling ? 1 : 1.025})`,
        // A gentler, longer glide than the rest of the reorder motion —
        // this is the one transition the user's eye is fixed on at the
        // exact moment of release, so it needs to read as a deliberate
        // ease rather than a quick snap.
        transition: isSettling
          ? 'transform 280ms cubic-bezier(0.16, 1, 0.3, 1)'
          : 'none',
        zIndex: 5,
      };
    }
    const pos = orderIds.indexOf(index);
    if (pos === -1) return undefined;
    const offset = (pos - index) * rowHeight;
    return {
      transform: `translateY(${offset}px)`,
      transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    };
  }, [isReordering, dragIndex, dragOffset, orderIds, isSettling]);

  // Clean up listeners/timers/the auto-scroll loop if the component
  // unmounts mid-drag or mid-settle.
  useEffect(() => () => {
    if (listenersRef.current) {
      window.removeEventListener('pointermove', listenersRef.current.move);
      window.removeEventListener('pointerup', listenersRef.current.up);
      window.removeEventListener('pointercancel', listenersRef.current.cancel);
    }
    if (settleTimeoutRef.current) window.clearTimeout(settleTimeoutRef.current);
    if (autoScrollFrameRef.current != null) cancelAnimationFrame(autoScrollFrameRef.current);
    document.body.style.userSelect = '';
  }, []);

  return { isReordering, dragIndex, getRowStyle, startReorderDrag, measureRowHeight, moveByKeyboard, getItemKey };
}
