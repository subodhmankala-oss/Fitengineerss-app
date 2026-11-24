import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useMediaQuery from '../hooks/useMediaQuery';
import BottomIsland from './BottomIsland';
import './CoachDetailTabs.css';

// Coach client-detail tabs. Phones: the same floating bottom island as the
// client app (BottomIsland). Desktop: a bar of "status tabs" — each shows its
// name plus a small live line (plans sent, the running Live Log clock, when the
// client last trained, latest weight), a tinted pill slides under the open one.

const Svg = ({ children }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const SendIcon = () => <Svg><path d="M10 14 21 3" /><path d="m21 3-6.5 18a.55.55 0 0 1-1 0L10 14l-7-3.5a.55.55 0 0 1 0-1L21 3" /></Svg>;
const PulseIcon = () => <Svg><path d="M3 12h4l3-8 4 16 3-8h4" /></Svg>;
const HistoryIcon = () => <Svg><path d="M12 8v4l2 2" /><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" /></Svg>;
const RulerIcon = () => <Svg><path d="M3 17 17 3l4 4L7 21z" /><path d="m7.5 12.5 2 2M10.5 9.5l2 2M13.5 6.5l2 2" /></Svg>;

const TABS = [
  { key: 'plans', label: 'Send plan', icon: <SendIcon />, tour: 'tc-tab-plans' },
  { key: 'livelog', label: 'Log', icon: <PulseIcon />, tour: 'tc-tab-livelog' },
  { key: 'workout', label: 'History', icon: <HistoryIcon />, tour: 'tc-tab-workout' },
  { key: 'measurements', label: 'Measurements', icon: <RulerIcon /> },
];

// Same icons for the island; `duo` shapes fill lightly while their tab is open.
const ISLAND_TABS = [
  {
    id: 'plans',
    label: 'Plan',
    tour: 'tc-tab-plans',
    icon: (
      <>
        <path className="duo" d="m21 3-6.5 18a.55.55 0 0 1-1 0L10 14l-7-3.5a.55.55 0 0 1 0-1L21 3" />
        <path d="M10 14 21 3" />
      </>
    ),
  },
  { id: 'livelog', label: 'Log', tour: 'tc-tab-livelog', icon: <path d="M3 12h4l3-8 4 16 3-8h4" /> },
  {
    id: 'workout',
    label: 'History',
    tour: 'tc-tab-workout',
    icon: (
      <>
        <circle className="duo" cx="12" cy="12" r="9" stroke="none" />
        <path d="M12 8v4l2 2" />
        <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
      </>
    ),
  },
  {
    id: 'measurements',
    label: 'Body',
    icon: (
      <>
        <path className="duo" d="M3 17 17 3l4 4L7 21z" />
        <path d="m7.5 12.5 2 2M10.5 9.5l2 2M13.5 6.5l2 2" />
      </>
    ),
  },
];

export default function CoachDetailTabs(props) {
  const onPhone = useMediaQuery('(max-width: 899px)');
  return onPhone ? <IslandTabs {...props} /> : <StatusTabs {...props} />;
}

function IslandTabs({ active, onSelect, liveRunning, hasDot, hidden }) {
  // The bar always floats in view, so a tap can come from far down a tab; the
  // next one starts at its top.
  const spacerRef = useRef(null);
  const select = (key) => {
    onSelect(key);
    spacerRef.current?.closest('.trainer-dashboard-container')?.scrollTo?.({ top: 0, behavior: 'instant' });
  };
  return (
    <>
      <div ref={spacerRef} className="trainer-tabs coach-tabs is-island" />
      {!hidden && createPortal(
        <BottomIsland
          className="bottom-nav--coach"
          label="Client"
          tabs={ISLAND_TABS}
          activeTab={active}
          onSelect={select}
          hasDot={hasDot}
          isLive={(key) => key === 'livelog' && liveRunning}
        />,
        // Like the rest timer card: pinned to the app frame, not to the page
        // that scrolls inside it.
        document.querySelector('.app-container') || document.body
      )}
    </>
  );
}

function StatusTabs({ active, onSelect, statuses, liveRunning, hasDot }) {
  const idx = Math.max(0, TABS.findIndex(t => t.key === active));
  // Tabs are sized to their content (so "Measurements" fits in full), so the
  // pill can't be placed by arithmetic — it's laid over the active tab's own
  // box, re-measured when the tab, its text or the bar's width changes.
  const trackRef = useRef(null);
  const pillRef = useRef(null);
  // The pill only slides once a tab is tapped, not into place on first paint.
  const [slid, setSlid] = useState(false);
  const statusKey = TABS.map(t => statuses[t.key]).join('|');
  useLayoutEffect(() => {
    const track = trackRef.current;
    const pill = pillRef.current;
    if (!track || !pill) return undefined;
    const place = () => {
      const btn = track.querySelectorAll('.coach-tab')[idx];
      if (!btn) return;
      pill.style.left = `${btn.offsetLeft}px`;
      pill.style.width = `${btn.offsetWidth}px`;
    };
    place();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    ro?.observe(track);
    window.addEventListener('resize', place);
    return () => { ro?.disconnect(); window.removeEventListener('resize', place); };
  }, [idx, statusKey]);
  return (
    <div className="trainer-tabs coach-tabs">
      <div ref={trackRef} className="coach-tabs-track" role="tablist">
        <span ref={pillRef} className={`coach-tabs-pill tone-${TABS[idx].key}${slid ? ' is-sliding' : ''}`} aria-hidden="true" />
        {TABS.map(({ key, label, icon, tour }) => {
          const on = key === active;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              data-tour={tour}
              className={`trainer-tab-btn coach-tab tone-${key} ${on ? 'active' : ''}`}
              onClick={() => { setSlid(true); onSelect(key); }}
            >
              <span className="coach-tab-head">
                {icon}
                <span className="coach-tab-label">{label}</span>
                {hasDot?.(key) && <span className="unread-dot coach-tab-unread" aria-label="New update" />}
              </span>
              <span className="coach-tab-status">
                {key === 'livelog' && liveRunning && <span className="coach-tab-live" aria-hidden="true" />}
                <span className="coach-tab-num">{statuses[key]}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
