import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import useFullBleed from '../utils/useFullBleed';
import './CoachDetailTabs.css';

// Coach client-detail tab bar ("status tabs"): each tab shows its name plus a
// small live line — plans sent, the running Live Log clock, when the client
// last trained, latest weight. A tinted pill slides under the active tab.

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
  { key: 'plans', label: 'Send plan', short: 'Plan', icon: <SendIcon />, tour: 'tc-tab-plans' },
  { key: 'livelog', label: 'Live Log', short: 'Live', icon: <PulseIcon />, tour: 'tc-tab-livelog' },
  { key: 'workout', label: 'History', short: 'History', icon: <HistoryIcon />, tour: 'tc-tab-workout' },
  { key: 'measurements', label: 'Measurements', short: 'Measurements', icon: <RulerIcon /> },
];

export default function CoachDetailTabs({ active, onSelect, statuses, liveRunning, hasDot }) {
  const idx = Math.max(0, TABS.findIndex(t => t.key === active));
  // Tabs are sized to their content (so "Measurements" fits in full), so the
  // pill can't be placed by arithmetic — it's laid over the active tab's own
  // box, re-measured when the tab, its text or the bar's width changes.
  const trackRef = useRef(null);
  // Phones: the bar's background runs edge to edge (useFullBleed) while the
  // tabs are padded back in line with the cards above.
  const bleedRef = useFullBleed();
  const setTrack = useCallback((node) => { trackRef.current = node; bleedRef(node); }, [bleedRef]);
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
      <div ref={setTrack} className="coach-tabs-track" role="tablist">
        <span ref={pillRef} className={`coach-tabs-pill tone-${TABS[idx].key}${slid ? ' is-sliding' : ''}`} aria-hidden="true" />
        {TABS.map(({ key, label, short, icon, tour }) => {
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
                <span className="coach-tab-label"><span className="long">{label}</span><span className="short">{short}</span></span>
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
