import React, { useState, useMemo } from 'react';
import { isCardioExercise, isTimedExercise, inferPrimary, inferCategory, EXERCISE_LIBRARY } from '../data/exerciseLibrary';

// Tapping an exercise's name in the logger (or trainer's live log) opens
// this bottom sheet — its full history for the active client, bucketed by
// Daily / Weekly / Monthly / Yearly, plus a training-status read (is this
// muscle being trained enough lately?) and alternate-exercise suggestions.
// Reuses the Form Guide sheet's CSS classes (guide-sheet-*, guide-tab-*) so
// it matches that visual language without duplicating styles.

const getExerciseUnit = (exName) => {
  if (exName.toLowerCase().includes('lat pull') || exName.toLowerCase().includes('plate')) {
    return 'plates';
  }
  return 'kg';
};

const RANGE_TABS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

// Monday-start week bucket key, as a YYYY-MM-DD date string.
function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function bucketKeyFor(dateStr, range) {
  if (range === 'daily') return dateStr;
  if (range === 'weekly') return startOfWeek(dateStr);
  if (range === 'monthly') return dateStr.slice(0, 7);
  return dateStr.slice(0, 4);
}

function formatBucketLabel(key, range) {
  if (range === 'daily') {
    return new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  if (range === 'weekly') {
    const start = new Date(`${key}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  if (range === 'monthly') {
    return new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return key;
}

function shortBucketTick(key, range) {
  if (range === 'daily') return new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric' });
  if (range === 'weekly') return new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (range === 'monthly') return new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short' });
  return key;
}

function daysAgo(dateStr) {
  const then = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((now - then) / 86400000);
}

function formatDaysAgo(n) {
  if (n <= 0) return 'Today';
  if (n === 1) return 'Yesterday';
  return `${n} days ago`;
}

// Training-status read: how consistently has this exercise been trained
// lately? Based on session frequency over the trailing 28 days, with a
// hard override to "Neglected" once it's been untouched for 3+ weeks
// regardless of how it was trained before that window.
function getTrainingStatus(entries) {
  if (!entries || entries.length === 0) {
    return { key: 'none', label: 'Not Yet Trained', icon: '⚪', tone: 'neutral', detail: 'No sessions logged for this exercise yet.' };
  }
  const gap = daysAgo(entries[0].date);
  const recent28 = entries.filter(e => daysAgo(e.date) <= 28);
  const perWeek = recent28.length / 4;

  if (gap > 21) {
    return { key: 'neglected', label: 'Neglected', icon: '🔴', tone: 'danger', detail: `Last trained ${formatDaysAgo(gap).toLowerCase()} — this needs to get back into rotation.` };
  }
  if (perWeek >= 1.75) {
    return { key: 'optimal', label: 'Optimally Trained', icon: '✅', tone: 'success', detail: `~${perWeek.toFixed(1)}x/week over the last 4 weeks — solid, consistent frequency.` };
  }
  if (perWeek >= 1) {
    return { key: 'low', label: 'Slightly Undertrained', icon: '🟡', tone: 'warning', detail: `~${perWeek.toFixed(1)}x/week over the last 4 weeks — a touch below the ~2x/week most muscle groups respond best to.` };
  }
  return { key: 'under', label: 'Undertrained', icon: '🟠', tone: 'orange', detail: `Only ~${perWeek.toFixed(1)}x/week over the last 4 weeks — this muscle group is falling behind.` };
}

// A handful of alternate exercises hitting the same primary muscle (falling
// back to the same broad category), so an undertrained/neglected read comes
// with an actual next step instead of just a diagnosis.
function getRecommendedExercises(exerciseName) {
  const primary = inferPrimary(exerciseName);
  const category = inferCategory(exerciseName);
  const isSelf = (e) => e.name.toLowerCase() === exerciseName.toLowerCase();

  const byPrimary = EXERCISE_LIBRARY.filter(e => !isSelf(e) && e.primary === primary);
  const byCategory = EXERCISE_LIBRARY.filter(e => !isSelf(e) && !byPrimary.includes(e) && e.category === category);

  return [...byPrimary, ...byCategory].slice(0, 4);
}

// Two data sources feed this, one per side of the app:
// - `sessions` (client's WorkoutTracker): session objects — { clientName,
//   date, exercises: [{ name, sets: [...] }] }. `clientName` scopes the
//   list down to the active profile, same filtering convention used
//   elsewhere in WorkoutTracker (e.g. getPreviousSessionSet).
// - `rawLogs` (coach's TrainerDashboard): flat per-set workout_logs rows —
//   { log_date, exercise_name, reps, weight_kg, distance_km?,
//   cardio_duration_seconds? } — already scoped to the selected client by
//   the caller (see rawWorkoutLogs in TrainerDashboard), so no clientName
//   filtering happens here for this shape.
// Only one of the two is ever passed by a given caller.
export default function ExerciseHistoryModal({ exerciseName, sessions, clientName, rawLogs, onClose }) {
  const [range, setRange] = useState('weekly');

  const exIsCardio = exerciseName ? isCardioExercise(exerciseName) : false;
  const exIsTimed = exerciseName ? isTimedExercise(exerciseName) : false;

  const entries = useMemo(() => {
    if (!exerciseName) return [];

    if (rawLogs) {
      const rowsByDate = new Map();
      rawLogs
        .filter(r => (r.exercise_name || '').toLowerCase() === exerciseName.toLowerCase())
        .forEach(r => {
          const date = r.log_date;
          if (!date) return;
          if (!rowsByDate.has(date)) rowsByDate.set(date, []);
          rowsByDate.get(date).push(r);
        });
      return Array.from(rowsByDate.entries())
        .map(([date, rows]) => {
          let volume = 0;
          let best = 0;
          let totalReps = 0;
          if (exIsCardio) {
            volume = rows.reduce((sum, r) => sum + (parseFloat(r.distance_km) || 0), 0);
            best = volume;
          } else if (exIsTimed) {
            volume = rows.length;
            best = rows.length;
          } else {
            volume = rows.reduce((sum, r) => sum + (parseFloat(r.weight_kg) || 0) * (parseInt(r.reps, 10) || 0), 0);
            best = rows.reduce((max, r) => Math.max(max, parseFloat(r.weight_kg) || 0), 0);
            totalReps = rows.reduce((sum, r) => sum + (parseInt(r.reps, 10) || 0), 0);
          }
          return { date, volume, best, setsCount: rows.length, totalReps };
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    return (sessions || [])
      .filter(s => (s.clientName || '').toLowerCase() === (clientName || '').toLowerCase())
      .flatMap(s => {
        const ex = (s.exercises || []).find(e => e.name.toLowerCase() === exerciseName.toLowerCase());
        if (!ex || !ex.sets || ex.sets.length === 0) return [];
        const sets = ex.sets;
        let volume = 0;
        let best = 0;
        let totalReps = 0;
        if (exIsCardio) {
          volume = sets.reduce((sum, st) => sum + (parseFloat(st.distanceKm) || 0), 0);
          best = volume;
        } else if (exIsTimed) {
          volume = sets.length;
          best = sets.length;
        } else {
          volume = sets.reduce((sum, st) => sum + (parseFloat(st.weight) || 0) * (parseInt(st.reps, 10) || 0), 0);
          best = sets.reduce((max, st) => Math.max(max, parseFloat(st.weight) || 0), 0);
          totalReps = sets.reduce((sum, st) => sum + (parseInt(st.reps, 10) || 0), 0);
        }
        return [{ date: s.date, volume, best, setsCount: sets.length, totalReps }];
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [sessions, clientName, rawLogs, exerciseName, exIsCardio, exIsTimed]);

  const buckets = useMemo(() => {
    const map = new Map();
    entries.forEach(e => {
      const key = bucketKeyFor(e.date, range);
      if (!map.has(key)) {
        map.set(key, { key, volume: 0, best: 0, sessionCount: 0, setsCount: 0, totalReps: 0, latestDate: e.date });
      }
      const b = map.get(key);
      b.volume += e.volume;
      b.best = Math.max(b.best, e.best);
      b.sessionCount += 1;
      b.setsCount += e.setsCount;
      b.totalReps += e.totalReps;
      if (new Date(e.date) > new Date(b.latestDate)) b.latestDate = e.date;
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.latestDate) - new Date(a.latestDate));
  }, [entries, range]);

  if (!exerciseName) return null;

  const chartBuckets = buckets.slice(0, 10).slice().reverse();
  const maxVolume = Math.max(...chartBuckets.map(b => b.volume), 1);
  const unit = getExerciseUnit(exerciseName);
  const bestLabel = exIsCardio ? 'Best distance' : exIsTimed ? 'Sessions logged' : 'Best weight';
  const volumeUnit = exIsCardio ? 'km' : unit;

  const allTimeBest = entries.reduce((max, e) => Math.max(max, e.best), 0);
  const totalSessions = entries.length;
  const status = getTrainingStatus(entries);
  const recommended = (status.key === 'neglected' || status.key === 'under' || status.key === 'low')
    ? getRecommendedExercises(exerciseName)
    : [];

  return (
    <div className="guide-sheet-backdrop" onClick={onClose}>
      <div className="guide-sheet ex-history-sheet animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="guide-sheet-handle" />

        <div className="ex-history-header">
          <h2 className="guide-ex-name">{exerciseName}</h2>
          <button type="button" className="ex-history-close-btn" onClick={onClose} title="Close">✕</button>
        </div>

        {entries.length > 0 && (
          <div className="ex-history-stats-row">
            <div className="ex-history-stat">
              <span className="ex-history-stat-label">🏆 All-Time Best</span>
              <span className="ex-history-stat-value">
                {exIsTimed ? `${allTimeBest} sets` : exIsCardio ? `${allTimeBest.toFixed(1)} km` : `${allTimeBest} ${unit}`}
              </span>
            </div>
            <div className="ex-history-stat">
              <span className="ex-history-stat-label">📅 Last Trained</span>
              <span className="ex-history-stat-value">{formatDaysAgo(daysAgo(entries[0].date))}</span>
            </div>
            <div className="ex-history-stat">
              <span className="ex-history-stat-label">🗂️ Sessions</span>
              <span className="ex-history-stat-value">{totalSessions}</span>
            </div>
          </div>
        )}

        <div className={`ex-history-status-card ex-history-status-card--${status.tone}`}>
          <span className="ex-history-status-icon">{status.icon}</span>
          <div>
            <div className="ex-history-status-label">{status.label}</div>
            <div className="ex-history-status-detail">{status.detail}</div>
          </div>
        </div>

        <div className="guide-tab-bar">
          {RANGE_TABS.map(t => (
            <button
              key={t.key}
              type="button"
              className={`guide-tab-btn ${range === t.key ? 'guide-tab-btn--active' : ''}`}
              onClick={() => setRange(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="guide-tab-content ex-history-content">
          {entries.length === 0 ? (
            <div className="ex-history-empty">
              <span className="ex-history-empty-icon">📭</span>
              <p>No logged history yet for this exercise.</p>
            </div>
          ) : (
            <>
              <div className="ex-history-chart">
                {chartBuckets.map(b => (
                  <div
                    key={b.key}
                    className="ex-history-bar-col"
                    title={`${formatBucketLabel(b.key, range)}: ${Math.round(b.volume).toLocaleString('en-IN')} ${volumeUnit}`}
                  >
                    <div className="ex-history-bar-track">
                      <div
                        className="ex-history-bar-fill"
                        style={{ height: `${Math.max((b.volume / maxVolume) * 100, 4)}%` }}
                      />
                    </div>
                    <span className="ex-history-bar-label">{shortBucketTick(b.key, range)}</span>
                  </div>
                ))}
              </div>

              <div className="ex-history-list">
                {buckets.map((b, idx) => {
                  const prev = buckets[idx + 1];
                  const delta = prev && prev.volume > 0 ? ((b.volume - prev.volume) / prev.volume) * 100 : null;
                  const avgReps = !exIsCardio && !exIsTimed && b.setsCount > 0 ? Math.round(b.totalReps / b.setsCount) : null;
                  return (
                    <div key={b.key} className="ex-history-row">
                      <div className="ex-history-row-main">
                        <span className="ex-history-row-date">{formatBucketLabel(b.key, range)}</span>
                        <span className="ex-history-row-sessions">{b.sessionCount} session{b.sessionCount === 1 ? '' : 's'}</span>
                      </div>
                      <div className="ex-history-row-stats">
                        <span>{bestLabel}: <strong>{exIsTimed ? b.best : `${exIsCardio ? b.best.toFixed(1) : b.best}${exIsCardio ? ' km' : ` ${unit}`}`}</strong></span>
                        {!exIsTimed && (
                          <span>Volume: <strong>{Math.round(b.volume).toLocaleString('en-IN')} {volumeUnit}</strong></span>
                        )}
                        {!exIsCardio && !exIsTimed && (
                          <span>Sets: <strong>{b.setsCount}</strong></span>
                        )}
                        {avgReps != null && (
                          <span>Avg reps: <strong>{avgReps}</strong></span>
                        )}
                        {delta != null && Math.abs(delta) >= 1 && (
                          <span className={`ex-history-delta ${delta > 0 ? 'ex-history-delta--up' : 'ex-history-delta--down'}`}>
                            {delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(delta))}% vs prior
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {recommended.length > 0 && (
            <div className="ex-history-recs">
              <div className="ex-history-recs-title">💡 Try these to balance it out</div>
              <p className="ex-history-recs-sub">
                {inferPrimary(exerciseName)} isn't getting enough work lately — these hit the same muscle group.
              </p>
              <div className="ex-history-recs-list">
                {recommended.map(rec => (
                  <div key={rec.name} className="ex-history-rec-chip">
                    <span className="ex-history-rec-name">{rec.name}</span>
                    <span className="ex-history-rec-cat">{rec.category}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
