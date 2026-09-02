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
  getRecommendations, compareWeeks, getAverageCompletion, classifyTrend
} from '../../utils/muscleAnalytics';
import { shiftLocalDateString } from '../../utils/dateUtils';
import { useCountUp } from '../../hooks/useCountUp';
import './WeeklyMuscleAnalytics.css';

// Inline pill style — label left, value right, one line per card — matching
// the Daily tab's stat cards (.stat-card.inline) rather than the stacked
// glass-panel look used elsewhere on this page.
const AnimatedStat = ({ value, label, valueClass = 'text-emerald', suffix = '' }) => {
  const animated = useCountUp(value);
  return (
    <div className="stat-card inline">
      <span className="lbl">{label}:</span>
      <strong className={`val ${valueClass}`}>
        {Math.round(animated).toLocaleString('en-IN')}{suffix}
      </strong>
    </div>
  );
};

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
      background: 'rgba(255, 255, 255, 0.06)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
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

/**
 * Phase 1 of "Weekly Muscle Analytics": header stats + Section 1 (Muscle
 * Balance Overview cards). Reads the same `logs`/`weekDays`/`weeklyStats`
 * the parent's Weekly tab already computed — no extra data fetch.
 */
const WeeklyMuscleAnalytics = ({ logs, weekDays, weekRangeLabel, weeklyStats, weekOffset, setWeekOffset, weekNavBtnStyle, bareCards = false, onShareBalance = null, onShareHeatMap = null, focusSection = null }) => {
  const weekStartStr = weekDays[0];
  // bareCards: coach view drops every card's border/background/padding on
  // this tab — the coach's client detail screen already sits in its own
  // bordered panel, so every chart-widget-card here doubled up. Client view
  // keeps the normal bordered cards since it has no such ancestor panel.
  const cardClass = (extra = '') =>
    `${bareCards ? 'muscle-analytics-bare-card' : 'chart-widget-card glass-panel'}${extra ? ` ${extra}` : ''}`;
  const weekEndStr = weekDays[6];
  const [selectedMuscle, setSelectedMuscle] = useState(null);
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
    // Deferred a tick: on mount, the heat map's own SVG/animated stat counts
    // are still settling into their final layout, and scrolling immediately
    // measures against that not-yet-final geometry — landing short (or
    // scrolling again after animations shift it below the fold anyway).
    const t = setTimeout(() => {
      const target = focusSection === 'heatmap' ? heatMapCardRef.current : balanceCardRef.current;
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => clearTimeout(t);
    // Intentionally once-only, on mount — this only ever exists to honor a
    // deep link's initial destination, not to re-scroll on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const muscleStats = useMemo(
    () => getWeeklyMuscleStats(logs, weekStartStr, weekEndStr),
    [logs, weekStartStr, weekEndStr]
  );

  const pplc = useMemo(() => getPPLCDistribution(muscleStats), [muscleStats]);
  const insights = useMemo(() => generateWeeklyInsights(muscleStats, pplc), [muscleStats, pplc]);
  const recommendations = useMemo(() => getRecommendations(muscleStats), [muscleStats]);

  // Previous 7-day window, immediately preceding this one — used for
  // Section 7 (Progress Comparison).
  const prevWeekStartStr = useMemo(() => shiftLocalDateString(weekStartStr, -7), [weekStartStr]);
  const prevWeekEndStr = useMemo(() => shiftLocalDateString(weekEndStr, -7), [weekEndStr]);

  const comparison = useMemo(
    () => compareWeeks(logs, weekStartStr, weekEndStr, prevWeekStartStr, prevWeekEndStr),
    [logs, weekStartStr, weekEndStr, prevWeekStartStr, prevWeekEndStr]
  );

  const balanceTrend = useMemo(() => {
    const prevMuscleStats = getWeeklyMuscleStats(logs, prevWeekStartStr, prevWeekEndStr);
    const curr = getAverageCompletion(muscleStats);
    const prev = getAverageCompletion(prevMuscleStats);
    return { curr, prev, trend: classifyTrend(curr, prev), pctChange: prev === 0 ? null : Math.round(((curr - prev) / prev) * 100) };
  }, [logs, muscleStats, prevWeekStartStr, prevWeekEndStr]);

  return (
    <div className="muscle-analytics-root timeframe-content flex-col gap-4">
      {/* ── Header: week range + top-line stats ── */}
      <div className={cardClass('muscle-analytics-header')}>
        <div className="widget-header justify-between">
          <h4>🧠 Weekly Muscle Analytics</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button type="button" title="Previous week" onClick={() => setWeekOffset(w => w - 1)} style={weekNavBtnStyle}>‹</button>
            <span className="trend-badge" style={{ minWidth: '86px', textAlign: 'center' }}>{weekRangeLabel}</span>
            <button
              type="button"
              title={weekOffset >= 0 ? 'Already on the current week' : 'Next week'}
              onClick={() => setWeekOffset(w => Math.min(0, w + 1))}
              disabled={weekOffset >= 0}
              style={{ ...weekNavBtnStyle, opacity: weekOffset >= 0 ? 0.35 : 1, cursor: weekOffset >= 0 ? 'default' : 'pointer' }}
            >
              ›
            </button>
          </div>
        </div>

        <div className="stats-row-cards mini" style={{ marginTop: '10px' }}>
          <AnimatedStat value={weeklyStats.totalVolume} label="Volume" valueClass="text-emerald" suffix=" kg" />
          <AnimatedStat value={weeklyStats.totalSets} label="Sets" valueClass="text-blue" suffix=" sets" />
          <AnimatedStat value={weeklyStats.workoutsCount} label="Workouts" valueClass="text-amber" />
          <AnimatedStat value={weeklyStats.totalCalories} label="Calories" valueClass="text-amber" suffix=" kcal" />
        </div>
      </div>

      {/* ── Section 1 + Section 5, merged: Muscle Balance Overview and
          Neglected Muscles share one card via a left/right tab switcher
          (same toggle pattern as the heat map's Front/Back switch), instead
          of two separate stacked cards. Neglected Muscles reflects real
          "right now" status (last actual training date), not the browsed
          week, so it reads `logs` directly rather than `muscleStats`. ── */}
      <div className={cardClass()} ref={balanceCardRef}>
        <div className="widget-header justify-between" style={{ marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
          <h4>{balanceTab === 'balance' ? '💪 Muscle Balance Overview' : '⚠️ Neglected Muscles'}</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="heatmap-view-toggle">
              <button type="button" className={balanceTab === 'balance' ? 'active' : ''} onClick={() => setBalanceTab('balance')}>Balance</button>
              <button type="button" className={balanceTab === 'neglected' ? 'active' : ''} onClick={() => setBalanceTab('neglected')}>Neglected</button>
            </div>
            {onShareBalance && <ShareIconButton onClick={onShareBalance} title="Share this client's Muscle Balance Overview" />}
          </div>
        </div>

        {balanceTab === 'balance' ? (
          <>
            <p className="muscle-analytics-subtext">Working sets per muscle group, measured against your weekly target.</p>
            <div className="muscle-card-grid">
              {muscleStats.map((stat, i) => (
                <MuscleCard key={stat.muscle} stat={stat} index={i} onClick={() => setSelectedMuscle(stat.muscle)} />
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
            <p className="muscle-analytics-subtext">Muscles with zero sets logged this week.</p>
            <NeglectedMuscles logs={logs} weeklyMuscleStats={muscleStats} />
          </>
        )}
      </div>

      {/* ── Section 2 + Section 4, merged: Muscle Heat Map and Recovery
          Dashboard share one card via a tab switcher (same pattern as
          above). The heat map keeps its own inner Front/Back toggle — a
          second-level choice (which side of the body), not the same kind
          of switch as this outer Heat Map/Recovery tab. ── */}
      <div className={cardClass()} ref={heatMapCardRef}>
        <div className="widget-header justify-between" style={{ marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
          <h4>{mapTab === 'heatmap' ? '🗺️ Muscle Heat Map' : '🔋 Recovery Dashboard'}</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="heatmap-view-toggle">
              <button type="button" className={mapTab === 'heatmap' ? 'active' : ''} onClick={() => setMapTab('heatmap')}>Map</button>
              <button type="button" className={mapTab === 'recovery' ? 'active' : ''} onClick={() => setMapTab('recovery')}>Recovery</button>
            </div>
            {onShareHeatMap && <ShareIconButton onClick={onShareHeatMap} title="Share this client's Muscle Heat Map" />}
          </div>
        </div>

        {mapTab === 'heatmap' ? (
          <MuscleHeatMap muscleStats={muscleStats} onSelectMuscle={setSelectedMuscle} activeMuscle={selectedMuscle} />
        ) : (
          <RecoveryDashboard logs={logs} />
        )}
      </div>

      {/* ── Section 6 + 7 + 8, merged: Weekly Insights, Progress Comparison,
          and Personal Recommendations share one card via a 3-way tab
          switcher (same toggle pattern used above), instead of three
          separate stacked cards. ── */}
      <div className={cardClass()}>
        <div className="widget-header justify-between" style={{ marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <h4>
            {insightsTab === 'insights' && '💡 Weekly Insights'}
            {insightsTab === 'comparison' && '📊 Progress Comparison'}
            {insightsTab === 'recommendations' && '🎯 Personal Recommendations'}
          </h4>
          <div className="heatmap-view-toggle">
            <button type="button" className={insightsTab === 'insights' ? 'active' : ''} onClick={() => setInsightsTab('insights')}>Insights</button>
            <button type="button" className={insightsTab === 'comparison' ? 'active' : ''} onClick={() => setInsightsTab('comparison')}>Compare</button>
            <button type="button" className={insightsTab === 'recommendations' ? 'active' : ''} onClick={() => setInsightsTab('recommendations')}>Tips</button>
          </div>
        </div>

        {insightsTab === 'insights' && <WeeklyInsights insights={insights} />}
        {insightsTab === 'comparison' && <ProgressComparison comparison={comparison} balanceTrend={balanceTrend} />}
        {insightsTab === 'recommendations' && <Recommendations recommendations={recommendations} />}
      </div>

      {/* ── Section 9: Muscle Detail Screen — opened by tapping a Section 1
          card or a Section 2 heat map region. Fixed-position overlay, so it
          renders outside the scrolling content but still within this
          component's own subtree. ── */}
      {selectedMuscle && (
        <MuscleDetailModal muscle={selectedMuscle} logs={logs} onClose={() => setSelectedMuscle(null)} />
      )}
    </div>
  );
};

export default WeeklyMuscleAnalytics;
