import React from 'react';

// Walks up from `el` to find the nearest actually-scrollable ancestor —
// generic (checks computed overflow + real scroll room) rather than
// hardcoding a class name like '.main-content', since this field can end up
// nested inside other scroll containers (modals, coach client-profile
// panels, etc.) that aren't the top-level page scroller.
function getScrollParent(el) {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    const canScrollY = /(auto|scroll)/.test(style.overflowY);
    if (canScrollY && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

// Stand-in for a native <input> in the set-logging tables (weight/reps/km/
// time). Tapping it opens the shared SetNumberPad instead of the phone's own
// keyboard — see SetNumberPad.jsx for why. Renders as a <button> styled
// identically to the old text input (see the shared ".set-value-btn" rules
// in WorkoutTracker.css) so it drops into the existing table layout as-is.
// Where the scroll container sat BEFORE the pad pushed it, so closing the pad
// can put it back. Without this the page is left stranded at the very bottom:
// opening the pad adds ~340px of bottom padding (SetNumberPad.css) purely to
// create scroll room, we scroll into that room to lift the row above the pad,
// and closing the pad removes the padding again — so the browser clamps
// scrollTop down to the now-smaller maximum, which is the bottom of the page.
// The coach's header/client card end up scrolled off the top with no way back
// except manually scrolling up. Confirmed 2026-08-13 on the coach Live Log.
// Module-level (not React state) because the restore is triggered from
// SetNumberPad, which has no reference to whichever field caused the scroll.
let pendingScrollRestore = null;

export function restoreScrollAfterPad() {
  const pending = pendingScrollRestore;
  pendingScrollRestore = null;
  if (!pending) return;
  const { node, top, scrolledTo } = pending;
  if (!node || !document.contains(node)) return;
  // Only undo OUR adjustment. If the coach scrolled by hand while the pad was
  // open, their position is the one that matters — snapping it away would be
  // its own bug.
  //
  // REGRESSION FIX 2026-08-13: `scrolledTo` was recorded while the pad's
  // own CSS reserved 340px of extra bottom padding on this container (see
  // `body:has(.set-number-pad.open)` in SetNumberPad.css). That padding
  // disappears the INSTANT the pad's `.open` class is removed — no
  // transition — which happens in the very same tick as this function
  // running (both driven by the pad's `active` state going null). By the
  // time we read `node.scrollTop` here, the browser has often already
  // auto-clamped it down to the container's new, shorter max-scroll —
  // which no longer matches the stale, pre-removal `scrolledTo`. The guard
  // then saw a large diff and bailed out, leaving the coach wherever the
  // browser's own clamp had landed instead of restoring anywhere sane —
  // e.g. with the "Save Workout Session" bar overlapping whatever exercise
  // card happened to end up in that spot. Clamp both sides of the
  // comparison (and the restore target) to the CURRENT max scroll so the
  // guard compares like-for-like instead of a stale unclamped value
  // against an already-clamped one.
  const maxScroll = Math.max(0, node.scrollHeight - node.clientHeight);
  const clampedScrolledTo = Math.min(scrolledTo, maxScroll);
  if (Math.abs(node.scrollTop - clampedScrolledTo) > 8) return;
  node.scrollTo({ top: Math.min(top, maxScroll), behavior: 'smooth' });
}

export default function SetValueField({ value, placeholder, disabled, active, onOpen, className = '' }) {
  const handleClick = (e) => {
    onOpen();
    // Bring the row clear of the pad instead of leaving it hidden underneath
    // — the only way to actually see the value you're typing, since the pad
    // itself never shows it, only the field name. `scrollIntoView({block:
    // 'center'})` isn't reliable here: it centers within the WHOLE viewport,
    // including the ~45% of it the pad covers, so a row near the bottom of
    // a long exercise list can still land behind the pad. Instead, measure
    // the pad's real on-screen height and scroll just enough to clear it
    // (plus a margin), the same way you'd account for a fixed footer.
    const el = e.currentTarget;
    requestAnimationFrame(() => {
      const pad = document.querySelector('.set-number-pad');
      const padHeight = pad ? pad.getBoundingClientRect().height : 320;
      const margin = 20;
      // Bring the whole set row into view, not just the tapped cell — with
      // several sets logged, clearing only the Kg/Reps box left the set
      // number, PREV column, and DONE checkbox for that row cut off, making
      // it hard to tell which set you were actually editing.
      const row = el.closest('.hevy-set-row') || el;
      const rect = row.getBoundingClientRect();
      const visibleBottom = window.innerHeight - padHeight - margin;
      let delta = 0;
      if (rect.bottom > visibleBottom) {
        delta = rect.bottom - visibleBottom;
      } else if (rect.top < margin) {
        delta = rect.top - margin;
      }
      if (delta !== 0) {
        const scrollParent = getScrollParent(el);
        // Remember where we started ONLY for the first field opened in this
        // pad session — hopping Kg -> Reps -> next row shouldn't overwrite the
        // original position with an already-adjusted one, or closing the pad
        // would restore to a spot that's itself mid-adjustment.
        if (!pendingScrollRestore || pendingScrollRestore.node !== scrollParent) {
          pendingScrollRestore = { node: scrollParent, top: scrollParent.scrollTop, scrolledTo: 0 };
        }
        scrollParent.scrollBy({ top: delta, behavior: 'smooth' });
        // The smooth scroll lands a frame or more later; record where it
        // actually ended up so restoreScrollAfterPad can tell "still where we
        // put it" from "the coach scrolled somewhere else".
        const settle = () => { if (pendingScrollRestore) pendingScrollRestore.scrolledTo = scrollParent.scrollTop; };
        setTimeout(settle, 400);
      }
    });
  };

  return (
    <button
      type="button"
      className={`set-value-btn ${active ? 'is-active' : ''} ${className}`.trim()}
      onClick={handleClick}
      disabled={disabled}
    >
      {value ? value : <span className="set-value-placeholder">{placeholder}</span>}
      {active && !disabled && <span className="set-value-caret" />}
    </button>
  );
}
