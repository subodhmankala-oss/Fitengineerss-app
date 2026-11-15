import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// "Lift and drop" for set rows (client logger + coach Live Log):
// press and hold a set row (~300 ms) and it lifts off the table; a
// "Drop to remove" pill slides up from the bottom of the screen. Drop the
// row on the pill to remove the set (with a 5 s Undo), or drop it over
// another row of the same exercise to move it there. Replaces the red bin
// that used to sit on every row.
//
// Pointer handling is done on document-level listeners so a lifted row
// keeps following the finger even outside its own box. A quick tap or a
// scroll (finger moves before the hold completes) never lifts anything,
// so the fields and tick inside the row behave exactly as before.
const HOLD_MS = 300;
const MOVE_CANCEL_PX = 8;
const UNDO_MS = 5000;
const SLIDE = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';

const buzz = (ms) => {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* not supported */ }
};

export function useSetLiftDrop({ onRemove, onMove, canRemove }) {
  // Only what the bin needs to render lives in state; the row movement
  // itself is applied straight to the DOM so dragging never re-renders.
  const [bin, setBin] = useState(null); // { exIdx, hot, allowed }
  const [undo, setUndo] = useState(null); // { id, restore }
  const binRef = useRef(null);
  const drag = useRef(null);
  const toClear = useRef([]);
  const undoTimer = useRef(null);
  const handlers = useRef({ onRemove, onMove, canRemove });
  useEffect(() => { handlers.current = { onRemove, onMove, canRemove }; });

  const clearRows = (rows) => rows.forEach((n) => {
    n.style.transition = 'none';
    n.style.transform = '';
    n.classList.remove('set-row-lifted');
  });

  // Rows are keyed by index, so after a move React reuses each DOM node for
  // new content. Clear the drag offsets only once that new content is on
  // screen, so nothing flashes back to its old place for a frame.
  useLayoutEffect(() => {
    if (!toClear.current.length) return;
    const rows = toClear.current;
    toClear.current = [];
    clearRows(rows);
    requestAnimationFrame(() => rows.forEach((n) => { n.style.transition = ''; }));
  });

  const finish = useCallback((st) => {
    drag.current = null;
    document.body.classList.remove('set-lift-active');
    const hot = st.hot;
    setBin(null);
    // A long press is not a tap: swallow the click the browser fires
    // after pointerup so it doesn't open the field / tick under the finger.
    const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', swallow, true);
    setTimeout(() => window.removeEventListener('click', swallow, true), 60);

    if (hot && st.allowed) {
      clearRows(st.rows);
      st.rows.forEach((n) => { n.style.transition = ''; });
      buzz(18);
      const restore = handlers.current.onRemove(st.exIdx, st.setIdx);
      if (typeof restore === 'function') {
        clearTimeout(undoTimer.current);
        setUndo({ id: Date.now(), restore });
        undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
      }
      return;
    }
    const to = st.target;
    if (to === st.setIdx) {
      // Settle back into place.
      st.rows.forEach((n) => { n.style.transition = SLIDE; n.style.transform = ''; n.classList.remove('set-row-lifted'); });
      setTimeout(() => st.rows.forEach((n) => { n.style.transition = ''; }), 240);
      return;
    }
    st.row.classList.remove('set-row-lifted');
    st.row.style.transition = SLIDE;
    st.row.style.transform = `translateY(${(to - st.setIdx) * st.step}px)`;
    setTimeout(() => {
      buzz(6);
      toClear.current = st.rows;
      handlers.current.onMove(st.exIdx, st.setIdx, to);
    }, 220);
  }, []);

  useEffect(() => {
    const onMoveEvt = (e) => {
      const st = drag.current;
      if (!st || e.pointerId !== st.pointerId) return;
      if (!st.lifted) {
        if (Math.hypot(e.clientX - st.x0, e.clientY - st.y0) > MOVE_CANCEL_PX) {
          clearTimeout(st.holdTimer);
          drag.current = null;
        }
        return;
      }
      e.preventDefault();
      const dy = e.clientY - st.y0;
      st.row.style.transform = `translateY(${dy}px) scale(1.03)`;
      const binEl = binRef.current;
      const hot = !!binEl && e.clientY > binEl.getBoundingClientRect().top - 24;
      if (hot !== st.hot) {
        st.hot = hot;
        if (hot && st.allowed) buzz(8);
        setBin((b) => (b ? { ...b, hot } : b));
      }
      const centre = st.mids[st.setIdx] + dy;
      let target = 0;
      st.mids.forEach((m, k) => { if (centre > m - st.step / 2) target = k; });
      st.target = hot ? st.setIdx : Math.max(0, Math.min(st.rows.length - 1, target));
      st.rows.forEach((n, k) => {
        if (n === st.row) return;
        let off = 0;
        if (st.target > st.setIdx && k > st.setIdx && k <= st.target) off = -st.step;
        if (st.target < st.setIdx && k < st.setIdx && k >= st.target) off = st.step;
        n.style.transform = off ? `translateY(${off}px)` : '';
      });
    };
    const onUpEvt = (e) => {
      const st = drag.current;
      if (!st || e.pointerId !== st.pointerId) return;
      clearTimeout(st.holdTimer);
      if (!st.lifted) { drag.current = null; return; }
      finish(st);
    };
    // Once a row is lifted the page must not scroll under the finger.
    const onTouchMove = (e) => { if (drag.current?.lifted) e.preventDefault(); };
    document.addEventListener('pointermove', onMoveEvt, { passive: false });
    document.addEventListener('pointerup', onUpEvt);
    document.addEventListener('pointercancel', onUpEvt);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      document.removeEventListener('pointermove', onMoveEvt);
      document.removeEventListener('pointerup', onUpEvt);
      document.removeEventListener('pointercancel', onUpEvt);
      document.removeEventListener('touchmove', onTouchMove);
      clearTimeout(undoTimer.current);
    };
  }, [finish]);

  const lift = (st) => {
    const rows = Array.from(st.row.parentElement?.children || []).filter((n) => n.classList.contains('hevy-set-row'));
    if (!rows.includes(st.row)) { drag.current = null; return; }
    st.lifted = true;
    st.rows = rows;
    st.mids = rows.map((n) => { const b = n.getBoundingClientRect(); return b.top + b.height / 2; });
    st.step = rows.length > 1 ? st.mids[1] - st.mids[0] : st.row.getBoundingClientRect().height;
    st.allowed = handlers.current.canRemove(st.exIdx);
    rows.forEach((n) => { n.style.transition = n === st.row ? 'box-shadow 0.2s' : SLIDE; });
    st.row.classList.add('set-row-lifted');
    st.row.style.transform = 'scale(1.03)';
    document.body.classList.add('set-lift-active');
    buzz(10);
    setBin({ exIdx: st.exIdx, hot: false, allowed: st.allowed });
  };

  // Spread onto each set row: <div {...liftRowProps(exIdx, setIdx)}>
  const liftRowProps = (exIdx, setIdx) => ({
    onPointerDown: (e) => {
      if (drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const st = {
        exIdx, setIdx, row: e.currentTarget, pointerId: e.pointerId,
        x0: e.clientX, y0: e.clientY, lifted: false, hot: false, target: setIdx,
      };
      st.holdTimer = setTimeout(() => { if (drag.current === st) lift(st); }, HOLD_MS);
      drag.current = st;
    },
    onContextMenu: (e) => { if (drag.current) e.preventDefault(); },
  });

  const runUndo = () => {
    if (!undo) return;
    clearTimeout(undoTimer.current);
    undo.restore();
    setUndo(null);
  };

  return { liftRowProps, bin, binRef, undo, runUndo };
}
