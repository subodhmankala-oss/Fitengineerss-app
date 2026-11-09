import { describe, it, expect } from 'vitest';
import { applyWeeklySwaps, countPriorRuns, SWAP_ALTERNATIVES } from './weeklySwaps';
import { EXERCISE_LIBRARY, isCardioExercise } from '../data/exerciseLibrary';

const ex = (...names) => names.map(name => ({ name, sets: 3, reps: '10' }));
const known = new Set(EXERCISE_LIBRARY.map(e => e.name.toLowerCase()));
// In the shared exercises catalog, not the static library — the library
// programs themselves use these exact spellings ("Pull-up", "Push Up").
const CATALOG_ONLY = ['knee push ups', 'pull-up', 'push up'];

// The 2nd, 3rd, … time a program is done (1, 2, … earlier runs).
const runs = (n) => Array.from({ length: n }, (_, i) => i + 1);

describe('SWAP_ALTERNATIVES', () => {
  it('only names exercises the app knows', () => {
    const missing = [];
    ['gym', 'home', 'beginner'].forEach(place => Object.values(SWAP_ALTERNATIVES[place]).flat().forEach(name => {
      if (!known.has(name.toLowerCase()) && !CATALOG_ONLY.includes(name.toLowerCase())) missing.push(name);
    }));
    expect(missing).toEqual([]);
  });

  it('never swaps to a cardio machine (different set shape: km + time)', () => {
    ['gym', 'home', 'beginner'].forEach(place => Object.values(SWAP_ALTERNATIVES[place]).flat().forEach(name => {
      expect(isCardioExercise(name)).toBe(false);
    }));
  });
});

describe('trend programs (Zone 2, Hyrox, Pilates …)', () => {
  it('Hyrox keeps Running first and never swaps the sled or the run', () => {
    const hyrox = [
      { name: 'Running', sets: 4, reps: '1 km' }, { name: 'Sled Push', sets: 4, reps: '25 m' },
      { name: 'Air Rowing', sets: 4, reps: '500 m' }, { name: 'Farmer Walk', sets: 4, reps: '40 m' },
      { name: 'Wall Ball', sets: 4, reps: '20' },
    ];
    runs(8).forEach(priorRuns => {
      const out = applyWeeklySwaps({ programName: 'Advanced Hyrox Engine', exercises: hyrox, level: 'advanced', category: 'gym', priorRuns });
      expect(out.map(e => e.name).slice(0, 3)).toEqual(['Running', 'Sled Push', 'Air Rowing']);
      out.filter(e => e.swappedFrom).forEach(e => expect(['Farmer Walk', 'Wall Ball']).toContain(e.swappedFrom));
    });
  });

  it('a program in the Hyrox section never swaps (the stations are the point)', () => {
    const builder = ex('Running', 'SkiErg', 'Sled Push', 'Burpee Broad Jump', 'Wall Ball', 'Farmer Walk');
    runs(8).forEach(priorRuns => {
      const out = applyWeeklySwaps({ programName: 'Hyrox Builder', exercises: builder, level: 'intermediate', category: 'hyrox', priorRuns });
      expect(out).toEqual(builder);
    });
  });

  it('the 12-3-30 walk and the Zone 2 cardio are never swapped away', () => {
    const walk = ex('Incline Walk', 'Dead Bug', 'Bird dog', 'Plank');
    const zone2 = ex('Cycling', 'Incline Walk', 'Bird dog', 'Dead Bug', 'Side Plank');
    runs(8).forEach(priorRuns => {
      const a = applyWeeklySwaps({ programName: 'Beginner Incline Walk 12-3-30', exercises: walk, level: 'beginner', category: 'gym', priorRuns });
      expect(a[0].name).toBe('Incline Walk');
      const b = applyWeeklySwaps({ programName: 'Intermediate Zone 2 Cardio Base', exercises: zone2, level: 'intermediate', category: 'gym', priorRuns });
      expect(b.slice(0, 2).map(e => e.name)).toEqual(['Cycling', 'Incline Walk']);
    });
  });
});

describe('applyWeeklySwaps', () => {
  const push = ex('Bench Press', 'Overhead Press (Dumbbell)', 'Incline Dumbbell Press', 'Cable Fly', 'Triceps Pushdown');

  it('beginner: 1 swap, the first exercise never swaps', () => {
    const beginnerA = ex('Goblet Squat', 'Push-up', 'Dumbbell Row', 'Plank');
    runs(6).forEach(priorRuns => {
      const out = applyWeeklySwaps({ programName: 'Beginner Full Body A', exercises: beginnerA, level: 'beginner', category: 'gym', priorRuns });
      expect(out.filter(e => e.swappedFrom)).toHaveLength(1);
      expect(out[0].name).toBe('Goblet Squat');
    });
  });

  it('beginner: never swaps to a harder variation (no Wide Grip, Lunge or Decline for a beginner)', () => {
    const programs = [
      ex('Goblet Squat', 'Push-up', 'Dumbbell Row', 'Plank'),
      ex('Leg Press', 'Chest Press (Machine)', 'Seated Row (Machine)', 'Dead Bug'),
      ex('Squat', 'Push Up', 'Glute Bridge', 'Bird dog', 'Superman')
    ];
    const harder = /wide grip|decline|deficit|diamond|lunge|step-up|jump|plyometric/i;
    runs(12).forEach(priorRuns => programs.forEach(list => ['gym', 'home'].forEach(category => {
      applyWeeklySwaps({ programName: 'Beginner Full Body', exercises: list, level: 'beginner', category, priorRuns })
        .filter(e => e.swappedFrom)
        .forEach(e => expect(e.name).not.toMatch(harder));
    })));
  });

  it('intermediate: 2 swaps; the swapped ones keep sets/reps and say what they replace', () => {
    const out = applyWeeklySwaps({ programName: 'Intermediate Push', exercises: push, level: 'intermediate', category: 'gym', priorRuns: 1 });
    const swapped = out.filter(e => e.swappedFrom);
    expect(swapped).toHaveLength(2);
    swapped.forEach(e => {
      expect(SWAP_ALTERNATIVES.gym[e.swappedFrom.toLowerCase()]).toContain(e.name);
      expect(e).toMatchObject({ sets: 3, reps: '10' });
    });
    expect(out[0].name).toBe('Bench Press');
  });

  it("a swap-in drops the original's library id; unswapped ones keep theirs", () => {
    const linked = push.map((e, i) => ({ ...e, exerciseId: `00000000-0000-4000-8000-00000000000${i}` }));
    const out = applyWeeklySwaps({ programName: 'Intermediate Push', exercises: linked, level: 'intermediate', category: 'gym', priorRuns: 1 });
    expect(out.some(e => e.swappedFrom)).toBe(true);
    out.forEach((e, i) => {
      if (e.swappedFrom) expect(e).not.toHaveProperty('exerciseId');
      else expect(e.exerciseId).toBe(linked[i].exerciseId);
    });
  });

  it('advanced strength: 1 swap, only among the last exercises', () => {
    const strength = ex('Bench Press', 'Incline Barbell Press', 'Overhead Press (Barbell)', 'Close Grip Bench Press', 'Cable Overhead Triceps Extension');
    runs(6).forEach(priorRuns => {
      const out = applyWeeklySwaps({ programName: 'Advanced Push (Strength)', exercises: strength, level: 'advanced', category: 'gym', priorRuns });
      expect(out.slice(0, 3).map(e => e.name)).toEqual(['Bench Press', 'Incline Barbell Press', 'Overhead Press (Barbell)']);
      expect(out.filter(e => e.swappedFrom)).toHaveLength(1);
    });
  });

  it('core / conditioning days can swap any exercise (no main lift)', () => {
    const cond = ex('Burpee', 'High Knees', 'Jumping Jack', 'Mountain Climber', 'Foot Fires');
    const swappedPositions = new Set();
    runs(6).forEach(priorRuns => {
      applyWeeklySwaps({ programName: 'Home Advanced Conditioning', exercises: cond, level: 'advanced', category: 'home', priorRuns })
        .forEach((e, i) => e.swappedFrom && swappedPositions.add(i));
    });
    expect(swappedPositions.has(0)).toBe(true);
  });

  it('changes run to run, and every original exercise keeps coming back', () => {
    const plans = runs(4).map(priorRuns => applyWeeklySwaps({ programName: 'Intermediate Push', exercises: push, level: 'intermediate', category: 'gym', priorRuns }).map(e => e.name).join('|'));
    expect(plans[1]).not.toBe(plans[0]);
    const swappedEver = new Set();
    runs(4).forEach(priorRuns => applyWeeklySwaps({ programName: 'Intermediate Push', exercises: push, level: 'intermediate', category: 'gym', priorRuns })
      .forEach(e => e.swappedFrom && swappedEver.add(e.swappedFrom)));
    expect(swappedEver).toEqual(new Set(['Overhead Press (Dumbbell)', 'Incline Dumbbell Press', 'Cable Fly', 'Triceps Pushdown']));
  });

  it('depends only on the run count, not the calendar', () => {
    const a = applyWeeklySwaps({ programName: 'Intermediate Push', exercises: push, level: 'intermediate', category: 'gym', priorRuns: 3 });
    const b = applyWeeklySwaps({ programName: 'Intermediate Push', exercises: push, level: 'intermediate', category: 'gym', priorRuns: 3 });
    expect(b).toEqual(a);
  });

  it('home programs only get equipment-free alternatives', () => {
    const homeUpper = ex('Push Up', 'Diamond Push-up', 'Explosive / Plyometric Push-Up', 'Superman', 'Plank');
    runs(8).forEach(priorRuns => {
      applyWeeklySwaps({ programName: 'Home Intermediate Upper Body', exercises: homeUpper, level: 'intermediate', category: 'home', priorRuns })
        .filter(e => e.swappedFrom)
        .forEach(e => expect(SWAP_ALTERNATIVES.home[e.swappedFrom.toLowerCase()]).toContain(e.name));
    });
  });

  it('never creates a duplicate exercise in the session', () => {
    // Pull-up's first alternative is Lat Pulldown; Lat Pulldown's last is Pull-up.
    const both = ex('Barbell Row', 'Lat Pulldown', 'Pull-up');
    runs(10).forEach(priorRuns => {
      const names = applyWeeklySwaps({ programName: 'Pull', exercises: both, level: 'intermediate', category: 'gym', priorRuns }).map(e => e.name.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
    });
  });

  it('leaves non-library templates alone', () => {
    expect(applyWeeklySwaps({ programName: 'Push Day', exercises: push, level: null, category: 'gym', priorRuns: 1 })).toEqual(push);
  });

  it('the first time a program is done it is the plain program', () => {
    expect(applyWeeklySwaps({ programName: 'Intermediate Push', exercises: push, level: 'intermediate', category: 'gym', priorRuns: 0 })).toEqual(push);
    expect(applyWeeklySwaps({ programName: 'Intermediate Push', exercises: push, level: 'intermediate', category: 'gym' })).toEqual(push);
  });
});

describe('countPriorRuns', () => {
  const TODAY = new Date(2026, 10, 9); // Mon 9 Nov
  const row = (log_date, plan_name) => ({ log_date, plan_name });

  it('counts earlier days that program was done, one per day', () => {
    const logs = [
      row('2026-10-30', 'Beginner Full Body A'), row('2026-10-30', 'Beginner Full Body A'),
      row('2026-11-02', 'beginner full body a '), row('2026-11-03', 'Beginner Full Body B')
    ];
    expect(countPriorRuns(logs, 'Beginner Full Body A', TODAY)).toBe(2);
    expect(countPriorRuns(logs, 'Beginner Full Body B', TODAY)).toBe(1);
  });

  it('a program never done counts 0, however long ago they started (picks up where they left)', () => {
    const logs = [row('2026-10-30', 'Beginner Full Body A')];
    expect(countPriorRuns(logs, 'Beginner Full Body B', TODAY)).toBe(0);
  });

  it("today's own session does not count, so reopening it keeps the same plan", () => {
    expect(countPriorRuns([row('2026-11-09', 'Beginner Full Body A')], 'Beginner Full Body A', TODAY)).toBe(0);
  });

  it('ignores blank or malformed rows', () => {
    expect(countPriorRuns([null, row('', 'X'), row('yesterday', 'X'), row('2026-10-01', '')], 'X', TODAY)).toBe(0);
    expect(countPriorRuns(undefined, 'X', TODAY)).toBe(0);
  });
});
