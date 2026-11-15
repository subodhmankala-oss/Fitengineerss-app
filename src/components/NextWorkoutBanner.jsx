import React, { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import { determineWorkoutGuidance } from '../utils/beginnerGuidance';
import { startLibraryProgram } from '../utils/startLibraryProgram';
import FirstWorkoutPicker from './FirstWorkoutPicker';
import { buildWarmupExercises } from '../utils/warmupBlocks';
import { applyWeeklySwaps, countPriorRuns } from '../utils/weeklySwaps';
import { pickNeglectedFinisher } from '../utils/neglectedFinisher';
import { getMuscleGroupsForExercise } from '../utils/muscleGroups';
import { getPlanCardMeta } from '../utils/planCardMeta';
import { FullBodyThumbnail } from './MuscleAnalytics/MuscleThumbnail';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';

// No session-count cutoff: this used to hide itself past 12 sessions (a
// "new client nudge"), but that no longer fits a genuine ~3-month-per-level
// journey — a client training 3x/week clears 12 sessions in under a month,
// long before even reaching Intermediate, and would never see a level-up.
// The banner is now an ongoing guide for every stage (Beginner through
// permanent Advanced rotation), so it stays visible indefinitely.

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const CATEGORIES = ['gym', 'home'];

// Queues `program` (see utils/startLibraryProgram) and switches to Workouts.
// Also saves the level/category as the one the client is on — that level
// then stays the suggestion for 12 weeks (see determineWorkoutGuidance).
// The swap count comes from this client's server logs (countPriorRuns), so
// the logger applies the same swaps the banner previewed.
function startProgram(userId, onNavigateToWorkouts, category, level, program, pref, logs) {
  databaseService.saveLibraryLevelPref(userId, { level, category }, pref);
  startLibraryProgram(userId, category, level, program, countPriorRuns(logs, program?.name));
  onNavigateToWorkouts && onNavigateToWorkouts();
}

// Home-screen guidance for a client who's still new to training: tells them
// exactly which Workout Library program to do next — starting at Gym or Home
// Beginner and automatically advancing to Intermediate, then Advanced, on a
// genuine ~3-month-per-level tenure clock (see determineWorkoutGuidance /
// WEEKS_PER_LEVEL in beginnerGuidance.js for the full algorithm, including a
// client who already has Intermediate/Advanced history with no Beginner
// sessions at all, and Gym vs Home tracked independently).
// Tapping the banner deep-links straight into logging that exact program —
// see startProgram above — rather than just opening the Workout Library at
// the right level/category and leaving the client to tap the card
// themselves.
// Renders nothing once the client has logged enough sessions, or if no
// Workout Library programs are configured for either category at all.
export default function NextWorkoutBanner({ userId, logs, onNavigateToWorkouts }) {
  const [library, setLibrary] = useState(null); // null = still loading
  const [pref, setPref] = useState(undefined); // undefined = still loading
  // The ✕ on the first-workout picker hides it until the app is next opened
  // (sessionStorage, per client): a client who hasn't trained yet sees the
  // full level card on every fresh open, not a collapsed row forever
  // (2026-10-29). They can still start anything from the Workouts tab, and
  // once they log a session the normal next-program banner shows regardless.
  const dismissKey = `firstWorkoutPickerDismissed_${userId}`;
  const [pickerDismissed, setPickerDismissed] = useState(() => {
    try { return sessionStorage.getItem(dismissKey) === '1'; } catch { return false; }
  });
  const dismissPicker = () => {
    setPickerDismissed(true);
    try { sessionStorage.setItem(dismissKey, '1'); } catch { /* storage blocked — hidden until reload */ }
  };
  // Closing it used to leave nothing in its place — an empty home screen for
  // a new client (2026-10-15: "after closing nothing shows here"). A slim
  // "＋ Choose your level" row stays instead and reopens the picker; ignoring
  // it is fine too.
  const reopenPicker = () => {
    setPickerDismissed(false);
    try { sessionStorage.removeItem(dismissKey); } catch { /* storage blocked */ }
  };
  // The ✕ on the suggestion card hides it for the program it suggests
  // (stored by name, per client): once they log a session and the
  // suggestion moves on, the next one shows. A slim row stays in its place
  // to bring it back, same as the picker above.
  const bannerDismissKey = `nextWorkoutBannerDismissed_${userId}`;
  const [bannerDismissedFor, setBannerDismissedFor] = useState(() => {
    try { return localStorage.getItem(bannerDismissKey) || ''; } catch { return ''; }
  });
  const dismissBanner = (programName) => {
    setBannerDismissedFor(programName);
    try { localStorage.setItem(bannerDismissKey, programName); } catch { /* storage blocked — hidden until reload */ }
  };
  const reopenBanner = () => {
    setBannerDismissedFor('');
    try { localStorage.removeItem(bannerDismissKey); } catch { /* storage blocked */ }
  };
  // The row left after closing the suggestion is "Choose your level": it opens
  // the same Gym/Home + Beginner/Intermediate/Advanced picker as a new client's,
  // so the client can pick their own level instead of the suggested one.
  const [chooserOpen, setChooserOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      CATEGORIES.map(category =>
        Promise.all(LEVELS.map(level => databaseService.getGenericWorkoutsByLevel(level, category)))
      )
    ).then(([gymLists, homeLists]) => {
      if (cancelled) return;
      setLibrary({
        gym: { beginner: gymLists[0], intermediate: gymLists[1], advanced: gymLists[2] },
        home: { beginner: homeLists[0], intermediate: homeLists[1], advanced: homeLists[2] }
      });
    }).catch(() => {
      if (!cancelled) setLibrary({ gym: {}, home: {} });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(databaseService.getLibraryLevelPref(userId))
      .then(p => { if (!cancelled) setPref(p || null); })
      .catch(() => { if (!cancelled) setPref(null); });
    return () => { cancelled = true; };
  }, [userId]);

  if (!library || pref === undefined) return null;

  // One entry per distinct logged date (most recent non-empty plan name
  // wins per date) — kept self-contained here rather than depending on the
  // parent's own groupLogsByDate shape.
  const sessionsByDate = new Map();
  (logs || []).forEach(log => {
    const date = log.log_date;
    if (!date) return;
    const planName = log.plan_name || log.planName || '';
    const existing = sessionsByDate.get(date);
    if (!existing) sessionsByDate.set(date, { date, planName });
    else if (!existing.planName && planName) existing.planName = planName;
  });
  const sessions = Array.from(sessionsByDate.values());

  const guidance = determineWorkoutGuidance(library, sessions, undefined, pref);
  if (!guidance) return null;

  // A client with ZERO logged sessions has no history to infer Gym vs Home
  // (or their level) from — determineWorkoutGuidance defaults to Gym
  // Beginner, but silently assuming that is a real error for a client who
  // only trains at home or already trains. Ask instead, this one time, with
  // the same level + Gym/Home chooser as the end of sign-up
  // (FirstWorkoutPicker) so picking "I'll start later" there gets them the
  // same choice here. The moment they've logged anything at all (even from
  // this picker), this branch stops matching and the normal single-
  // suggestion banner below takes over, correctly following whichever they
  // actually did.
  if (guidance.reason === 'no-sessions') {
    const hasAnyProgram = Object.values(library).some(byLevel =>
      Object.values(byLevel).some(list => list?.length > 0)
    );
    if (!hasAnyProgram) return null;
    if (pickerDismissed) {
      return <ReopenRow title="Choose your level" subtitle="Gym or Home · Beginner, Intermediate or Advanced" onClick={reopenPicker} />;
    }

    return (
      <div
        style={{
          position: 'relative',
          background: 'rgba(var(--accent-rgb), 0.1)', border: '1px solid rgba(var(--accent-rgb), 0.3)',
          borderRadius: 0, padding: '16px 14px 18px', marginBottom: '4px'
        }}
      >
        <CloseButton title="Close — I don’t want to start yet" onClick={dismissPicker} />
        <FirstWorkoutPicker
          library={library}
          onStart={(category, level, program) => startProgram(userId, onNavigateToWorkouts, category, level, program, pref, logs)}
        />
      </div>
    );
  }

  const { category, level, program, reason } = guidance;
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);

  const goToProgram = () => startProgram(userId, onNavigateToWorkouts, category, level, program, pref, logs);
  if (bannerDismissedFor === program.name) {
    if (!chooserOpen) {
      return <ReopenRow title="Choose your level" subtitle="Gym or Home · Beginner, Intermediate or Advanced" onClick={() => setChooserOpen(true)} />;
    }
    return (
      <div
        style={{
          position: 'relative',
          background: 'rgba(var(--accent-rgb), 0.1)', border: '1px solid rgba(var(--accent-rgb), 0.3)',
          borderRadius: 0, padding: '16px 14px 18px', marginBottom: '4px'
        }}
      >
        <CloseButton title="Close" onClick={() => setChooserOpen(false)} />
        <FirstWorkoutPicker
          library={library}
          onStart={(c, l, p) => startProgram(userId, onNavigateToWorkouts, c, l, p, pref, logs)}
        />
        <button
          type="button"
          onClick={() => { setChooserOpen(false); reopenBanner(); }}
          style={{
            display: 'block', margin: '10px auto 0', background: 'transparent', border: 'none',
            color: 'var(--accent-text)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
          }}
        >
          Show the suggested workout again
        </button>
      </div>
    );
  }
  const session = todaysSession(program, level, category, logs);
  const position = programPosition(library, category, level, program);

  // Slim card (2026-11-15): body heat map of today's muscles · day / name /
  // stats · pulsing play. The whole card is the tap target.
  return (
    <div
      className="next-workout-card"
      onClick={goToProgram}
      role="button"
      tabIndex={0}
      aria-label={`Start ${program.name}${session.focus.length ? ` — ${session.focus.join(', ')}` : ''}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToProgram(); } }}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: '10px',
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        // Right padding leaves the corner free for the ✕ above the play button.
        borderRadius: '12px', padding: '10px 30px 10px 12px', marginBottom: '4px', cursor: 'pointer'
      }}
    >
      <CloseButton
        inline
        title="Close — I don’t want this suggestion now"
        onClick={(e) => { e.stopPropagation(); dismissBanner(program.name); }}
      />
      {session.muscles.length > 0 && (
        // --status-color tints the thumbnail's backdrop (.muscle-thumb).
        <div style={{ '--status-color': 'var(--primary-accent)', flexShrink: 0, display: 'flex' }}>
          <FullBodyThumbnail
            trainedMuscles={session.muscles}
            view={session.view}
            size={52}
            colorFor={(m) => (session.main.has(m) ? HEAT_MAIN : HEAT_ALSO)}
          />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          {reason === 'leveled-up' ? (
            <span style={{ color: '#22c55e', fontWeight: 700 }}>{levelLabel} unlocked</span>
          ) : reason === 'rotation' && position ? (
            <>
              <span aria-hidden="true" style={{ display: 'flex', gap: '3px' }}>
                {Array.from({ length: position.total }, (_, i) => (
                  <span key={i} style={{
                    width: '14px', height: '4px', borderRadius: '2px',
                    background: i < position.index ? '#22c55e' : i === position.index ? 'var(--primary-accent)' : 'var(--border-strong)'
                  }} />
                ))}
              </span>
              <span>Day {position.index + 1} of {position.total}</span>
            </>
          ) : (
            <span>{reason === 'rotation' ? 'Next up' : 'Start here'}</span>
          )}
        </div>
        <div style={{
          fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '2px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {program.name}
        </div>
        <div className="next-workout-stats" style={{
          fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {session.minutes} min · {session.exerciseCount} exercise{session.exerciseCount === 1 ? '' : 's'} · {session.setCount} sets
        </div>
      </div>
      {/* What the tap target looks like; the card itself handles the tap. */}
      <span className="next-workout-play" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14z" /></svg>
      </span>
    </div>
  );
}

// Heat-map tints for the card's body figure: the muscles today's exercises
// mainly target, and the ones they also work.
const HEAT_MAIN = '#ef4444';
const HEAT_ALSO = '#f59e0b';

// ✕ in the top-right corner of a banner card; `inline` is the smaller,
// ring-less one for the slim next-workout row, so the play button stays the
// focus.
function CloseButton({ title, onClick, inline = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Enter/Space on the ✕ must not reach a tappable card underneath.
      onKeyDown={(e) => e.stopPropagation()}
      aria-label="Close"
      title={title}
      style={inline ? {
        position: 'absolute', top: '4px', right: '4px', width: '22px', height: '22px',
        background: 'transparent', border: 'none', borderRadius: '50%', padding: 0,
        color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit'
      } : {
        position: 'absolute', top: '10px', right: '10px', zIndex: 1,
        width: '32px', height: '32px', borderRadius: '50%',
        background: 'rgba(var(--fg-rgb), 0.06)', border: '1px solid var(--border-color)',
        color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit'
      }}
    >
      ✕
    </button>
  );
}

// What a closed card leaves behind, so the home screen isn't left empty
// (2026-10-15: "after closing nothing shows here"): one slim row that
// brings the card back.
function ReopenRow({ title, subtitle, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'center',
        background: 'transparent', border: '1px dashed rgba(var(--accent-rgb), 0.4)',
        borderRadius: 'var(--radius-sm, 10px)', padding: '12px 52px', marginBottom: '4px',
        cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-main)'
      }}
    >
      {/* The text stays centered in the row; the + hangs just left of it. */}
      <span style={{ position: 'relative', display: 'inline-block', textAlign: 'center' }}>
        <span aria-hidden="true" style={{
          position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '12px',
          width: '28px', height: '28px', borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(var(--accent-rgb), 0.12)', color: 'var(--accent-text)', fontSize: '1.1rem', fontWeight: 800
        }}>＋</span>
        <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent-text)' }}>{title}</span>
        <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          {subtitle}
        </span>
      </span>
    </button>
  );
}

// Today's session as the logger will build it (handleStartFromTemplate):
// the same exercise swaps, warm-up and neglected-muscle finisher, so the
// card's numbers and heat map never promise something the session doesn't
// have. Returns
//   focus: ["Warm-up", "2 new exercises", "Core finisher (15 days)"] — read
//          out by screen readers; no swap the first time a program is done
//          (see countPriorRuns)
//   exerciseCount / setCount: warm-up + main + finisher
//   minutes: ~2.5 min per working set (getPlanCardMeta's estimate) + 5 for
//            the warm-up
//   muscles / main / view: for the heat map — `main` are the muscles an
//          exercise targets first; the rest are only worked along the way.
function todaysSession(program, level, category, logs) {
  const priorRuns = countPriorRuns(logs, program.name);
  const exercises = applyWeeklySwaps({ programName: program.name, exercises: program.exercises || [], level, category, priorRuns });
  const warmups = buildWarmupExercises({ programName: program.name, exercises, category });
  const finisher = pickNeglectedFinisher({ programName: program.name, exercises, category, logRows: logs || [], takenNames: warmups.map(w => w.name) });
  const working = finisher ? [...exercises, finisher] : exercises;
  const setsOf = (ex) => (Array.isArray(ex.sets) ? ex.sets.length : Number(ex.sets) || 0);
  const workingSets = working.reduce((n, ex) => n + setsOf(ex), 0);

  const swaps = exercises.filter(ex => ex.swappedFrom).length;
  const focus = [];
  if (warmups.length) focus.push('Warm-up');
  if (swaps) focus.push(`${swaps} new exercise${swaps === 1 ? '' : 's'}`);
  if (finisher) {
    const { muscle, daysSince } = finisher.finisherFor;
    focus.push(`${muscle} finisher${daysSince == null ? '' : ` (${daysSince} days)`}`);
  }

  const main = new Set();
  working.forEach(ex => { const first = getMuscleGroupsForExercise(ex.name)[0]; if (first) main.add(first); });
  const { muscles, view } = getPlanCardMeta({ exercises: working });

  return {
    focus,
    exerciseCount: warmups.length + working.length,
    setCount: warmups.reduce((n, ex) => n + setsOf(ex), 0) + workingSets,
    minutes: Math.max(15, Math.round((workingSets * 2.5) / 5) * 5 + (warmups.length ? 5 : 0)),
    muscles,
    main,
    view
  };
}

// Where `program` sits in its level's rotation ("Day 2 of 3"), or null if
// it isn't in the list.
function programPosition(library, category, level, program) {
  const list = library?.[category]?.[level] || [];
  const index = list.findIndex(p => p.name === program.name);
  return index < 0 || list.length < 2 ? null : { index, total: list.length };
}
