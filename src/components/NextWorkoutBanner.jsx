import React, { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import { determineWorkoutGuidance, weekOfLevel } from '../utils/beginnerGuidance';
import { startLibraryProgram } from '../utils/startLibraryProgram';
import FirstWorkoutPicker from './FirstWorkoutPicker';
import WeekPlanCard from './WeekPlanCard';
import { buildWarmupExercises } from '../utils/warmupBlocks';
import { applyWeeklySwaps, countPriorRuns } from '../utils/weeklySwaps';
import { pickNeglectedFinisher } from '../utils/neglectedFinisher';
import { getMuscleGroupsForExercise } from '../utils/muscleGroups';
import { getPlanCardMeta } from '../utils/planCardMeta';
import { easyRestartProgram } from '../utils/clientBreaks';
import { buildWeekPlan, DEFAULT_TRAINING_DAYS, mondayOf, sameProgram, sessionsFromLogs } from '../utils/weekPlan';
import { getLocalDateString, parseLocalDateString } from '../utils/dateUtils';

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
// priorRuns comes from this client's server logs (countPriorRuns), so the
// logger applies the same swaps the card previewed.
function startProgram(userId, onNavigateToWorkouts, category, level, program, pref, priorRuns) {
  databaseService.saveLibraryLevelPref(userId, { level, category }, pref);
  startLibraryProgram(userId, category, level, program, priorRuns);
  onNavigateToWorkouts && onNavigateToWorkouts();
}

// A self-guided client's Home guidance. A first-timer is asked for their
// level, Gym or Home, and training days (FirstWorkoutPicker); everyone else
// gets their week of Workout Library programs (WeekPlanCard) at the level
// determineWorkoutGuidance puts them on, spread over those days. Playing
// it deep-links straight into logging that exact program (startProgram).
// Renders nothing if no Workout Library programs are configured at all.
// easyRestart: back from a break ("Taking a break") — every exercise capped
// at 2 sets for the first workout back.
export default function NextWorkoutBanner({ userId, logs, onNavigateToWorkouts, easyRestart = false }) {
  const [library, setLibrary] = useState(null); // null = still loading
  const [pref, setPref] = useState(undefined); // undefined = still loading
  const [training, setTraining] = useState(undefined); // { days, since }; undefined = still loading
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
  // "＋ Make your workout plan" row stays instead and reopens the picker; ignoring
  // it is fine too.
  const reopenPicker = () => {
    setPickerDismissed(false);
    try { sessionStorage.removeItem(dismissKey); } catch { /* storage blocked */ }
  };
  // Hiding the week (swipe → Hide) hides it until next Monday; a slim "Show
  // my week" row stays in its place to bring it back.
  const today = getLocalDateString();
  const monday = mondayOf(today);
  const hideKey = `weekPlanHidden_${userId}`;
  const [hiddenWeek, setHiddenWeek] = useState(() => {
    try { return localStorage.getItem(hideKey) || ''; } catch { return ''; }
  });
  const hideWeek = () => {
    setHiddenWeek(monday);
    try { localStorage.setItem(hideKey, monday); } catch { /* storage blocked — hidden until reload */ }
  };
  const showWeek = () => {
    setHiddenWeek('');
    try { localStorage.removeItem(hideKey); } catch { /* storage blocked */ }
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

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(databaseService.getLibraryDays(userId))
      .then(t => { if (!cancelled) setTraining(t || null); })
      .catch(() => { if (!cancelled) setTraining(null); });
    return () => { cancelled = true; };
  }, [userId]);

  const saveDays = (days) => {
    const next = { days, since: today };
    setTraining(next);
    databaseService.saveLibraryDays(userId, next);
  };

  if (!library || pref === undefined || training === undefined) return null;

  // Every logged day counts here, named or not: an unnamed workout still
  // makes someone not a first-timer.
  const loggedDays = (logs || []).filter(l => l.log_date).map(l => ({ date: l.log_date, planName: l.plan_name || l.planName || '' }));
  // As of this Monday, so a level that ends mid-week doesn't swap out a
  // half-done week.
  const guidance = determineWorkoutGuidance(library, loggedDays, parseLocalDateString(monday), pref);
  if (!guidance) return null;

  // A client with ZERO logged sessions has no history to infer Gym vs Home
  // (or their level) from — determineWorkoutGuidance defaults to Gym
  // Beginner, but silently assuming that is a real error for a client who
  // only trains at home or already trains. Ask instead, this one time. Once
  // they've made a plan (which saves their level) or logged anything at all,
  // this branch stops matching and the week below takes over.
  if (guidance.reason === 'no-sessions') {
    const hasAnyProgram = Object.values(library).some(byLevel =>
      Object.values(byLevel).some(list => list?.length > 0)
    );
    if (!hasAnyProgram) return null;
    if (pickerDismissed) {
      return <ReopenRow title="Make your workout plan" subtitle="Your level, gym or home, and your days" onClick={reopenPicker} />;
    }

    return (
      <div
        style={{
          position: 'relative',
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: '14px', flexShrink: 0, padding: '16px 14px 18px', marginBottom: '4px'
        }}
      >
        <CloseButton title="Close — I don’t want to start yet" onClick={dismissPicker} />
        <FirstWorkoutPicker
          library={library}
          onMakePlan={(category, level, days) => {
            databaseService.saveLibraryLevelPref(userId, { level, category }, pref);
            setPref({ level, category, since: today });
            saveDays(days);
            showWeek(); // a week hidden earlier must not swallow the plan just made
          }}
        />
      </div>
    );
  }

  const { category, level, reason } = guidance;
  const days = training?.days || DEFAULT_TRAINING_DAYS;
  const plan = buildWeekPlan({
    programs: library[category]?.[level], sessions: sessionsFromLogs(logs), days, since: training?.since, today
  });
  if (!plan) return null;

  // A hidden week leaves a quiet row that brings it back — never the level
  // picker, which is only for a first-timer (2026-11-15: a client who
  // already trains kept landing back on first-time setup). Level changes
  // live in the Library tab.
  if (hiddenWeek === monday) {
    return (
      <ReopenRow
        title="Show my week"
        subtitle={plan.weekDone ? `Week done, ${plan.doneCount} of ${plan.slots.length}` : plan.main.program.name}
        onClick={showWeek}
      />
    );
  }

  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);
  const toDo = (program) => (easyRestart ? easyRestartProgram(program) : program);
  // How often this program will have been done by a card's day: the first of
  // two Full Body As in a week doesn't make the second one new until it's
  // done, so a card still to come counts towards the later one's note.
  const runsBefore = (slot) => countPriorRuns(logs, slot.program.name, parseLocalDateString(slot.date > today ? slot.date : today));
  const runsExpected = (slot) => runsBefore(slot) + plan.slots.filter(s =>
    s.program === slot.program && !s.done && s.date >= today && s.date < slot.date).length;
  let note = null;
  if (easyRestart) note = 'Easy restart · 2 sets each';
  else if (reason === 'leveled-up') note = `${levelLabel} unlocked`;

  return (
    <WeekPlanCard
      plan={plan}
      levelLabel={`${levelLabel} · ${category === 'home' ? 'Home' : 'Gym'}`}
      levelWeek={weekOfLevel(level, loggedDays, parseLocalDateString(today), pref)}
      note={note}
      days={days}
      hintKey={`nextWorkoutSwipeHintSeen_${userId}`}
      sessionFor={(slot) => todaysSession(toDo(slot.program), level, category, logs, runsExpected(slot), slot === plan.main || !slot.date)}
      loggedFor={(slot) => loggedExercises(logs, slot)}
      onStart={(slot) => startProgram(userId, onNavigateToWorkouts, category, level, toDo(slot.program), pref, runsBefore(slot))}
      onChangeDays={saveDays}
      onHide={hideWeek}
    />
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
//   warmups / exercises: the same, listed in the sheet the card opens
//   finisherLater: sets of the neglected muscle a later day will get
//   exerciseCount / setCount: warm-up + main + finisher
//   minutes: ~2.5 min per working set (getPlanCardMeta's estimate) + 5 for
//            the warm-up
//   muscles / main / view: for the heat map — `main` are the muscles an
//          exercise targets first; the rest are only worked along the way.
// withFinisher: only for the one to do now — which muscle is most neglected
// changes with every workout, so a later day's can't be promised yet.
function todaysSession(program, level, category, logs, priorRuns, withFinisher) {
  const exercises = applyWeeklySwaps({ programName: program.name, exercises: program.exercises || [], level, category, priorRuns });
  const warmups = buildWarmupExercises({ programName: program.name, exercises, category });
  const pick = pickNeglectedFinisher({ programName: program.name, exercises, category, logRows: logs || [], takenNames: warmups.map(w => w.name) });
  const finisher = withFinisher ? pick : null;
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
    warmups,
    exercises: working.map(ex => ({
      name: ex.name,
      amount: ex.reps ? `${setsOf(ex)} × ${ex.reps}` : `${setsOf(ex)} sets`,
      tag: exerciseTag(ex),
      added: !!ex.finisherFor
    })),
    finisherLater: !withFinisher && pick ? pick.sets : 0,
    exerciseCount: warmups.length + working.length,
    setCount: warmups.reduce((n, ex) => n + setsOf(ex), 0) + workingSets,
    minutes: Math.max(15, Math.round((workingSets * 2.5) / 5) * 5 + (warmups.length ? 5 : 0)),
    muscles,
    main,
    view
  };
}

// Why an exercise isn't the program's usual one: swapped in for this run, or
// added for a neglected muscle.
function exerciseTag(ex) {
  if (ex.swappedFrom) return `New, instead of ${ex.swappedFrom}`;
  if (!ex.finisherFor) return null;
  const { muscle, daysSince } = ex.finisherFor;
  if (daysSince == null) return `Added, ${muscle} not trained yet`;
  return `Added, ${muscle} not trained for ${daysSince} day${daysSince === 1 ? '' : 's'}`;
}

// What was saved for a done card: one entry per exercise, warm-up sets left
// out.
function loggedExercises(logs, slot) {
  const byName = new Map();
  (logs || []).forEach(l => {
    if (l.log_date !== slot.doneOn || !l.exercise_name || l.set_type === 'warmup') return;
    if (!sameProgram(l.plan_name || l.planName, slot.program.name)) return;
    if (!byName.has(l.exercise_name)) byName.set(l.exercise_name, []);
    byName.get(l.exercise_name).push(Number(l.reps) || 0);
  });
  return [...byName].map(([name, reps]) => ({
    name,
    amount: reps[0] > 1 && reps.every(n => n === reps[0])
      ? `${reps.length} × ${reps[0]}`
      : `${reps.length} set${reps.length === 1 ? '' : 's'}`
  }));
}
