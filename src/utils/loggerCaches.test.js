// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { memoByName } from './memoByName';
import { findPreviousLoggedSetIn, findPreviousExerciseSetsIn, findPreviousAnySetIn } from './prevSets';
import { setRingInputs, getSetRingStates } from './setMuscleRing';
import { busyAlternatives } from './busySwap';
import { findExerciseGuideMatch } from './videoUtils';
import { getRegionBreakdownForMuscle, getMuscleGaps } from './muscleRegions';
import { getWeekMuscleView } from './weekMuscleView';
import { setCatalogMuscles } from './muscleGroups';
import { buildSessionRecap } from './coachNoteRecap';
import { svgHtml } from '../components/MuscleAnalytics/muscleBodyShapes';

// The loggers re-render on every key and every clock second, so these answers
// are kept between renders. What matters is that nothing stale is ever shown.
describe('logger caches', () => {
  it('memoByName works an answer out once, and passes non-names straight through', () => {
    let calls = 0;
    const f = memoByName(n => { calls += 1; return `${n}!`; });
    expect([f('a'), f('a'), f(null)]).toEqual(['a!', 'a!', 'null!']);
    expect(calls).toBe(2);
  });

  const session = (date, weight, extra = {}) => ({ date, clientName: 'Asha', exercises: [{ name: 'Bench Press', sets: [{ reps: 8, weight, ...extra }] }] });

  it('PREV follows a new session list, and one grown in place', () => {
    const first = [session('2026-11-01', 40)];
    expect(findPreviousLoggedSetIn(first, 'Asha', 'bench press', 0).weight).toBe(40);
    expect(findPreviousLoggedSetIn([...first, session('2026-11-08', 45)], 'asha', 'Bench Press', 0).weight).toBe(45);
    first.push(session('2026-11-15', 50));
    expect(findPreviousExerciseSetsIn(first, 'Asha', 'Bench Press')[0].weight).toBe(50);
    expect(findPreviousLoggedSetIn(first, 'Someone else', 'Bench Press', 0)).toBeNull();
  });

  it("only the coach's PREV counts a warm-up-only entry", () => {
    const list = [session('2026-11-01', 40), session('2026-11-08', 20, { setType: 'warmup' })];
    expect(findPreviousLoggedSetIn(list, null, 'Bench Press', 0).weight).toBe(40);
    expect(findPreviousAnySetIn(list, 'Bench Press', 0).weight).toBe(20);
    expect(findPreviousAnySetIn(list, 'Bench Press', 3)).toBeNull();
    expect(findPreviousAnySetIn(null, 'Bench Press', 0)).toBeNull();
  });

  it('ring inputs ignore typing in an unticked set, and follow ticks and ticked numbers', () => {
    const ex = (sets) => [{ name: 'Bench Press', sets }];
    const base = setRingInputs(ex([{ reps: 8, weight: '40' }]));
    expect(setRingInputs(ex([{ reps: 10, weight: '45' }]))).toBe(base);
    const ticked = setRingInputs(ex([{ reps: 8, weight: '40', isCompleted: true }]));
    expect(ticked).not.toBe(base);
    expect(setRingInputs(ex([{ reps: 8, weight: '', isCompleted: true }]))).not.toBe(ticked);
  });

  it('rings from the inputs string equal rings from the exercises themselves', () => {
    const exercises = [
      { name: 'Bench Press', sets: [{ reps: 8, weight: '40', isCompleted: true, completedAt: 5 }, { reps: 8, weight: '', isCompleted: true }, { reps: 5, weight: '20' }, { reps: 5, weight: '20', isWarmup: true, isCompleted: true }] },
      { name: 'Lateral Raise', sets: [{ reps: 12, weight: 8, isCompleted: true, setType: 'drop' }] },
    ];
    const saved = [
      { log_date: '2026-11-23', exercise_name: 'Bench Press', reps: 8, weight_kg: 40 },
      { log_date: '2026-11-01', exercise_name: 'Bench Press', reps: 8, weight_kg: 40 },
      { log_date: null, exercise_name: 'Bench Press', reps: 8, weight_kg: 40 },
    ];
    expect(getSetRingStates(saved, JSON.parse(setRingInputs(exercises)), '2026-11-24', 'beginner'))
      .toEqual(getSetRingStates(saved, exercises, '2026-11-24', 'beginner'));
  });

  it('older history changes neither the week view nor the gaps', () => {
    const now = { log_date: '2026-11-23', exercise_name: 'Bench Press', reps: 8, weight_kg: 40 };
    const old = { ...now, log_date: '2026-06-01' };
    expect(getWeekMuscleView([now, old], [], '2026-11-24', null).statsAll).toEqual(getWeekMuscleView([now], [], '2026-11-24', null).statsAll);
    expect(getMuscleGaps([now, old], '2026-11-24')).toEqual(getMuscleGaps([now], '2026-11-24'));
    // …but the muscle detail screen still knows when a part was last worked.
    expect(getRegionBreakdownForMuscle([old], 'Chest', '2026-11-23', '2026-11-29').find(r => r.id === 'Mid Chest').lastTrained.date).toBe('2026-06-01');
  });

  it('a caller changing its suggestions does not change the next one\'s, and a new catalog starts fresh', () => {
    const suggest = () => getRegionBreakdownForMuscle([], 'Chest', '2026-11-23', '2026-11-29')[0].suggestions;
    const before = suggest();
    suggest().length = 0;
    expect(suggest()).toEqual(before);
    setCatalogMuscles([{ name: 'Zz Unknown Move', primary_muscle: 'Chest' }]);
    expect(suggest()).toEqual(before);
    setCatalogMuscles([]);
  });

  it('Busy? stand-ins follow the exercises already in the workout', () => {
    const catalog = ['Bench Press (Barbell)', 'Chest Press Machine', 'Push-up', 'Bench Press (Dumbbell)']
      .map(name => ({ name, muscle: 'Chest', category: 'Chest' }));
    const [top] = busyAlternatives('Bench Press (Barbell)', catalog, [], 1);
    expect(top).toBeTruthy();
    top.name = 'changed by a caller';
    expect(busyAlternatives('Bench Press (Barbell)', catalog, [], 1)[0].name).not.toBe('changed by a caller');
    const real = busyAlternatives('Bench Press (Barbell)', catalog, [], 1)[0].name;
    expect(busyAlternatives('Bench Press (Barbell)', catalog, [real], 1)[0]?.name).not.toBe(real);
  });

  it('a Form Guide miss is looked up again once the library list changes', () => {
    const list = [{ name: 'Squat' }];
    expect(findExerciseGuideMatch(list, 'Face Pulls')).toBeNull();
    expect(findExerciseGuideMatch([...list, { name: 'Face Pull' }], 'Face Pulls').name).toBe('Face Pull');
    list.push({ name: 'Face Pull' });
    expect(findExerciseGuideMatch(list, 'Face Pulls').name).toBe('Face Pull');
  });

  it('the recap PR check follows the live sets while the history is kept', () => {
    const prior = [session('2026-11-01', 40)];
    const live = (weight) => [{ name: 'Bench Press', sets: [{ reps: 8, weight, isCompleted: true }] }];
    expect(buildSessionRecap(live('39'), prior, { live: true })[0].isPR).toBe(false);
    expect(buildSessionRecap(live('42.5'), prior, { live: true })[0].isPR).toBe(true);
  });

  it('a body drawing keeps one innerHTML object, so React leaves it alone', () => {
    expect(svgHtml('<svg a/>')).toBe(svgHtml('<svg a/>'));
    expect(svgHtml('<svg a/>')).not.toBe(svgHtml('<svg b/>'));
  });
});
