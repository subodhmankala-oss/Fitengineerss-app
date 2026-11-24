import { useCallback, useSyncExternalStore } from 'react';

/** Whether a CSS media query matches now; re-renders when that changes. */
export default function useMediaQuery(query) {
  const subscribe = useCallback((onChange) => {
    const mql = window.matchMedia?.(query);
    mql?.addEventListener?.('change', onChange);
    return () => mql?.removeEventListener?.('change', onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(query)?.matches ?? false);
}
