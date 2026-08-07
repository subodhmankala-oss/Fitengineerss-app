import React, { useState, useMemo } from 'react';
import { isCardioExercise, isTimedExercise } from '../data/exerciseLibrary';

// Tapping an exercise's name in the logger (or trainer's live log) opens
// this bottom sheet — its full history for the active client, bucketed by
// Daily / Weekly / Monthly / Yearly. Reuses the Form Guide sheet's CSS
// classes (guide-sheet-*, guide-tab-*) so it matches that visual language
// without duplicating styles.

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

// `sessions` is the full sessions list (all clients); `clientName` scopes it
// down to the active profile, same filtering convention used elsewhere in
// WorkoutTracker (e.g. getPreviousSessionSet).
export default function ExerciseHistoryModal({ exerciseName, sessions, clientName, onClose }) {
  const [range, setRange] = useState('weekly');

  const exIsCardio = exerciseName ? isCardioExercise(exerciseName) : false;
  const exIsTimed = exerciseName ? isTimedExercise(exerciseName) : false;

  const entries = useMemo(() => {
    if (!exerciseName) return [];
    return (sessions || [])
      .filter(s => (s.clientName || '').toLowerCase() === (clientName || '').toLowerCase())
      .flatMap(s => {
        const ex = (s.exercises || []).find(e => e.name.toLowerCase() === exerciseName.toLowerCase());
        if (!ex || !ex.sets || ex.sets.length === 0) return [];
        const sets = ex.sets;
        let volume = 0;
        let best = 0;
        if (exIsCardio) {
          volume = sets.reduce((sum, st) => sum + (parseFloat(st.distanceKm) || 0), 0);
          best = volume;
        } else if (exIsTimed) {
          volume = sets.length;
          best = sets.length;
        } else {
          volume = sets.reduce((sum, st) => sum + (parseFloat(st.weight) || 0) * (parseInt(st.reps, 10) || 0), 0);
          best = sets.reduce((max, st) => Math.max(max, parseFloat(st.weight) || 0), 0);
        }
        return [{ date: s.date, volume, best }];
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [sessions, clientName, exerciseName, exIsCardio, exIsTimed]);

  const buckets = useMemo(() => {
    const map = new Map();
    entries.forEach(e => {
      const key = bucketKeyFor(e.date, range);
      if (!map.has(key)) {
        map.set(key, { key, volume: 0, best: 0, sessionCount: 0, latestDate: e.date });
      }
      const b = map.get(key);
      b.volume += e.volume;
      b.best = Math.max(b.best, e.best);
      b.sessionCount += 1;
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

  return (
    <div className="guide-sheet-backdrop" onClick={onClose}>
      <div className="guide-sheet ex-history-sheet animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="guide-sheet-handle" />

        <div className="ex-history-header">
          <h2 className="guide-ex-name">{exerciseName}</h2>
          <button type="button" className="ex-history-close-btn" onClick={onClose} title="Close">✕</button>
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
                {buckets.map(b => (
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
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
