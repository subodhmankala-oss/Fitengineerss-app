import React, { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import { determineWorkoutGuidance } from '../utils/beginnerGuidance';
import { startLibraryProgram } from '../utils/startLibraryProgram';
import FirstWorkoutPicker from './FirstWorkoutPicker';
import { buildWarmupExercises } from '../utils/warmupBlocks';
import { applyWeeklySwaps, hasTrainedBeforeThisWeek } from '../utils/weeklySwaps';
import { pickNeglectedFinisher } from '../utils/neglectedFinisher';

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
function startProgram(userId, onNavigateToWorkouts, category, level, program, pref) {
  databaseService.saveLibraryLevelPref(userId, { level, category }, pref);
  startLibraryProgram(userId, category, level, program);
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
  // The ✕ on the first-workout picker hides it for good on this device (per
  // client) — they can still start anything from the Workouts tab, and once
  // they log a session the normal next-program banner shows regardless.
  const dismissKey = `firstWorkoutPickerDismissed_${userId}`;
  const [pickerDismissed, setPickerDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey) === '1'; } catch { return false; }
  });
  const dismissPicker = () => {
    setPickerDismissed(true);
    try { localStorage.setItem(dismissKey, '1'); } catch { /* storage blocked — hidden until reload */ }
  };
  // Closing it used to leave nothing in its place — an empty home screen for
  // a new client (2026-10-15: "after closing nothing shows here"). A slim
  // "＋ Choose your level" row stays instead and reopens the picker; ignoring
  // it is fine too.
  const reopenPicker = () => {
    setPickerDismissed(false);
    try { localStorage.removeItem(dismissKey); } catch { /* storage blocked */ }
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
          onStart={(category, level, program) => startProgram(userId, onNavigateToWorkouts, category, level, program, pref)}
        />
      </div>
    );
  }

  const { category, level, program, reason, lastProgram } = guidance;

  const categoryLabel = category === 'home' ? 'Home' : 'Gym';
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);

  const title = reason === 'leveled-up'
    ? `🎉 ${levelLabel} unlocked!`
    : reason === 'rotation'
      ? '🌱 Keep going — next up'
      : '🌱 New here? Start with this';

  // "3 months as a Gym Beginner" only for a client who actually did that
  // level's programs — the clock counts weeks since the first log, so a
  // client on coach plans (or who logged once, months ago) reaches it too.
  const body = reason === 'leveled-up'
    ? didPreviousLevel(library, category, level, sessions)
      ? `You've put in your 3 months as a ${categoryLabel} ${lastProgramLevelLabel(level)}! Time to level up — try ${program.name}.`
      : `You've been training for 3 months — time to level up! Try ${program.name}.`
    : reason === 'rotation'
      ? `Nice work on ${lastProgram.name}! Next up: ${program.name}.`
      : `We recommend starting with ${program.name} — a structured ${categoryLabel} ${levelLabel} program from the Workout Library.`;

  const goToProgram = () => startProgram(userId, onNavigateToWorkouts, category, level, program, pref);
  if (bannerDismissedFor === program.name) {
    return <ReopenRow title="Suggested workout" subtitle={program.name} onClick={reopenBanner} />;
  }
  const focus = todaysFocus(program, level, category, logs);

  return (
    <div
      onClick={goToProgram}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToProgram(); } }}
      style={{
        display: 'flex', flexDirection: 'column', gap: '10px',
        background: 'rgba(var(--accent-rgb), 0.1)', border: '1px solid rgba(var(--accent-rgb), 0.3)',
        position: 'relative',
        borderRadius: 0, padding: '18px 16px', marginBottom: '4px', cursor: 'pointer'
      }}
    >
      <CloseButton
        title="Close — I don’t want this suggestion now"
        onClick={(e) => { e.stopPropagation(); dismissBanner(program.name); }}
      />
      <div style={{ minWidth: 0, paddingRight: '36px' }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-text)' }}>{title}</div>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4 }}>{body}</div>
      </div>
      {focus.length > 0 && (
        <div className="next-workout-focus" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {focus.map(part => (
            <span
              key={part}
              className="next-workout-focus-pill"
              style={{
                fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-text)',
                background: 'rgba(var(--accent-rgb), 0.12)', border: '1px solid rgba(var(--accent-rgb), 0.25)',
                borderRadius: '999px', padding: '4px 10px'
              }}
            >
              {part}
            </span>
          ))}
        </div>
      )}
      {/* The whole card is the tap target; this is what it looks like. */}
      <span
        aria-hidden="true"
        style={{
          display: 'block', textAlign: 'center', fontSize: '0.95rem', fontWeight: 800,
          color: '#fff', background: 'var(--primary-accent, rgb(var(--accent-rgb)))',
          borderRadius: 'var(--radius-sm)', padding: '11px 14px'
        }}
      >
        Start workout →
      </span>
    </div>
  );
}

// ✕ in the top-right corner of a banner card.
function CloseButton({ title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Enter/Space on the ✕ must not reach a tappable card underneath.
      onKeyDown={(e) => e.stopPropagation()}
      aria-label="Close"
      title={title}
      style={{
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
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', textAlign: 'center',
        background: 'transparent', border: '1px dashed rgba(var(--accent-rgb), 0.4)',
        borderRadius: 'var(--radius-sm, 10px)', padding: '12px 14px', marginBottom: '4px',
        cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-main)'
      }}
    >
      <span aria-hidden="true" style={{
        width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(var(--accent-rgb), 0.12)', color: 'var(--accent-text)', fontSize: '1.1rem', fontWeight: 800
      }}>＋</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent-text)' }}>{title}</span>
        <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          {subtitle}
        </span>
      </span>
    </button>
  );
}

// "Today's focus" line: what this program will look like when it opens —
// the same warm-up / weekly swaps / neglected-muscle finisher the logger
// builds (handleStartFromTemplate), so the banner never promises something
// the session doesn't have. Pills, e.g. ["🔥 Warm-up", "🔄 2 new this week",
// "🎯 Core finisher (15 days)"].
function todaysFocus(program, level, category, logs) {
  const trainedBefore = hasTrainedBeforeThisWeek((logs || []).map(l => l.log_date));
  const exercises = applyWeeklySwaps({ programName: program.name, exercises: program.exercises, level, category, trainedBefore });
  const warmups = buildWarmupExercises({ programName: program.name, exercises, category });
  const finisher = pickNeglectedFinisher({ programName: program.name, exercises, category, logRows: logs || [], takenNames: warmups.map(w => w.name) });
  const swaps = exercises.filter(ex => ex.swappedFrom).length;
  const parts = [];
  if (warmups.length) parts.push('🔥 Warm-up');
  if (swaps) parts.push(`🔄 ${swaps} new this week`);
  if (finisher) {
    const { muscle, daysSince } = finisher.finisherFor;
    parts.push(`🎯 ${muscle} finisher${daysSince == null ? '' : ` (${daysSince} days)`}`);
  }
  return parts;
}

// Whether the client logged any program from the level below `currentLevel`
// in this category (same name matching as utils/beginnerGuidance).
function didPreviousLevel(library, category, currentLevel, sessions) {
  const idx = LEVELS.indexOf(currentLevel);
  if (idx <= 0) return false;
  const squash = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const names = new Set((library?.[category]?.[LEVELS[idx - 1]] || []).map(p => squash(p.name)));
  return sessions.some(s => names.has(squash(s.planName)));
}

// The level just cleared, for the 'leveled-up' message ("completed every
// ___ program") — one below whichever level the client is now on.
function lastProgramLevelLabel(currentLevel) {
  const idx = LEVELS.indexOf(currentLevel);
  const previous = idx > 0 ? LEVELS[idx - 1] : currentLevel;
  return previous.charAt(0).toUpperCase() + previous.slice(1);
}
