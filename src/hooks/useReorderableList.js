import { useCallback, useEffect, useRef, useState } from 'react';

// Press-and-drag "reorder mode" for an exercise list (client logger, coach
// Live Log, plan editor). Pressing a row's drag handle:
//   1. flips the whole list into compact name-only rows (see the
//      .ex-reorder-* classes in WorkoutTracker.css — a CSS grid-rows morph,
//      no JS height measurement needed for the collapse/expand),
//   2. lets that row be dragged to a new position, with the other rows
//      sliding into their new slots via a plain CSS transform transition,
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

  // Attach to the compact row's DOM node to learn its real rendered height
  // (font size / padding vary slightly by device), used to convert pointer
  // movement into "how many rows did we move past".
  const measureRowHeight = useCallback((el) => {
    if (el) {
      const h = el.getBoundingClientRect().height;
      if (h) rowHeightRef.current = h;
    }
  }, []);

  const resetDragState = useCallback(() => {
    dragIndexRef.current = null;
    setIsReordering(false);
    setDragIndex(null);
    setDragOffset(0);
    setOrderIds([]);
    setIsSettling(false);
    orderIdsRef.current = [];
  }, []);

  const endDrag = useCallback((commit) => {
    if (listenersRef.current) {
      window.removeEventListener('pointermove', listenersRef.current.move);
      window.removeEventListener('pointerup', listenersRef.current.up);
      window.removeEventListener('pointercancel', listenersRef.current.cancel);
      listenersRef.current = null;
    }
    document.body.style.userSelect = '';

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
  }, [onReorder, resetDragState]);

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

    setDragIndex(index);
    setOrderIds(initialOrder);
    setDragOffset(0);
    setIsReordering(true);
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      if (dragIndexRef.current == null) return;
      const deltaY = ev.clientY - startYRef.current;
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
    };
    const onUp = () => endDrag(true);
    const onCancel = () => endDrag(false);

    listenersRef.current = { move: onMove, up: onUp, cancel: onCancel };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }, [endDrag]);

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

  // Clean up listeners/timers if the component unmounts mid-drag or mid-settle.
  useEffect(() => () => {
    if (listenersRef.current) {
      window.removeEventListener('pointermove', listenersRef.current.move);
      window.removeEventListener('pointerup', listenersRef.current.up);
      window.removeEventListener('pointercancel', listenersRef.current.cancel);
    }
    if (settleTimeoutRef.current) window.clearTimeout(settleTimeoutRef.current);
    document.body.style.userSelect = '';
  }, []);

  return { isReordering, dragIndex, getRowStyle, startReorderDrag, measureRowHeight, moveByKeyboard };
}
