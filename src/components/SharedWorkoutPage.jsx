import { useEffect, useMemo, useState } from 'react';
import { HeatBodyFigure } from './MuscleAnalytics/MuscleThumbnail';
import { BodySexContext } from './MuscleAnalytics/bodySex';
import StatsStrip from './StatsStrip';
import { getSetTypeVisual } from '../utils/setTypes';
import { formatSecondsToTimeString } from '../utils/liveWorkoutTimer';
import { formatDurationShort } from '../utils/monthlyProgress';
import { isCardioExercise, isTimedExercise, isLoadedCarryExercise, isBodyweightExercise, isWarmupExercise } from '../data/exerciseLibrary';
import { HELPED_MUSCLE_COLOR, MAIN_MUSCLE_COLOR, sharedWeightLabel, sharedWorkoutMuscles, sharedWorkoutTotals } from '../utils/workoutShare';
import { workoutNameParts, workoutNameTags } from '../utils/workoutNameParts';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import './SharedWorkoutPage.css';

const Icon = ({ size, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

// The cells of one set, by what that kind of exercise logs.
function setCells(name, set, showWeights) {
  const weight = showWeights ? sharedWeightLabel(name, set.weightKg) : null;
  const time = formatSecondsToTimeString(set.seconds) || '00:00';
  if (isCardioExercise(name)) return [`${set.distanceKm ?? 0} km`, time];
  if (isTimedExercise(name)) return isBodyweightExercise(name) ? [weight, time] : [time];
  if (isLoadedCarryExercise(name)) return [weight, `${set.reps} m`];
  if (isWarmupExercise(name)) return [`${set.reps} reps`];
  return [weight, `${set.reps} reps`];
}

function Exercise({ ex, showWeights }) {
  return (
    <section className="swp-ex">
      <h2>
        {ex.name}
        {ex.newBest && <span className="swp-best">New best</span>}
        <small>{ex.sets.length} {ex.sets.length === 1 ? 'set' : 'sets'}</small>
      </h2>
      <ol>
        {ex.sets.map((set, i) => {
          const workingNum = ex.sets.slice(0, i + 1).filter(s => !['warmup', 'failure', 'drop', 'superset'].includes(s.type)).length;
          const visual = getSetTypeVisual({ setType: set.type, isWarmup: set.type === 'warmup' }, workingNum);
          const cells = setCells(ex.name, set, showWeights).filter(Boolean);
          return (
            <li key={i}>
              <i style={visual.color ? { background: `${visual.color}22`, color: visual.color } : undefined}>{visual.label}</i>
              {cells.map((c, j) => <span key={j}>{c}</span>)}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * What a /w/<token> link opens: one finished workout, to look at only. Its
 * own page, outside the app (see main.jsx) — no sign-in, nothing to type or
 * tick, and the same for people with and without an account.
 */
export default function SharedWorkoutPage({ token }) {
  const [state, setState] = useState({ status: token ? 'loading' : 'gone', workout: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    fetch('/api/data-read?resource=shared-workout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token })
    })
      .then(async r => {
        if (r.status === 404) return { status: 'gone', workout: null };
        const body = r.ok ? await r.json() : null;
        return body?.workout ? { status: 'ready', workout: body.workout } : { status: 'error', workout: null };
      })
      .catch(() => ({ status: 'error', workout: null }))
      .then(next => { if (!cancelled) setState(next); });
    return () => { cancelled = true; };
  }, [token, attempt]);

  const { status, workout } = state;
  const muscles = useMemo(() => (workout ? sharedWorkoutMuscles(workout) : []), [workout]);
  const totals = useMemo(() => (workout ? sharedWorkoutTotals(workout) : null), [workout]);

  useEffect(() => {
    if (workout) document.title = workout.name ? `${workout.name}’s ${workout.title}` : workout.title;
  }, [workout]);

  let signedIn = false;
  try { signedIn = localStorage.getItem('onboardingComplete') === 'true'; } catch { /* storage blocked */ }

  // Opened inside the installed app (no browser back button there) or by
  // someone who uses it: a way back to their own screens.
  const installed = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
  const backToApp = (signedIn || installed) && (
    <a className="swp-back" href="/" aria-label="Back to my app"><Icon size={22}><path d="M15 6l-6 6 6 6" /></Icon></a>
  );

  if (status !== 'ready') {
    return (
      <main className="swp swp-message">
        {backToApp}
        {status === 'loading' && <p role="status">Opening workout…</p>}
        {status === 'gone' && (
          <>
            <Icon size={44}><path d="M9 15l3-3M11 6l.5-.5a5 5 0 0 1 7 7L18 13M13 18l-.5.5a5 5 0 0 1-7-7L6 11M3 3l18 18" /></Icon>
            <h1>This workout isn’t shared anymore</h1>
            <p>The link was turned off, or the workout was removed.</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1>Couldn’t open this workout</h1>
            <p>Check your connection and try again.</p>
            <button type="button" className="swp-btn" onClick={() => { setState({ status: 'loading', workout: null }); setAttempt(n => n + 1); }}>Try again</button>
          </>
        )}
      </main>
    );
  }

  const dateLabel = new Date(`${workout.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(',', '');
  const nameParts = workoutNameParts(workout.title);
  const tags = workoutNameTags(nameParts);
  const colors = Object.fromEntries(muscles.map(m => [m.muscle, m.main ? MAIN_MUSCLE_COLOR : HELPED_MUSCLE_COLOR]));
  const colorFor = (m) => colors[m] || null;

  return (
    <main className="swp">
      <div className="swp-inner">
        <header className="swp-head">
          {backToApp}
          <img src="/logo.png" alt="" />
          <b>Fitengineers</b>
          <span className="swp-only"><Icon size={14}><path d="M2 12c2.5-4.7 5.8-7 10-7s7.500 2.300 10 7c-2.500 4.700-5.800 7-10 7s-7.500-2.300-10-7" /><circle cx="12" cy="12" r="3" /></Icon>View only</span>
        </header>

        <div className="swp-title">
          <h1>{nameParts.name}</h1>
          {tags.length > 0 && (
            <div className="swp-tags">{tags.map(t => <span key={t.kind} className={`swp-tag ${t.kind}`}>{t.text}</span>)}</div>
          )}
          <p>{[workout.name, dateLabel].filter(Boolean).join(' · ')}</p>
        </div>

        <StatsStrip className="swp-stats" items={[
          ...(workout.durationSeconds != null ? [{ icon: 'time', label: 'time', text: formatDurationShort(workout.durationSeconds) }] : []),
          { icon: 'sets', label: totals.sets === 1 ? 'set' : 'sets', value: totals.sets },
          ...(totals.volume ? [{ icon: 'volume', label: 'kg', value: totals.volume }] : []),
          ...(workout.calories != null ? [{ icon: 'kcal', label: 'kcal', value: workout.calories }] : []),
        ]} />

        {workout.showMap && muscles.length > 0 && (
          <section className="swp-map">
            <h2>Muscles worked</h2>
            <BodySexContext.Provider value={workout.bodySex}>
              <div className="swp-bodies">
                <HeatBodyFigure view="front" height={190} colorFor={colorFor} />
                <HeatBodyFigure view="back" height={190} colorFor={colorFor} />
              </div>
            </BodySexContext.Provider>
            <ul>
              {muscles.map(m => (
                <li key={m.muscle}><i style={{ background: colors[m.muscle] }} />{m.muscle} <b>{m.sets}</b></li>
              ))}
            </ul>
            <p>Sets per muscle</p>
          </section>
        )}

        <h2 className="swp-section">What was done</h2>
        {workout.exercises.map(ex => <Exercise key={ex.name} ex={ex} showWeights={workout.showWeights} />)}

        <footer className="swp-cta">
          <img src="/logo.png" alt="" />
          <span><b>{signedIn ? 'You use Fitengineers' : 'Track your own'}</b>{signedIn ? 'This page is view only' : 'Log sets, see your muscles'}</span>
          <a className="swp-btn" href="/">{signedIn ? 'My workouts' : 'Try it'}</a>
        </footer>
      </div>
    </main>
  );
}
