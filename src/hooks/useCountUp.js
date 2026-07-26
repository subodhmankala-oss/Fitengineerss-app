import { useEffect, useRef, useState } from 'react';

// Animates a number counting up from 0 to `value` over `durationMs`, using
// requestAnimationFrame (GPU-friendly, no layout thrash) — the web
// equivalent of a Reanimated count-up. Re-triggers whenever `value` changes.
export function useCountUp(value, durationMs = 900) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    const target = Number.isFinite(value) ? value : 0;
    const start = performance.now();
    const from = 0;

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      // easeOutCubic — fast start, gentle settle (matches native-feeling UI).
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (target - from) * eased);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [value, durationMs]);

  return display;
}
