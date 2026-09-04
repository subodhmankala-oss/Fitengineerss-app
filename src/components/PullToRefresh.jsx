import { useEffect, useRef, useState } from 'react';

// Native "pull down at the top of the list to reload" gesture, like every
// other mobile app has. This app is installed as a standalone PWA
// (manifest.webmanifest: display: "standalone") on most devices, which means
// there's no browser chrome at all — so the pull-to-refresh a phone browser
// gives you for free doesn't exist here; it has to be built by hand. Does a
// literal hard refresh (window.location.reload()) once pulled past the
// threshold, same as what the native gesture does elsewhere.
const THRESHOLD = 70; // px of (damped) pull distance needed to trigger a refresh
const MAX_PULL = 110; // visual cap so the indicator can't be dragged off-screen

// Walks up from the touched element to find whichever ancestor actually
// scrolls — mirrors main.jsx's own scrollOwnerOf, since this app's real
// scroll containers are .main-content (client screens) and
// .trainer-dashboard-container (coach), not the document body.
function findScrollOwner(el) {
  let node = el;
  while (node && node !== document.body) {
    if (node.nodeType === 1) {
      const oy = getComputedStyle(node).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [rect, setRect] = useState(null);
  const refreshingRef = useRef(false);
  const stateRef = useRef({ startY: 0, tracking: false, owner: null, active: false, pull: 0 });

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  // The indicator overlays the "phone frame" (.app-container), not the raw
  // viewport — on desktop widths that frame is a centered, capped-width
  // island, so pinning to viewport left/width would draw the spinner
  // off-center. Re-measured on resize since --app-vh/orientation changes
  // move it.
  useEffect(() => {
    const updateRect = () => {
      const el = document.querySelector('.app-container');
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ left: r.left, width: r.width, top: r.top });
      }
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    window.visualViewport?.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.visualViewport?.removeEventListener('resize', updateRect);
    };
  }, []);

  useEffect(() => {
    const setPullDistance = (v) => {
      stateRef.current.pull = v;
      setPull(v);
    };

    const onTouchStart = (e) => {
      if (refreshingRef.current) return;
      // Never start a pull while the keyboard is open, or on the workout
      // log's drag-reorder handles (touch-action: none there for a reason —
      // see WorkoutTracker.css) or anything explicitly opted out.
      if (document.documentElement.classList.contains('keyboard-open')) return;
      if (e.touches.length !== 1) return;
      const target = e.target;
      if (target.closest && target.closest('.btn-drag-handle, [data-no-pull-refresh]')) return;
      const owner = findScrollOwner(target);
      if ((owner.scrollTop || 0) > 0) return;
      stateRef.current = { startY: e.touches[0].clientY, tracking: true, owner, active: false, pull: 0 };
    };

    const onTouchMove = (e) => {
      const st = stateRef.current;
      if (!st.tracking || refreshingRef.current) return;
      // The scroll owner moved on from the top since the touch started
      // (e.g. momentum from a prior scroll settling) — this isn't a
      // pull-to-refresh gesture, let the browser handle it normally.
      if ((st.owner.scrollTop || 0) > 0) {
        st.tracking = false;
        if (st.active) { st.active = false; setPullDistance(0); }
        return;
      }
      const dy = e.touches[0].clientY - st.startY;
      // Small dead-zone so an ordinary tap or an upward scroll never engages this.
      if (dy < 8) {
        if (st.active) { st.active = false; setPullDistance(0); }
        return;
      }
      st.active = true;
      // Elastic damping — the further you pull, the less it actually moves.
      const damped = Math.min(MAX_PULL, dy * 0.45);
      setPullDistance(damped);
      // Only swallow the touch once we're actually mid-pull, so normal
      // scrolling/tapping everywhere else is untouched.
      if (e.cancelable) e.preventDefault();
    };

    const onTouchEnd = () => {
      const st = stateRef.current;
      if (!st.tracking) return;
      st.tracking = false;
      if (st.active && st.pull >= THRESHOLD) {
        setRefreshing(true);
        setPullDistance(THRESHOLD);
        // Small delay so the spinner is actually visible before the
        // navigation tears the page down.
        setTimeout(() => window.location.reload(), 150);
      } else if (st.active) {
        setPullDistance(0);
      }
      st.active = false;
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart, { capture: true });
      document.removeEventListener('touchmove', onTouchMove, { capture: true });
      document.removeEventListener('touchend', onTouchEnd, { capture: true });
      document.removeEventListener('touchcancel', onTouchEnd, { capture: true });
    };
  }, []);

  if (!rect || (pull <= 0 && !refreshing)) return null;

  const progress = Math.min(1, pull / THRESHOLD);

  return (
    <div
      style={{
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        top: rect.top,
        height: 0,
        overflow: 'visible',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          marginTop: Math.max(10, pull - 26),
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid rgba(255,255,255,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
          transition: refreshing ? 'none' : 'margin-top 0.15s ease, opacity 0.15s ease',
          opacity: Math.max(0.35, progress),
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          style={{
            transform: refreshing ? undefined : `rotate(${progress * 300}deg)`,
            animation: refreshing ? 'ptr-spin 0.7s linear infinite' : 'none',
          }}
        >
          <circle cx="12" cy="12" r="9" stroke="rgba(148,163,184,0.35)" strokeWidth="2.5" />
          <path d="M12 3a9 9 0 0 1 9 9" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
      <style>{'@keyframes ptr-spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}
