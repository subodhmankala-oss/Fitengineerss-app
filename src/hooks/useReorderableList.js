import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

// How close the pointer needs to get to the scroll container's top/bottom
// edge (in px) before auto-scroll kicks in, and how fast it scrolls right
// at the edge (px per animation frame, ~60fps). Scroll speed ramps linearly
// from 0 at the edge of this zone up to the max right at the container's
// boundary — the same "closer to the edge = faster" feel as iOS/most
// native drag-and-drop.
const AUTO_SCROLL_EDGE = 70;
const AUTO_SCROLL_MAX_SPEED = 16;

// How long the dropped row glides from where the pointer let go into its
// exact slot before the new order is committed and the cards expand back.
const SETTLE_MS = 180;

// Marks everything that's hidden while reordering (see hidePageChrome) —
// styled `display: none !important` in WorkoutTracker.css.
const HIDDEN_ATTR = 'data-reorder-hidden';

// Walks up from the drag handle to find the actual scrolling ancestor,
// rather than assuming the window/page scrolls. In this app that's
// `.main-content`, but walking up by computed style keeps this working if
// reorder is ever used inside its own scroll box (a modal, a panel).
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
// viewport coordinate space as PointerEvent.clientY. For page-level
// scrolling getBoundingClientRect() would report the full scrollHeight
// instead of the visible window, so that case is measured against the
// window itself.
function getViewportBounds(container) {
  if (container === document.documentElement || container === document.body) {
    return { top: 0, bottom: window.innerHeight };
  }
  const rect = container.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom };
}

// Stable per-item React keys, without touching the exercise data shape.
// A reorder only ever permutes existing object references (it never clones
// the exercise objects), so identity-keying off the object reference is
// enough. Rows keyed by index would have React patch content in place
// instead of moving DOM nodes, which turns the drop into a snap.
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

// How long to keep correcting scroll drift after a drag ends (late layout
// shifts such as images or fonts inside the re-expanded cards).
const SCROLL_ANCHOR_WINDOW_MS = 360;

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// Keeps `anchorEl` pinned at `targetTop` (viewport coordinates) for
// SCROLL_ANCHOR_WINDOW_MS by nudging `container.scrollTop` every frame.
function startAnchorCorrection(container, anchorEl, targetTop) {
  if (!container || !anchorEl || targetTop == null) {
    if (container) container.style.scrollBehavior = '';
    return;
  }
  const start = now();
  const step = () => {
    if (!anchorEl.isConnected) { container.style.scrollBehavior = ''; return; }
    const drift = anchorEl.getBoundingClientRect().top - targetTop;
    if (drift !== 0) container.scrollTop += drift;
    if (now() - start < SCROLL_ANCHOR_WINDOW_MS) {
      requestAnimationFrame(step);
    } else {
      container.style.scrollBehavior = '';
    }
  };
  requestAnimationFrame(step);
}

// "Only the exercise names on screen" while dragging: hides every sibling
// along the path from the dragged row up to the scroll container (page
// header, add-exercise buttons, timers, …), leaving just the list of rows.
// Done on the DOM rather than per call site so the client logger, coach
// Live Log and plan editor all get it without each one threading an
// `isReordering` check through their surrounding markup. Returns an undo.
function hidePageChrome(rowEl, container) {
  const hidden = [];
  let node = rowEl;
  while (node && node !== container && node !== document.body && node.parentElement) {
    for (const sib of node.parentElement.children) {
      if (sib === node || sib.hasAttribute(HIDDEN_ATTR)) continue;
      // First level is the list itself — keep the other exercise rows.
      if (node === rowEl && sib.classList.contains('ex-reorder-row')) continue;
      sib.setAttribute(HIDDEN_ATTR, '');
      hidden.push(sib);
    }
    node = node.parentElement;
  }
  return () => hidden.forEach((el) => el.removeAttribute(HIDDEN_ATTR));
}

// Press-and-drag "reorder mode" for an exercise list (client logger, coach
// Live Log, plan editor). Pressing a row's drag handle:
//   1. instantly flips the list into compact name-only rows and hides the
//      rest of the page, then scrolls so the pressed row sits right under
//      the finger/cursor,
//   2. drags that row with the pointer while the other rows slide aside and
//      a dashed slot shows exactly where it will land, auto-scrolling near
//      the top/bottom edge,
//   3. on release, glides the row into that slot, commits the new order and
//      puts the normal screen straight back, keeping the moved exercise in
//      view.
//
// The dragged row's position is written straight to its DOM node on every
// pointer move instead of going through React state — these lists live
// inside very large components, and re-rendering all of them per pointer
// event was the main source of the stutter. State only changes when the
// target slot changes.
//
// `onReorder(newArray)` fires once, on drop, with the full array in its new
// order; callers pass their existing state setter (or a thin wrapper).
export function useReorderableList(items, onReorder) {
  const [isReordering, setIsReordering] = useState(false);
  const [dragIndex, setDragIndex] = useState(null); // original index of the item being dragged
  const [orderIds, setOrderIds] = useState([]); // permutation of original indices = current visual order

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const orderIdsRef = useRef([]);
  const dragIndexRef = useRef(null);
  // The pointer position that maps to a drag offset of 0. Auto-scroll
  // nudges it by however far the container scrolled, so "clientY -
  // startYRef" always accounts for scrolling with no separate term.
  const startYRef = useRef(0);
  const startPositionRef = useRef(0);
  const rowHeightRef = useRef(44); // fallback pitch from measureRowHeight
  const pitchRef = useRef(44); // measured distance between compact rows for this drag
  const listenersRef = useRef(null);
  const settleTimeoutRef = useRef(null);
  const scrollContainerCacheRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const lastClientYRef = useRef(0);
  const autoScrollFrameRef = useRef(null);
  // The dragged row's wrapper (.ex-reorder-row) and the element inside it
  // that actually moves with the pointer (.ex-reorder-morph, or the row
  // itself if there isn't one).
  const draggedRowElRef = useRef(null);
  const moveElRef = useRef(null);
  // Undo functions for everything done to the DOM outside React for the
  // duration of a drag (hidden page chrome, temporary list padding).
  const restoreDomRef = useRef([]);

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

  const restoreDom = useCallback(() => {
    restoreDomRef.current.forEach((undo) => undo());
    restoreDomRef.current = [];
  }, []);

  // The single place drag position is computed, from pointer delta alone.
  const applyPointerDelta = useCallback((deltaY) => {
    const moveEl = moveElRef.current;
    if (moveEl) moveEl.style.transform = `translateY(${deltaY}px) scale(1.02)`;

    const pitch = pitchRef.current || 44;
    const steps = Math.round(deltaY / pitch);
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

  // While the pointer sits within AUTO_SCROLL_EDGE px of the container's
  // top/bottom, nudge scrollTop every frame, shift startYRef by however much
  // the container actually moved, and re-run applyPointerDelta so the row
  // stays glued to the pointer. Stops rescheduling itself once the pointer
  // leaves the edge zone; pointermove restarts it (ensureAutoScroll).
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
    setOrderIds([]);
    orderIdsRef.current = [];
  }, [stopAutoScroll]);

  // Takes the page back to normal (cards expanded, chrome visible), running
  // `commitFn` in the same synchronous render, and keeps the dragged
  // exercise at the same spot on screen through the switch.
  const finishDrag = useCallback((commitFn) => {
    settleTimeoutRef.current = null;
    const container = scrollContainerRef.current;
    const rowEl = draggedRowElRef.current;
    const moveEl = moveElRef.current;
    // Where the dropped row visually is right now (transform included).
    const targetTop = moveEl ? moveEl.getBoundingClientRect().top : null;

    if (moveEl) {
      moveEl.style.transform = '';
      moveEl.style.transition = '';
    }
    if (rowEl) {
      rowEl.classList.remove('ex-reorder-row--dragging');
      rowEl.style.removeProperty('--slot-height');
    }
    restoreDom();

    flushSync(() => {
      if (commitFn) commitFn();
      resetDragState();
    });

    // One-shot correction right after the synchronous layout change, then a
    // short follow-up window for anything that shifts a frame or two later.
    if (container && rowEl && targetTop != null && rowEl.isConnected) {
      const drift = rowEl.getBoundingClientRect().top - targetTop;
      if (drift) container.scrollTop += drift;
    }
    startAnchorCorrection(container, rowEl, targetTop);
    draggedRowElRef.current = null;
    moveElRef.current = null;
  }, [resetDragState, restoreDom]);

  const endDrag = useCallback((commit) => {
    if (listenersRef.current) {
      window.removeEventListener('pointermove', listenersRef.current.move);
      window.removeEventListener('pointerup', listenersRef.current.up);
      window.removeEventListener('pointercancel', listenersRef.current.cancel);
      listenersRef.current = null;
    }
    document.body.style.userSelect = '';
    stopAutoScroll();

    const dragIdx = dragIndexRef.current;
    const finalPos = orderIdsRef.current.indexOf(dragIdx);
    const canCommit = commit && dragIdx != null && orderIdsRef.current.length === itemsRef.current.length;
    const changed = canCommit && finalPos !== dragIdx;
    const newOrder = changed ? orderIdsRef.current.map((id) => itemsRef.current[id]) : null;

    // Glide the row from wherever the pointer let go into its exact slot
    // (or back home on cancel), then switch back to the normal screen.
    const exactOffset = canCommit ? (finalPos - dragIdx) * (pitchRef.current || 44) : 0;
    const moveEl = moveElRef.current;
    if (moveEl) {
      moveEl.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(0.2, 0, 0, 1)`;
      moveEl.style.transform = `translateY(${exactOffset}px)`;
    }
    if (!canCommit) {
      orderIdsRef.current = itemsRef.current.map((_, i) => i);
      setOrderIds(orderIdsRef.current);
    }

    settleTimeoutRef.current = window.setTimeout(() => {
      finishDrag(newOrder ? () => onReorder(newOrder) : null);
    }, SETTLE_MS);
  }, [onReorder, finishDrag, stopAutoScroll]);

  const startReorderDrag = useCallback((index) => (e) => {
    // Only the primary button/touch/pen starts a drag.
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    // A drop still settling from the previous drag — finish it right now so
    // the new drag starts from the committed order.
    if (settleTimeoutRef.current) {
      window.clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
      const pending = dragIndexRef.current != null && orderIdsRef.current.length === itemsRef.current.length
        && orderIdsRef.current.indexOf(dragIndexRef.current) !== dragIndexRef.current
        ? orderIdsRef.current.map((id) => itemsRef.current[id])
        : null;
      finishDrag(pending ? () => onReorder(pending) : null);
    }
    if (listenersRef.current) return;

    const handleEl = e.currentTarget;
    const pointerY = e.clientY;

    // Resolved once per component instance — the ancestor walk forces a
    // synchronous layout, which is too slow for every pointerdown.
    if (!scrollContainerCacheRef.current) {
      scrollContainerCacheRef.current = findScrollContainer(handleEl);
    }
    const container = scrollContainerCacheRef.current;
    scrollContainerRef.current = container;
    // .main-content is `scroll-behavior: smooth`; every scrollTop write
    // below has to land instantly instead of starting a smooth scroll.
    container.style.scrollBehavior = 'auto';

    const rowEl = handleEl.closest('.ex-reorder-row') || handleEl;
    draggedRowElRef.current = rowEl;
    moveElRef.current = rowEl.querySelector('.ex-reorder-morph') || rowEl;

    dragIndexRef.current = index;
    const initialOrder = itemsRef.current.map((_, i) => i);
    orderIdsRef.current = initialOrder;
    startPositionRef.current = index;

    // Switch to compact rows synchronously so the new layout can be
    // measured before the next paint.
    flushSync(() => {
      setDragIndex(index);
      setOrderIds(initialOrder);
      setIsReordering(true);
    });
    restoreDomRef.current.push(hidePageChrome(rowEl, container));
    document.body.style.userSelect = 'none';

    // Row pitch (height + gap) from the real compact layout.
    const listEl = rowEl.parentElement;
    const rows = listEl ? Array.from(listEl.children).filter((el) => el.classList.contains('ex-reorder-row')) : [];
    const compactEl = rowEl.querySelector('.ex-reorder-compact-row');
    const slotHeight = (compactEl || rowEl).getBoundingClientRect().height;
    let pitch = 0;
    if (rows.length > 1) {
      pitch = (rows[rows.length - 1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top) / (rows.length - 1);
    }
    pitchRef.current = pitch > 0 ? pitch : (rowHeightRef.current || 44);

    // Bring the pressed row under the finger: the cards above it just
    // collapsed and the page chrome disappeared, so otherwise it'd be
    // somewhere else entirely. If the container can't scroll far enough,
    // pad the list temporarily so it can.
    const rowRect = (compactEl || rowEl).getBoundingClientRect();
    let delta = rowRect.top + rowRect.height / 2 - pointerY;
    if (listEl && rowRect.height) {
      const maxDown = container.scrollHeight - container.clientHeight - container.scrollTop;
      const maxUp = container.scrollTop;
      const prevTop = listEl.style.paddingTop;
      const prevBottom = listEl.style.paddingBottom;
      if (delta < 0 && -delta > maxUp) {
        const pad = -delta - maxUp;
        listEl.style.paddingTop = `${pad}px`;
        delta += pad;
      } else if (delta > 0 && delta > maxDown) {
        listEl.style.paddingBottom = `${delta - maxDown}px`;
      }
      restoreDomRef.current.push(() => {
        listEl.style.paddingTop = prevTop;
        listEl.style.paddingBottom = prevBottom;
      });
      if (delta) container.scrollTop += delta;
    }

    startYRef.current = pointerY;
    lastClientYRef.current = pointerY;
    rowEl.style.setProperty('--slot-height', `${slotHeight}px`);
    rowEl.classList.add('ex-reorder-row--dragging');
    const moveEl = moveElRef.current;
    moveEl.style.transition = 'none';
    moveEl.style.transform = 'translateY(0px) scale(1.02)';

    // Only the pointer that started the drag moves or drops it — a second
    // finger touching the screen mid-drag is ignored.
    const pointerId = e.pointerId;
    const isOwnPointer = (ev) => pointerId == null || ev.pointerId == null || ev.pointerId === pointerId;
    const onMove = (ev) => {
      if (dragIndexRef.current == null || !isOwnPointer(ev)) return;
      lastClientYRef.current = ev.clientY;
      applyPointerDelta(ev.clientY - startYRef.current);
      ensureAutoScroll();
    };
    const onUp = (ev) => { if (isOwnPointer(ev)) endDrag(true); };
    const onCancel = (ev) => { if (isOwnPointer(ev)) endDrag(false); };

    listenersRef.current = { move: onMove, up: onUp, cancel: onCancel };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }, [endDrag, finishDrag, onReorder, ensureAutoScroll, applyPointerDelta]);

  // Keyboard fallback — Alt/Option + Arrow Up/Down on a focused handle
  // nudges the row one slot and commits immediately.
  const moveByKeyboard = useCallback((index, direction) => {
    const list = itemsRef.current;
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const next = [...list];
    const [moved] = next.splice(index, 1);
    next.splice(targetIdx, 0, moved);
    onReorder(next);
  }, [onReorder]);

  const getItemKey = useCallback((index) => stableKeyFor(itemsRef.current[index]), []);

  // Per-row inline style. The dragged row's own movement is written to the
  // DOM directly (see applyPointerDelta); here it only carries the offset
  // of its drop slot (the dashed placeholder, .ex-reorder-row--dragging in
  // WorkoutTracker.css). Every other row slides to its new slot.
  const getRowStyle = useCallback((index) => {
    if (!isReordering) return undefined;
    const pitch = pitchRef.current || 44;
    const pos = orderIds.indexOf(index);
    if (pos === -1) return undefined;
    const offset = (pos - index) * pitch;
    if (index === dragIndex) {
      return { '--slot-offset': `${offset}px`, position: 'relative', zIndex: 5 };
    }
    return {
      transform: `translateY(${offset}px)`,
      transition: 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
    };
  }, [isReordering, dragIndex, orderIds]);

  // Clean up listeners/timers/DOM changes if the component unmounts
  // mid-drag or mid-settle.
  useEffect(() => () => {
    if (listenersRef.current) {
      window.removeEventListener('pointermove', listenersRef.current.move);
      window.removeEventListener('pointerup', listenersRef.current.up);
      window.removeEventListener('pointercancel', listenersRef.current.cancel);
    }
    if (settleTimeoutRef.current) window.clearTimeout(settleTimeoutRef.current);
    if (autoScrollFrameRef.current != null) cancelAnimationFrame(autoScrollFrameRef.current);
    restoreDomRef.current.forEach((undo) => undo());
    document.body.style.userSelect = '';
    if (scrollContainerRef.current) scrollContainerRef.current.style.scrollBehavior = '';
  }, []);

  return { isReordering, dragIndex, getRowStyle, startReorderDrag, measureRowHeight, moveByKeyboard, getItemKey };
}
