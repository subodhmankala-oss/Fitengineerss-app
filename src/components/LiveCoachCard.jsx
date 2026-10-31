import React, { useMemo, useState } from 'react';
import { FullBodyThumbnail } from './MuscleAnalytics/MuscleThumbnail';
import { MUSCLE_BODY_VIEW, getMuscleGroupsForExercise } from '../utils/muscleGroups';
import { liveMuscleSummary, completedSetEntries } from '../utils/liveSessionStats';
import { coachInsight, coachStats, weekInsight, START_INSIGHT } from '../utils/liveCoach';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import './LiveSessionCards.css';
import './LiveCoachCard.css';

// Tag above the sentence: line icon (Tabler outline paths) + label per kind.
const KINDS = {
  start: { label: 'Your coach', d: 'M3 20l1.3-3.9C1.976 12.663 2.874 8.228 6.4 5.726c3.526-2.501 8.59-2.296 11.845.48 3.255 2.777 3.695 7.266 1.029 10.501C16.608 19.942 11.659 20.922 7.7 19L3 20' },
  tired: { label: 'Tired muscle', d: 'M6 7h11a2 2 0 0 1 2 2v.5a.5.5 0 0 0 .5.5.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5.5.5 0 0 0-.5.5v.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2M7 10v4' },
  recovery: { label: 'Still recovering', d: 'M19.5 13.572 12 21l-7.5-7.428A5 5 0 1 1 12 6.006a5 5 0 1 1 7.5 7.572M3 13h2l2 3 2-6 1 3h3' },
  best: { label: 'New best', d: 'M8 21h8M12 17v4M7 4h10M17 4v8a5 5 0 0 1-10 0V4M5 9a2 2 0 1 1 0-4h2M19 9a2 2 0 1 0 0-4h-2' },
  more: { label: 'Ready for more', d: 'M3 17l6-6 4 4 8-8M14 7h7v7' },
  strength: { label: 'Getting stronger', d: 'M13 3v7h6l-8 11v-7H5l8-11' },
  week: { label: 'This week', d: 'M11.5 21H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6M16 3v4M8 3v4M4 11h16M15 19l2 2 4-4' },
};

// Muscles worked today: one set → light green, two or more → full green;
// a muscle the coach called tired → amber.
const colorFor = (sets, tired) => (tired ? '#f59e0b' : sets >= 2 ? '#10b981' : '#6ee7b7');

const fmtSets = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

// The most recently ticked set (by tick time), or null.
const latestEntry = (entries) => entries.reduce((best, e) => (!best || (e[1].set.completedAt || 0) >= (best[1].set.completedAt || 0) ? e : best), null);

/**
 * Client logger's live card: the body heat map, and a coach that says one
 * plain sentence after every ticked set (tired reps, still recovering, new
 * best, time to go heavier, getting stronger, or the week's progress — see
 * utils/liveCoach.js), with three small numbers for that exercise underneath.
 *
 * `getPrevSet(exercise, setIdx)` returns last time's set (the PREV column) or null.
 */
const LiveCoachCard = ({ exercises, logDate, savedLogs, getPrevSet }) => {
  const summary = useMemo(() => liveMuscleSummary(savedLogs, exercises, logDate), [savedLogs, exercises, logDate]);

  const entries = completedSetEntries(exercises);
  const signature = entries.map(([key]) => key).join('|');

  const weekFor = (entry) => (entry ? weekInsight(savedLogs, exercises, logDate, entry[1].ex) : START_INSIGHT);

  // Sets already ticked when the logger opens (a restored draft) set the
  // scene quietly with the week count; nothing is "just ticked" yet.
  const [state, setState] = useState(() => {
    const latest = latestEntry(entries);
    return { seen: signature, message: weekFor(latest), said: [], tired: [], focus: latest ? latest[1].ex.name : null, flash: { muscle: null, key: 0 } };
  });

  // React's "adjust state when a prop changes" pattern: compare the ticked
  // sets with the last render's and react to the new tick, no effect pass.
  if (signature !== state.seen) {
    const before = new Set(state.seen ? state.seen.split('|') : []);
    const fresh = entries.filter(([key]) => !before.has(key));
    if (fresh.length > 0) {
      const { ex, set, setIdx } = fresh[fresh.length - 1][1];
      const message = coachInsight({
        exercise: ex, set, exercises, logDate, savedLogs,
        prevSet: getPrevSet ? getPrevSet(ex, setIdx) : null,
        said: new Set(state.said),
      });
      const muscle = getMuscleGroupsForExercise(ex.name)[0] || null;
      setState(s => ({
        seen: signature,
        message,
        said: ['recovery', 'more', 'strength'].includes(message.kind) ? [...s.said, `${message.kind}:${ex.name}`] : s.said,
        tired: message.kind === 'tired' && message.muscle && !s.tired.includes(message.muscle) ? [...s.tired, message.muscle] : s.tired,
        focus: ex.name,
        flash: muscle ? { muscle, key: s.flash.key + 1 } : s.flash,
      }));
    } else {
      // A set was unticked: back to the week count for whatever's still ticked.
      const latest = latestEntry(entries);
      setState(s => ({ ...s, seen: signature, message: weekFor(latest), focus: latest ? latest[1].ex.name : null }));
    }
  }

  const { message, tired, flash } = state;
  const focusExercise = (exercises || []).find(ex => ex.name === state.focus) || null;
  const stats = focusExercise ? coachStats({ exercise: focusExercise, exercises, logDate, savedLogs }) : null;

  const workedSets = Object.fromEntries(summary.worked.map(w => [w.muscle, w.sets]));
  const workedMuscles = [...new Set([...summary.worked.map(w => w.muscle), ...tired])];
  const kind = KINDS[message.kind] || KINDS.start;
  const pct = stats && stats.strengthPct != null ? stats.strengthPct : null;

  return (
    <div className="live-card live-coach" aria-live="polite">
      <div className="live-card-body-tile">
        {['front', 'back'].map(view => (
          <FullBodyThumbnail
            key={view}
            view={view}
            fullFigure
            width={50}
            height={104}
            trainedMuscles={workedMuscles}
            colorFor={m => colorFor(workedSets[m] || 0, tired.includes(m))}
            flashMuscle={MUSCLE_BODY_VIEW[flash.muscle] === view ? flash.muscle : null}
            flashKey={flash.key}
          />
        ))}
      </div>

      <div className="live-coach-main">
        <span className={`live-coach-tag is-${message.kind}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={kind.d} />
          </svg>
          {kind.label}
        </span>
        <p className="live-coach-say" key={message.text}>{message.text}</p>

        <div className="live-coach-stats">
          <div>
            <strong className={pct == null ? '' : pct > 0 ? 'is-up' : pct < 0 ? 'is-down' : ''}>
              {pct == null ? '—' : `${pct > 0 ? '+' : ''}${pct}%`}
            </strong>
            <span>vs last month</span>
          </div>
          <div>
            <strong>{stats ? `${fmtSets(stats.weekSets)} / ${stats.weekTarget}` : '—'}</strong>
            <span>{stats ? `${stats.muscle} this week` : 'This week'}</span>
          </div>
          <div>
            <strong className={stats && stats.recoveredPct < 80 ? 'is-low' : ''}>{stats ? `${stats.recoveredPct}%` : '—'}</strong>
            <span>{stats ? `${stats.muscle} rested` : 'Rested'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveCoachCard;
