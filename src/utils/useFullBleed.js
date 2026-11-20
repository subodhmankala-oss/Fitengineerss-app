import { useCallback, useLayoutEffect, useRef, useState } from 'react';

const isScroller = (el) => {
  const { overflowY } = getComputedStyle(el);
  return overflowY === 'auto' || overflowY === 'scroll';
};

/**
 * Stretches an element sideways to the edges of the screen area it scrolls
 * in (the nearest scrolling ancestor, else the viewport), whatever padding
 * the cards around it add. Used by the logger's timer bar (client and coach
 * Live Log), which sits inside a padded form inside a padded page — the
 * insets differ per screen and per breakpoint, so a fixed negative margin
 * can't cancel them. Re-measures when the element's parent or its scroller
 * resizes. Adds `is-full-bleed` so CSS can drop the side borders/corners.
 *
 * Phone widths only (< FULL_BLEED_MAX_WIDTH): on desktop the scroller is the
 * whole page, so stretching would run the bar under side columns (coach
 * Manage Client view, reported 2026-11-15) — there it stays a normal card.
 *
 * With `{ trackStuck: true }` it also toggles `is-stuck` while the element
 * (position: sticky) is pinned at the top of its scroller — the timer bars
 * show their blue edge + shadow only then.
 *
 * Returns a callback ref (the bar may mount later than the screen does).
 */
export const FULL_BLEED_MAX_WIDTH = 768;

export default function useFullBleed({ trackStuck = false } = {}) {
  // The node lives in a ref (it's written to below); `mounted` re-runs the
  // effect when the bar appears or is swapped for a new node.
  const nodeRef = useRef(null);
  const [mounted, setMounted] = useState(null);
  const setRef = useCallback((node) => { nodeRef.current = node; setMounted(node ? {} : null); }, []);

  useLayoutEffect(() => {
    const el = nodeRef.current;
    if (!el || !mounted) return undefined;
    const parent = el.parentElement;
    if (!parent) return undefined;
    let scroller = parent;
    while (scroller && scroller !== document.body && !isScroller(scroller)) scroller = scroller.parentElement;
    if (scroller === document.body) scroller = null;

    // Pinned = scrolled, and sitting at the scroller's top edge (plus its
    // sticky `top`). At rest in its normal spot it isn't stuck, even when
    // that spot is the very top (scroll position 0).
    let stuckFrame = 0;
    const checkStuck = () => {
      stuckFrame = 0;
      const scrolled = scroller ? scroller.scrollTop : window.scrollY;
      const edge = (scroller ? scroller.getBoundingClientRect().top + scroller.clientTop : 0)
        + (parseFloat(getComputedStyle(el).top) || 0);
      el.classList.toggle('is-stuck', scrolled > 0 && el.getBoundingClientRect().top <= edge + 1);
    };
    const onScroll = () => { if (!stuckFrame) stuckFrame = requestAnimationFrame(checkStuck); };
    const scrollTarget = scroller || window;
    if (trackStuck) {
      checkStuck();
      scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    }

    const reset = () => {
      el.classList.remove('is-full-bleed');
      el.style.marginLeft = '';
      el.style.marginRight = '';
      el.style.removeProperty('--bleed-left');
      el.style.removeProperty('--bleed-right');
    };

    const measure = () => {
      if (document.documentElement.clientWidth >= FULL_BLEED_MAX_WIDTH) {
        reset();
        return;
      }
      el.classList.add('is-full-bleed');
      const ps = getComputedStyle(parent);
      const p = parent.getBoundingClientRect();
      const contentLeft = p.left + parent.clientLeft + parseFloat(ps.paddingLeft);
      const contentRight = p.left + parent.clientLeft + parent.clientWidth - parseFloat(ps.paddingRight);
      let edgeLeft = 0;
      let edgeRight = document.documentElement.clientWidth;
      if (scroller) {
        const s = scroller.getBoundingClientRect();
        edgeLeft = s.left + scroller.clientLeft;
        edgeRight = edgeLeft + scroller.clientWidth;
      }
      const bleedLeft = Math.max(0, contentLeft - edgeLeft);
      const bleedRight = Math.max(0, edgeRight - contentRight);
      el.style.marginLeft = `${-bleedLeft}px`;
      el.style.marginRight = `${-bleedRight}px`;
      // How far it was pulled out each side, so CSS can pad the contents back
      // in line with the page (e.g. the coach status tabs).
      el.style.setProperty('--bleed-left', `${bleedLeft}px`);
      el.style.setProperty('--bleed-right', `${bleedRight}px`);
    };

    measure();
    // jsdom (tests) has no ResizeObserver — window resize still covers it.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(parent);
    if (scroller) ro?.observe(scroller);
    window.addEventListener('resize', measure);
    // Measuring uses on-screen boxes, which an ancestor's entry animation
    // (e.g. .animate-scale-in's scale(0.95) on the Manage Client view) still
    // shrinks on first paint — sizes don't change as it ends, so the
    // ResizeObserver never fires and the bar stays short of one edge and past
    // the other (reported 2026-11-18). Re-measure whenever an animation ends.
    document.addEventListener('animationend', measure, true);
    document.addEventListener('animationcancel', measure, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      document.removeEventListener('animationend', measure, true);
      document.removeEventListener('animationcancel', measure, true);
      if (trackStuck) {
        scrollTarget.removeEventListener('scroll', onScroll);
        if (stuckFrame) cancelAnimationFrame(stuckFrame);
        el.classList.remove('is-stuck');
      }
      reset();
    };
  }, [mounted, trackStuck]);

  return setRef;
}
