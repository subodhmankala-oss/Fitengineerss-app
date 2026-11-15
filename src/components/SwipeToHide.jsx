import React, { useEffect, useRef, useState } from 'react';

// Width of the "Hide" action revealed behind the card.
const ACTION_W = 76;

const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/**
 * Swipe a card left to hide it, like a mail app (2026-11-15: the ✕ on the
 * home screen's next-workout card "looks old school").
 *
 * - A short swipe left snaps open to show a red "Hide" action; tap it to hide.
 * - A long swipe (past half the card) hides straight away.
 * - Tapping the card while it's swiped open just closes it again.
 * - The first time a client sees it (per `hintKey`), the card nudges left and
 *   back once so the gesture is discoverable. Skipped under reduce-motion.
 * - Keyboard / screen reader: the Hide action is a real button; focusing it
 *   slides the card open.
 *
 * Vertical drags are left to the page (touch-action: pan-y), so scrolling
 * the home screen over the card still works.
 */
export default function SwipeToHide({ onHide, hintKey, hideLabel = 'Hide this suggestion', children, style }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (!hintKey || prefersReducedMotion()) return undefined;
    try { if (localStorage.getItem(hintKey)) return undefined; } catch { return undefined; }
    const out = setTimeout(() => setOffset(-48), 900);
    const back = setTimeout(() => {
      setOffset(0);
      try { localStorage.setItem(hintKey, '1'); } catch { /* storage blocked — hint again next time */ }
    }, 1600);
    return () => { clearTimeout(out); clearTimeout(back); };
  }, [hintKey]);

  const hide = () => {
    const width = wrapRef.current?.offsetWidth || 400;
    setOffset(-width);
    setTimeout(onHide, prefersReducedMotion() ? 0 : 200);
  };

  const onPointerDown = (e) => {
    drag.current = { x: e.clientX, y: e.clientY, base: offset, horizontal: null, id: e.pointerId };
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.horizontal === null) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        d.horizontal = true;
        setDragging(true);
        try { e.currentTarget.setPointerCapture?.(d.id); } catch { /* not supported */ }
      } else if (Math.abs(dy) > 8) {
        drag.current = null; // a scroll, not a swipe
        return;
      } else {
        return;
      }
    }
    const width = wrapRef.current?.offsetWidth || 400;
    // Kept on the ref too: a fast flick can release before React re-renders,
    // and the `offset` state seen by onPointerUp would still be the old one.
    d.last = Math.max(-width, Math.min(0, d.base + dx));
    setOffset(d.last);
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.horizontal) return;
    setDragging(false);
    suppressClick.current = true; // the release isn't a tap on the card
    const width = wrapRef.current?.offsetWidth || 400;
    const at = d.last ?? d.base;
    if (at < -width / 2) hide();
    else setOffset(at < -ACTION_W / 2 ? -ACTION_W : 0);
  };

  // Swallow the click a drag ends with, and a tap that only closes the action.
  const onClickCapture = (e) => {
    if (suppressClick.current || offset !== 0) {
      e.stopPropagation();
      e.preventDefault();
      suppressClick.current = false;
      if (!dragging) setOffset(0);
    }
  };

  return (
    // flexShrink 0: the home screen is a fixed-height, scrolling flex column,
    // and an overflow:hidden child there may shrink to 0px tall (no automatic
    // min-height) — the card was rendered but invisible (2026-11-15).
    <div ref={wrapRef} style={{ position: 'relative', overflow: 'hidden', borderRadius: '12px', flexShrink: 0, ...style }}>
      <button
        type="button"
        aria-label={hideLabel}
        onClick={hide}
        onFocus={() => setOffset(-ACTION_W)}
        onBlur={() => { if (!drag.current) setOffset(0); }}
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: `${ACTION_W + 12}px`, paddingLeft: '12px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
          background: 'rgba(239, 68, 68, 0.16)', color: '#f87171', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" />
          <path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87" />
          <path d="M3 3l18 18" />
        </svg>
        Hide
      </button>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        style={{
          position: 'relative',
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.22s ease',
          touchAction: 'pan-y'
        }}
      >
        {children}
      </div>
    </div>
  );
}
