import { useEffect } from 'react';

// Phone keyboards (the number pad especially) cover the lower part of a
// full-page screen without resizing it, so a focused field near the bottom
// ends up hidden behind the keys. While mounted: when a text/number field
// inside `scrollSelector` gets focus, pad that scroller by the keyboard's
// height (so there is room to scroll) and bring the field to the middle of
// what is still visible. Same idea as the onboarding wizard's fix.
export function keyboardHeight(vv, innerHeight) {
  if (!vv) return 0;
  return Math.max(0, innerHeight - vv.height - vv.offsetTop);
}

export default function useFieldAboveKeyboard(scrollSelector = '.cp-form-scroll') {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined;
    let scroller = null;
    let field = null;
    let timer = null;

    const pad = () => {
      if (!scroller) return;
      const kb = keyboardHeight(vv, window.innerHeight);
      scroller.style.paddingBottom = kb > 80 ? `${kb + 24}px` : '';
    };
    const reveal = () => {
      pad();
      field?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    };
    const onFocusIn = (e) => {
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const next = e.target.closest?.(scrollSelector);
      if (!next) return;
      if (scroller && scroller !== next) scroller.style.paddingBottom = '';
      scroller = next;
      field = e.target;
      // The keyboard animates in; measure after it has (and again when the
      // visualViewport resize event lands).
      clearTimeout(timer);
      timer = setTimeout(reveal, 300);
    };
    const onFocusOut = () => {
      clearTimeout(timer);
      // Next field's focusin fires right after; only clear if focus really left.
      timer = setTimeout(() => {
        const active = document.activeElement;
        if (!active || !/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) {
          if (scroller) scroller.style.paddingBottom = '';
          field = null;
        }
      }, 150);
    };
    const onResize = () => { if (field) reveal(); else pad(); };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    vv.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      vv.removeEventListener('resize', onResize);
      if (scroller) scroller.style.paddingBottom = '';
    };
  }, [scrollSelector]);
}
