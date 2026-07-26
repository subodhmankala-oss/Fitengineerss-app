import React, { useMemo, useState } from 'react';
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

const AnimatedStat = ({ value, label, sub, suffix = '' }) => {
  const animated = useCountUp(value);
  return (
    <div className="stat-card glass-panel">
      <span className="card-label">{label}</span>
      <strong className="card-value text-emerald">
        {Math.round(animated).toLocaleString('en-IN')}{suffix}
      </strong>
      <p className="card-sub">{sub}</p>
    </div>
  );
};

/**
 * Phase 1 of "Weekly Muscle Analytics": header stats + Section 1 (Muscle
 * Balance Overview cards). Reads the same `logs`/`weekDays`/`weeklyStats`
 * the parent's Weekly tab already computed — no extra data fetch.
 */
const WeeklyMuscleAnalytics = ({ logs, weekDays, weekRangeLabel, weeklyStats, weekOffset, setWeekOffset, weekNavBtnStyle }) => {
  const weekStartStr = weekDays[0];
  const weekEndStr = weekDays[6];
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  const [balanceTab, setBalanceTab] = useState('balance'); // 'balance' | 'neglected'
  const [insightsTab, setInsightsTab] = useState('insights'); // 'insights' | 'comparison' | 'recommendations'
  const [mapTab, setMapTab] = useState('heatmap'); // 'heatmap' | 'recovery'

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
      <div className="chart-widget-card glass-panel muscle-analytics-header">
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
          <AnimatedStat value={weeklyStats.workoutsCount} label="Total Workouts" sub="This week" />
          <AnimatedStat value={weeklyStats.totalSets} label="Total Sets" sub="This week" />
          <AnimatedStat value={weeklyStats.totalVolume} label="Total Volume" sub="kg lifted" suffix=" kg" />
          <AnimatedStat value={weeklyStats.workoutsCount} label="Training Days" sub="Active this week" />
        </div>
      </div>

      {/* ── Section 1 + Section 5, merged: Muscle Balance Overview and
          Neglected Muscles share one card via a left/right tab switcher
          (same toggle pattern as the heat map's Front/Back switch), instead
          of two separate stacked cards. Neglected Muscles reflects real
          "right now" status (last actual training date), not the browsed
          week, so it reads `logs` directly rather than `muscleStats`. ── */}
      <div className="chart-widget-card glass-panel">
        <div className="widget-header justify-between" style={{ marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
          <h4>{balanceTab === 'balance' ? '💪 Muscle Balance Overview' : '⚠️ Neglected Muscles'}</h4>
          <div className="heatmap-view-toggle">
            <button type="button" className={balanceTab === 'balance' ? 'active' : ''} onClick={() => setBalanceTab('balance')}>Balance</button>
            <button type="button" className={balanceTab === 'neglected' ? 'active' : ''} onClick={() => setBalanceTab('neglected')}>Neglected</button>
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
            <p className="muscle-analytics-subtext">Muscles with no training in 7+ days.</p>
            <NeglectedMuscles logs={logs} />
          </>
        )}
      </div>

      {/* ── Section 2 + Section 4, merged: Muscle Heat Map and Recovery
          Dashboard share one card via a tab switcher (same pattern as
          above). The heat map keeps its own inner Front/Back toggle — a
          second-level choice (which side of the body), not the same kind
          of switch as this outer Heat Map/Recovery tab. ── */}
      <div className="chart-widget-card glass-panel">
        <div className="widget-header justify-between" style={{ marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
          <h4>{mapTab === 'heatmap' ? '🗺️ Muscle Heat Map' : '🔋 Recovery Dashboard'}</h4>
          <div className="heatmap-view-toggle">
            <button type="button" className={mapTab === 'heatmap' ? 'active' : ''} onClick={() => setMapTab('heatmap')}>Map</button>
            <button type="button" className={mapTab === 'recovery' ? 'active' : ''} onClick={() => setMapTab('recovery')}>Recovery</button>
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
      <div className="chart-widget-card glass-panel">
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
