import React, { useMemo, useState, useRef, useEffect } from 'react';
import MuscleCard from './MuscleCard';
import WeeklyInsights from './WeeklyInsights';
import ProgressComparison from './ProgressComparison';
import Recommendations from './Recommendations';
import RecoveryDashboard from './RecoveryDashboard';
import NeglectedMuscles from './NeglectedMuscles';
import MuscleHeatMap from './MuscleHeatMap';
import MuscleDetailModal from './MuscleDetailModal';
import {
  getWeeklyMuscleStats, getPPLCDistribution, generateWeeklyInsights,
  getRecommendations, compareWeeks, getAverageCompletion, classifyTrend, weeksInRange
} from '../../utils/muscleAnalytics';
import { subscribeCatalogMuscles, MUSCLE_GROUPS } from '../../utils/muscleGroups';
import { getRegionBreakdownForMuscle, hasRegions } from '../../utils/muscleRegions';
import databaseService from '../../services/databaseService';
import { shiftLocalDateString, getLocalDateString } from '../../utils/dateUtils';
import { useCountUp } from '../../hooks/useCountUp';
import './WeeklyMuscleAnalytics.css';

// Line icons for the stats strip (Tabler outline paths).
const STAT_ICONS = {
  volume: 'M2 12h1M6 8H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1zM9 12h6M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1zM18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M22 12h-1',
  sets: 'M12 4L4 8l8 4 8-4-8-4M4 12l8 4 8-4M4 16l8 4 8-4',
  workouts: 'M11.5 21H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6M16 3v4M8 3v4M4 11h16M15 19l2 2 4-4',
  kcal: 'M12 12c2-2.96 0-7-1-8 0 3.04-1.77 4.74-3 6-1.23 1.26-2 3.24-2 5a6 6 0 1 0 12 0c0-1.53-1.06-3.94-2-5-1.79 3-2.79 3-4 2z',
};

// One cell of the header's stats strip: number on top, a tinted icon + unit
// below. Each stat keeps its own colour (--stat-color) so the four read apart.
const AnimatedStat = ({ value, label, icon, color }) => {
  const animated = useCountUp(value);
  return (
    <div className="ma-stat" style={{ '--stat-color': color }}>
      <strong>{Math.round(animated).toLocaleString('en-IN')}</strong>
      <span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={STAT_ICONS[icon]} />
        </svg>
        {label}
      </span>
    </div>
  );
};

const Chevron = ({ dir }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
  </svg>
);

// Share icon (iOS-style "share out") — sits next to a section's tab toggle
// so a coach can send that client's live view as a WhatsApp deep link. Only
// rendered when the parent passes the matching `onShareBalance`/
// `onShareHeatMap` handler (coach view of a specific client); the client's
// own dashboard has nobody to share it with.
const ShareIconButton = ({ onClick, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={title}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '26px',
      height: '26px',
      borderRadius: '50%',
      background: 'rgba(var(--fg-rgb), 0.06)',
      border: '1px solid rgba(var(--fg-rgb), 0.1)',
      color: 'var(--text-muted)',
      cursor: 'pointer',
      flexShrink: 0
    }}
  >
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v13" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  </button>
);

// First/last day (YYYY-MM-DD) of the calendar month `offset` months from now.
const monthBounds = (offset) => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return [getLocalDateString(first), getLocalDateString(last), first];
};

const PERIOD_KEY = 'muscleAnalyticsPeriod';

/**
 * Phase 1 of "Weekly Muscle Analytics": header stats + Section 1 (Muscle
 * Balance Overview cards). Reads the same `logs`/`weekDays`/`weeklyStats`
 * the parent's Weekly tab already computed — no extra data fetch.
 *
 * Week/Month toggle (shown when the parent passes setMonthOffset +
 * monthlyStats): a month is judged by its average sets per week against the
 * same weekly targets, so colours and statuses mean the same in both views.
 * Month navigation shares the parent's Monthly tab offset.
 */
const WeeklyMuscleAnalytics = ({ logs, weekDays, weekRangeLabel, weeklyStats, weekOffset, setWeekOffset, monthOffset = 0, setMonthOffset = null, monthlyStats = null, bareCards = false, onShareBalance = null, onShareHeatMap = null, focusSection = null, onAddExercise = null, onRemoveExercise = null, addedNames = [], addedCount = null, onGoToWorkout = null, addTargetLabel = null }) => {
  const canMonth = !!(setMonthOffset && monthlyStats);
  const [periodPref, setPeriodPref] = useState(() => {
    try { return localStorage.getItem(PERIOD_KEY) === 'month' ? 'month' : 'week'; } catch { return 'week'; }
  });
  const period = canMonth ? periodPref : 'week';
  const isMonth = period === 'month';
  const choosePeriod = (p) => {
    setPeriodPref(p);
    try { localStorage.setItem(PERIOD_KEY, p); } catch { /* private mode: just not remembered */ }
  };
  const [monthStartStr, monthEndStr, monthDate] = useMemo(() => monthBounds(monthOffset), [monthOffset]);
  const [prevMonthStartStr, prevMonthEndStr] = useMemo(() => monthBounds(monthOffset - 1), [monthOffset]);
  const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  // The Week/Month tab already says which period, so the range shows real
  // dates ("Oct 21 – 27") rather than "This week".
  const weekDatesLabel = (() => {
    const ws = new Date(`${weekDays[0]}T12:00:00`);
    const we = new Date(`${weekDays[6]}T12:00:00`);
    const sameMonth = ws.getMonth() === we.getMonth();
    return `${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString('en-US', sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;
  })();

  const rangeStartStr = isMonth ? monthStartStr : weekDays[0];
  const rangeEndStr = isMonth ? monthEndStr : weekDays[6];
  const weeks = isMonth ? weeksInRange(monthStartStr, monthEndStr) : 1;
  const headerStats = isMonth ? monthlyStats : weeklyStats;

  // The detail sheet's advice ("N more sets to hit your weekly target") is
  // about a week, so a month opens it on that month's last 7 days (the
  // default rolling 7 days for the current month).
  const todayStr = getLocalDateString();
  const detailEnd = isMonth ? (monthEndStr < todayStr ? monthEndStr : null) : weekDays[6];
  const detailStart = isMonth ? (detailEnd ? shiftLocalDateString(detailEnd, -6) : null) : weekDays[0];
  // bareCards: coach view drops every card's border/background/padding on
  // this tab — the coach's client detail screen already sits in its own
  // bordered panel, so every chart-widget-card here doubled up. Client view
  // keeps the normal bordered cards since it has no such ancestor panel.
  const cardClass = (extra = '') =>
    `${bareCards ? 'muscle-analytics-bare-card' : 'chart-widget-card glass-panel'}${extra ? ` ${extra}` : ''}`;
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  // Which part of the muscle was tapped on the body diagram (e.g. Back →
  // Rotator Cuff); the detail screen highlights it. Null from a card/chip tap.
  const [selectedRegion, setSelectedRegion] = useState(null);
  const selectMuscle = (muscle, region = null) => { setSelectedMuscle(muscle); setSelectedRegion(region); };
  const [balanceTab, setBalanceTab] = useState('balance'); // 'balance' | 'neglected'
  const [insightsTab, setInsightsTab] = useState('insights'); // 'insights' | 'comparison' | 'recommendations'
  const [mapTab, setMapTab] = useState('heatmap'); // 'heatmap' | 'recovery'

  // focusSection: 'balance' | 'heatmap' — which card to scroll straight to
  // (see shareMuscleMapWithClient in TrainerDashboard.jsx / the &section=
  // deep link param in App.jsx). Landing on the Muscles tab alone still left
  // the client looking at this header + stats above whichever card was
  // actually shared; Heat Map in particular is the SECOND card down, easy
  // to miss without scrolling. Both card refs are always attached — which
  // one (if either) gets used just depends on focusSection.
  const balanceCardRef = useRef(null);
  const heatMapCardRef = useRef(null);
  useEffect(() => {
    if (!focusSection) return undefined;
    // One scroll a tick after mount used to land short ("stays half there"):
    // the logs, the balance cards above and their count-up animations keep
    // growing the page for a second or two AFTER that scroll, pushing the
    // target back down. So: one smooth scroll, then keep re-aligning the
    // target to the top of the scroll container (.main-content) until it
    // holds still, for up to ~3 s — and stop the moment the client touches
    // or scrolls themselves.
    let stopped = false;
    const timers = [];
    const stop = () => { stopped = true; };
    let container = null;
    const align = (behavior) => {
      const target = focusSection === 'heatmap' ? heatMapCardRef.current : balanceCardRef.current;
      if (!target) return 0;
      container = container || target.closest('.main-content') || document.scrollingElement;
      const containerTop = container === document.scrollingElement ? 0 : container.getBoundingClientRect().top;
      const offset = target.getBoundingClientRect().top - containerTop;
      const maxScroll = container.scrollHeight - container.clientHeight;
      const next = Math.max(0, Math.min(maxScroll, container.scrollTop + offset));
      if (Math.abs(next - container.scrollTop) > 4) container.scrollTo({ top: next, behavior });
      return Math.abs(next - container.scrollTop);
    };
    timers.push(setTimeout(() => {
      align('smooth');
      ['touchstart', 'wheel', 'pointerdown', 'keydown'].forEach(ev => container?.addEventListener(ev, stop, { passive: true, once: true }));
    }, 150));
    // Corrections, after the smooth scroll has had time to finish.
    [800, 1300, 1900, 2600, 3300].forEach(ms => timers.push(setTimeout(() => { if (!stopped) align('instant'); }, ms)));
    return () => {
      timers.forEach(clearTimeout);
      ['touchstart', 'wheel', 'pointerdown', 'keydown'].forEach(ev => container?.removeEventListener(ev, stop));
    };
    // Intentionally once-only, on mount — this only ever exists to honor a
    // deep link's initial destination, not to re-scroll on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The exercise catalog's Primary Muscle text feeds the muscle mapping for
  // exercises no name rule recognises (see muscleGroups.setCatalogMuscles).
  // It loads async, so make sure it's loaded and recompute once it lands.
  const [catalogVersion, setCatalogVersion] = useState(0);
  useEffect(() => {
    const unsub = subscribeCatalogMuscles(() => setCatalogVersion(v => v + 1));
    databaseService.getExerciseLibrary().catch(() => {});
    return unsub;
  }, []);

  const muscleStats = useMemo(
    () => {
      void catalogVersion; // recompute when the catalog mapping changes
      return getWeeklyMuscleStats(logs, rangeStartStr, rangeEndStr, { weeks });
    },
    [logs, rangeStartStr, rangeEndStr, weeks, catalogVersion]
  );

  const neglectedCount = muscleStats.filter(m => m.status.key === 'neglected').length;

  // Heat map draws every muscle that has parts (Back: Lats / Trapezius / Mid
  // Back…, Glutes: Max / Med…) as those parts, each in its own color — the
  // same parts as the muscle detail screen; see BodyDiagram's regionSplit.
  const regionSplit = useMemo(() => {
    void catalogVersion;
    return Object.fromEntries(MUSCLE_GROUPS.filter(hasRegions).map(m => {
      const parts = getRegionBreakdownForMuscle(logs, m, rangeStartStr, rangeEndStr, { weeks }).filter(r => r.tier);
      return [m, Object.fromEntries(parts.map(r => [r.id, r.tier]))];
    }));
  }, [logs, rangeStartStr, rangeEndStr, weeks, catalogVersion]);

  const pplc = useMemo(() => getPPLCDistribution(muscleStats), [muscleStats]);
  const insights = useMemo(() => generateWeeklyInsights(muscleStats, pplc, 5, period), [muscleStats, pplc, period]);
  const recommendations = useMemo(() => getRecommendations(muscleStats, 5, period), [muscleStats, period]);

  // The window immediately before this one (previous 7 days, or previous
  // calendar month) — used for Section 7 (Progress Comparison).
  const prevStartStr = isMonth ? prevMonthStartStr : shiftLocalDateString(weekDays[0], -7);
  const prevEndStr = isMonth ? prevMonthEndStr : shiftLocalDateString(weekDays[6], -7);

  const comparison = useMemo(
    () => {
      void catalogVersion;
      return compareWeeks(logs, rangeStartStr, rangeEndStr, prevStartStr, prevEndStr);
    },
    [logs, rangeStartStr, rangeEndStr, prevStartStr, prevEndStr, catalogVersion]
  );

  const balanceTrend = useMemo(() => {
    const prevWeeks = isMonth ? weeksInRange(prevStartStr, prevEndStr) : 1;
    const prevMuscleStats = getWeeklyMuscleStats(logs, prevStartStr, prevEndStr, { weeks: prevWeeks });
    const curr = getAverageCompletion(muscleStats);
    const prev = getAverageCompletion(prevMuscleStats);
    return { curr, prev, trend: classifyTrend(curr, prev), pctChange: prev === 0 ? null : Math.round(((curr - prev) / prev) * 100) };
  }, [logs, muscleStats, isMonth, prevStartStr, prevEndStr]);

  const heatMapLabel = isMonth
    ? (muscle) => {
      const stat = muscleStats.find(m => m.muscle === muscle);
      return `${muscle}: ${stat ? stat.status.label : 'Not Trained'}, ${stat?.sets ?? 0} sets a week on average this month`;
    }
    : undefined;

  // Exercises picked from the muscle sheets. The client's queue is already
  // only picks; the coach's addedNames is the whole Live Log, so remember
  // which ones were added from here.
  const [localPicked, setLocalPicked] = useState([]);
  const trackAdd = (name) => { onAddExercise(name); setLocalPicked(p => (p.includes(name) ? p : [...p, name])); };
  const trackRemove = (name) => { onRemoveExercise?.(name); setLocalPicked(p => p.filter(n => n !== name)); };
  const picked = !onAddExercise ? [] : addedCount != null
    ? addedNames
    : localPicked.filter(n => addedNames.some(a => a.toLowerCase() === n.toLowerCase()));
  const target = addTargetLabel || 'your workout';
  const pickedStrip = picked.length > 0 && onGoToWorkout && (
    <div className="muscle-queued-strip" style={{ margin: '8px 0 12px' }}>
      <div className="muscle-queued-head">
        <span className="muscle-queued-title">✅ Added exercises ({picked.length})</span>
        {onRemoveExercise && (
          <button type="button" className="muscle-queued-clear" onClick={() => picked.forEach(trackRemove)}>Clear all</button>
        )}
      </div>
      <div className="muscle-queued-chips">
        {picked.map(name => (
          <span key={name} className="muscle-queued-chip">
            {name}
            {onRemoveExercise && <button type="button" aria-label={`Remove ${name}`} onClick={() => trackRemove(name)}>✕</button>}
          </span>
        ))}
      </div>
      <button type="button" className="detail-region-go" onClick={onGoToWorkout}>
        Add {picked.length} exercise{picked.length === 1 ? '' : 's'} to {target} →
      </button>
    </div>
  );

  return (
    <div className="muscle-analytics-root timeframe-content flex-col gap-4">
      {/* ── Header: Week | Month text tabs, the range with ‹ › on the right,
          and a slim stats strip. ── */}
      <div className={cardClass('muscle-analytics-header ma-section')}>
        {/* Title + Week/Month chips share a row; the range gets its own
            full-width row (‹ at one end, › at the other) below. */}
        <div className="widget-header justify-between" style={{ gap: '8px' }}>
          <h4>Muscle Analytics</h4>
          {canMonth && (
            <div className="ma-chips" role="tablist">
              {[['week', 'Week', 'var(--tint-blue)'], ['month', 'Month', 'var(--tint-violet)']].map(([key, label, color]) => (
                <button key={key} type="button" role="tab" aria-selected={period === key} className={period === key ? 'active' : ''} style={{ '--pill-color': color }} onClick={() => choosePeriod(key)}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ma-period-row">
          <div className="ma-range-nav">
            {isMonth ? (
              <>
                <button type="button" title="Previous month" aria-label="Previous month" onClick={() => setMonthOffset(monthOffset - 1)}><Chevron dir="left" /></button>
                <span>{monthLabel}</span>
                <button type="button" title={monthOffset >= 0 ? 'Already on the current month' : 'Next month'} aria-label="Next month" onClick={() => setMonthOffset(Math.min(0, monthOffset + 1))} disabled={monthOffset >= 0}><Chevron dir="right" /></button>
              </>
            ) : (
              <>
                <button type="button" title="Previous week" aria-label="Previous week" onClick={() => setWeekOffset(w => w - 1)}><Chevron dir="left" /></button>
                <span title={weekRangeLabel}>{weekDatesLabel}</span>
                <button type="button" title={weekOffset >= 0 ? 'Already on the current week' : 'Next week'} aria-label="Next week" onClick={() => setWeekOffset(w => Math.min(0, w + 1))} disabled={weekOffset >= 0}><Chevron dir="right" /></button>
              </>
            )}
          </div>
        </div>

        <div className="ma-stats-strip">
          <AnimatedStat value={headerStats.totalVolume} label="kg" icon="volume" color="var(--tint-violet)" />
          <AnimatedStat value={headerStats.totalSets} label="sets" icon="sets" color="var(--tint-blue)" />
          <AnimatedStat value={headerStats.workoutsCount} label={headerStats.workoutsCount === 1 ? 'workout' : 'workouts'} icon="workouts" color="var(--tint-amber)" />
          <AnimatedStat value={headerStats.totalCalories} label="kcal" icon="kcal" color="var(--tint-orange)" />
        </div>
      </div>

      {/* ── Section 1 + Section 5, merged: Muscle Balance Overview and
          Neglected Muscles share one card: a "N neglected" link by the
          heading opens the list (only shown when something is neglected),
          "‹ Balance" goes back. Neglected Muscles reflects real
          "right now" status (last actual training date), not the browsed
          week, so it reads `logs` directly rather than `muscleStats`. ── */}
      <div className={cardClass('ma-section')} ref={balanceCardRef}>
        <div className="widget-header justify-between" style={{ marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
          <h4>{balanceTab === 'balance' ? 'Muscle Balance' : 'Neglected Muscles'}</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {balanceTab === 'neglected' ? (
              <button type="button" className="ma-link" onClick={() => setBalanceTab('balance')}><Chevron dir="left" /> Balance</button>
            ) : neglectedCount > 0 && (
              <button type="button" className="ma-link ma-pill ma-link-warn" onClick={() => setBalanceTab('neglected')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                </svg>
                {neglectedCount} neglected
              </button>
            )}
            {onShareBalance && <ShareIconButton onClick={onShareBalance} title="Share this client's Muscle Balance Overview" />}
          </div>
        </div>
        {balanceTab === 'balance' ? (
          <>
            <p className="muscle-analytics-subtext">
              {isMonth
                ? 'Average working sets per week this month, per muscle group, measured against your weekly target.'
                : 'Working sets per muscle group, measured against your weekly target.'}
            </p>
            {pickedStrip}
            <div className="muscle-card-grid">
              {muscleStats.map((stat, i) => (
                <MuscleCard key={stat.muscle} stat={stat} index={i} period={period} onClick={() => selectMuscle(stat.muscle)} />
              ))}
            </div>
            <div className="muscle-status-legend">
              <span className="legend-item"><span className="legend-dot status-optimal" />Optimal</span>
              <span className="legend-item"><span className="legend-dot status-slightly-low" />Slightly Low</span>
              <span className="legend-item"><span className="legend-dot status-undertrained" />Undertrained</span>
              <span className="legend-item"><span className="legend-dot status-neglected" />Neglected</span>
              <span className="legend-item"><span className="legend-dot status-high-volume" />High Volume</span>
            </div>
          </>
        ) : (
          <>
            <p className="muscle-analytics-subtext">Muscles with zero sets logged this {period}.</p>
            <NeglectedMuscles logs={logs} weeklyMuscleStats={muscleStats} period={period} />
          </>
        )}
      </div>

      {/* ── Section 2 + Section 4, merged: Muscle Heat Map and Recovery
          Dashboard share one card via a tab switcher (same pattern as
          above). The heat map keeps its own inner Front/Back toggle — a
          second-level choice (which side of the body), not the same kind
          of switch as this outer Heat Map/Recovery tab. ── */}
      <div className={cardClass('ma-section')} ref={heatMapCardRef}>
        <div className="widget-header justify-between" style={{ marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
          <h4>{mapTab === 'heatmap' ? 'Muscle Heat Map' : 'Recovery'}</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Same pill as "N neglected": names the other view, tap to switch. */}
            {mapTab === 'heatmap' ? (
              <button type="button" className="ma-link ma-pill ma-link-view" onClick={() => setMapTab('recovery')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 7h11a2 2 0 0 1 2 2v.5a.5.5 0 0 0 .5.5.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5.5.5 0 0 0-.5.5v.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2" /><path d="M7 10v4" /><path d="M10 10v4" />
                </svg>
                Recovery
              </button>
            ) : (
              <button type="button" className="ma-link ma-pill ma-link-view" onClick={() => setMapTab('heatmap')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7" /><path d="M9 4v13" /><path d="M15 7v13" />
                </svg>
                Heat Map
              </button>
            )}
            {onShareHeatMap && <ShareIconButton onClick={onShareHeatMap} title="Share this client's Muscle Heat Map" />}
          </div>
        </div>
        {mapTab === 'heatmap' && pickedStrip}
        {mapTab === 'heatmap' ? (
          <MuscleHeatMap muscleStats={muscleStats} onSelectMuscle={selectMuscle} activeMuscle={selectedMuscle} regionSplit={regionSplit} labelFor={heatMapLabel} />
        ) : (
          <RecoveryDashboard logs={logs} />
        )}
      </div>

      {/* ── Section 6 + 7 + 8, merged: Weekly Insights, Progress Comparison,
          and Personal Recommendations share one card via a 3-way tab
          switcher (same toggle pattern used above), instead of three
          separate stacked cards. ── */}
      <div className={cardClass('ma-section')}>
        <div className="widget-header justify-between" style={{ marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <h4>Insights</h4>
          {/* Chips, each its own tint, selected = tint + ring. */}
          <div className="ma-chips" role="tablist">
            {[['insights', 'Summary', 'var(--tint-blue)'], ['comparison', 'Compare', 'var(--tint-violet)'], ['recommendations', 'Tips', '#10b981']].map(([key, label, color]) => (
              <button key={key} type="button" role="tab" aria-selected={insightsTab === key} className={insightsTab === key ? 'active' : ''} style={{ '--pill-color': color }} onClick={() => setInsightsTab(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {insightsTab === 'insights' && <WeeklyInsights insights={insights} period={period} />}
        {insightsTab === 'comparison' && <ProgressComparison comparison={comparison} balanceTrend={balanceTrend} prevLabel={isMonth ? 'last month' : 'last week'} />}
        {insightsTab === 'recommendations' && <Recommendations recommendations={recommendations} />}
      </div>

      {/* ── Section 9: Muscle Detail Screen — opened by tapping a Section 1
          card or a Section 2 heat map region. Fixed-position overlay, so it
          renders outside the scrolling content but still within this
          component's own subtree. ── */}
      {selectedMuscle && (
        <MuscleDetailModal muscle={selectedMuscle} focusRegion={selectedRegion} weekStart={detailStart} weekEnd={detailEnd} logs={logs} onClose={() => selectMuscle(null)} onAddExercise={onAddExercise ? trackAdd : null} onRemoveExercise={onRemoveExercise ? trackRemove : null} addedNames={addedNames} addedCount={picked.length} onGoToWorkout={onGoToWorkout} addTargetLabel={addTargetLabel} />
      )}
    </div>
  );
};

export default WeeklyMuscleAnalytics;
