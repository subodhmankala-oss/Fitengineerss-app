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
  const startYRef = useRef(0);
  const startPositionRef = useRef(0);
  const rowHeightRef = useRef(44);
  const listenersRef = useRef(null);
  const settleTimeoutRef = useRef(null);
  // Auto-scroll bookkeeping. scrollContainerRef/startScrollTopRef are set
  // once, at drag start; lastClientYRef tracks the pointer so the rAF loop
  // keeps scrolling even while the finger/cursor is completely still near
  // the edge (a real pointermove won't keep firing on its own, but native
  // drag-and-drop still keeps scrolling in that case — the loop has to
  // drive itself rather than wait for events).
  const scrollContainerRef = useRef(null);
  const startScrollTopRef = useRef(0);
  const lastClientYRef = useRef(0);
  const autoScrollFrameRef = useRef(null);

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

  // Shared by pointermove and the auto-scroll loop: recomputes the dragged
  // row's visual offset and its target slot from the pointer's current
  // viewport position. Scroll-aware — deltaY is "how far the pointer has
  // moved in document space", i.e. its raw viewport movement PLUS however
  // much the container has scrolled since the drag started. Without the
  // scroll term, once auto-scroll kicks in the dragged row would drift off
  // the pointer (its un-transformed flow position scrolls with the page,
  // but the transform offset wouldn't compensate) and the reorder math
  // would freeze the instant the finger stopped moving, even though the
  // list is still scrolling underneath it.
  const updateFromPointer = useCallback((clientY) => {
    const container = scrollContainerRef.current;
    const scrollDelta = container ? container.scrollTop - startScrollTopRef.current : 0;
    const deltaY = (clientY - startYRef.current) + scrollDelta;
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
  // every frame (speed ramping up closer to the edge), re-run the
  // position math so the dragged row stays glued to the pointer and
  // reordering keeps pace, and reschedule. Stops rescheduling itself the
  // moment the pointer isn't near an edge — pointermove restarts it
  // (ensureAutoScroll below) the next time it re-enters the zone, so nothing
  // spins in the background once the drag stops needing to scroll.
  //
  // Kept in a ref (rather than referencing `tickAutoScroll` by name inside
  // itself) purely to dodge the temporal-dead-zone error that recursive
  // self-reference through a `useCallback` binding hits — the rAF callback
  // always resolves it at call time, once the ref's been assigned below.
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
      updateFromPointer(y);
    }
    autoScrollFrameRef.current = requestAnimationFrame(tickAutoScrollRef.current);
  }, [updateFromPointer]);
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
      resetDragState();
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
      onReorder(newOrder);
      resetDragState();
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

    const scrollContainer = findScrollContainer(e.currentTarget);
    scrollContainerRef.current = scrollContainer;
    startScrollTopRef.current = scrollContainer ? scrollContainer.scrollTop : 0;

    setDragIndex(index);
    setOrderIds(initialOrder);
    setDragOffset(0);
    setIsReordering(true);
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      if (dragIndexRef.current == null) return;
      lastClientYRef.current = ev.clientY;
      updateFromPointer(ev.clientY);
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
  }, [endDrag, ensureAutoScroll, updateFromPointer]);

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

  return { isReordering, dragIndex, getRowStyle, startReorderDrag, measureRowHeight, moveByKeyboard };
}
