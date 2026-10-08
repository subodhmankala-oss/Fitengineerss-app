import { useRef } from 'react';

/**
 * Newly added exercises grow open from the top (height 0 -> natural, with a
 * short slide + fade) instead of popping in, which also eases the buttons
 * below them down rather than jumping. Shared by the client logger and the
 * coach's Live Log / plan editor so they behave identically.
 *
 * Done with the Web Animations API because the target height is only known
 * after layout. Usage:
 *   const { markEntering, enterRef } = useExerciseEnterAnimation();
 *   markEntering(name)                 // when the exercise is added
 *   <div ref={enterRef(ex.name)} …>    // on the row that renders it
 * The name waits in a set until its row mounts; each animates once.
 */
export function useExerciseEnterAnimation() {
  const entering = useRef(new Set());

  const markEntering = (name) => { entering.current.add(String(name).toLowerCase()); };

  const enterRef = (name) => (el) => {
    if (!el) return;
    const key = String(name).toLowerCase();
    if (!entering.current.has(key)) return;
    entering.current.delete(key);
    if (typeof el.animate !== 'function' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    // A hidden page's animation clock can sit frozen at 0, which would hold
    // the row at height 0 — just show it.
    if (document.visibilityState === 'hidden') return;
    const h = el.getBoundingClientRect().height;
    const anim = el.animate(
      [
        { height: '0px', opacity: 0, transform: 'translateY(-18px)', overflow: 'hidden' },
        { height: `${h}px`, opacity: 1, transform: 'translateY(0)', overflow: 'hidden' },
      ],
      { duration: 420, easing: 'cubic-bezier(0.22, 0.8, 0.25, 1)' }
    );
    // Once it has landed, bring it fully into view (no-op if already visible).
    anim.onfinish = () => el.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    // Safety net: never leave a row clipped if the clock stalls mid-way
    // (e.g. the app is backgrounded right as it starts).
    setTimeout(() => { if (anim.playState === 'running') anim.finish(); }, 1000);
  };

  return { markEntering, enterRef };
}
