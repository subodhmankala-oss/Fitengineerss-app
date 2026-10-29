import { describe, it, expect } from 'vitest';
import { applyWeeklySwaps, hasTrainedBeforeThisWeek, SWAP_ALTERNATIVES } from './weeklySwaps';
import { EXERCISE_LIBRARY, isCardioExercise } from '../data/exerciseLibrary';

const ex = (...names) => names.map(name => ({ name, sets: 3, reps: '10' }));
const known = new Set(EXERCISE_LIBRARY.map(e => e.name.toLowerCase()));
// In the shared exercises catalog, not the static library — the library
// programs themselves use these exact spellings ("Pull-up", "Push Up").
const CATALOG_ONLY = ['knee push ups', 'pull-up', 'push up'];

const MON = new Date(2026, 9, 12);
const weeks = (n) => Array.from({ length: n }, (_, i) => new Date(2026, 9, 12 + i * 7));

describe('SWAP_ALTERNATIVES', () => {
  it('only names exercises the app knows', () => {
    const missing = [];
    ['gym', 'home'].forEach(place => Object.values(SWAP_ALTERNATIVES[place]).flat().forEach(name => {
      if (!known.has(name.toLowerCase()) && !CATALOG_ONLY.includes(name.toLowerCase())) missing.push(name);
    }));
    expect(missing).toEqual([]);
  });

  it('never swaps to a cardio machine (different set shape: km + time)', () => {
    ['gym', 'home'].forEach(place => Object.values(SWAP_ALTERNATIVES[place]).flat().forEach(name => {
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
    weeks(8).forEach(date => {
      const out = applyWeeklySwaps({ programName: 'Advanced Hyrox Engine', exercises: hyrox, level: 'advanced', category: 'gym', date });
      expect(out.map(e => e.name).slice(0, 3)).toEqual(['Running', 'Sled Push', 'Air Rowing']);
      out.filter(e => e.swappedFrom).forEach(e => expect(['Farmer Walk', 'Wall Ball']).toContain(e.swappedFrom));
    });
  });

  it('a program in the Hyrox section never swaps (the stations are the point)', () => {
    const builder = ex('Running', 'SkiErg', 'Sled Push', 'Burpee Broad Jump', 'Wall Ball', 'Farmer Walk');
    weeks(8).forEach(date => {
      const out = applyWeeklySwaps({ programName: 'Hyrox Builder', exercises: builder, level: 'intermediate', category: 'hyrox', date });
      expect(out).toEqual(builder);
    });
  });

  it('the 12-3-30 walk and the Zone 2 cardio are never swapped away', () => {
    const walk = ex('Incline Walk', 'Dead Bug', 'Bird dog', 'Plank');
    const zone2 = ex('Cycling', 'Incline Walk', 'Bird dog', 'Dead Bug', 'Side Plank');
    weeks(8).forEach(date => {
      const a = applyWeeklySwaps({ programName: 'Beginner Incline Walk 12-3-30', exercises: walk, level: 'beginner', category: 'gym', date });
      expect(a[0].name).toBe('Incline Walk');
      const b = applyWeeklySwaps({ programName: 'Intermediate Zone 2 Cardio Base', exercises: zone2, level: 'intermediate', category: 'gym', date });
      expect(b.slice(0, 2).map(e => e.name)).toEqual(['Cycling', 'Incline Walk']);
    });
  });
});

describe('applyWeeklySwaps', () => {
  const push = ex('Bench Press', 'Overhead Press (Dumbbell)', 'Incline Dumbbell Press', 'Cable Fly', 'Triceps Pushdown');

  it('beginner: 1 swap, the first exercise never swaps', () => {
    const beginnerA = ex('Goblet Squat', 'Push-up', 'Dumbbell Row', 'Plank');
    weeks(6).forEach(date => {
      const out = applyWeeklySwaps({ programName: 'Beginner Full Body A', exercises: beginnerA, level: 'beginner', category: 'gym', date });
      expect(out.filter(e => e.swappedFrom)).toHaveLength(1);
      expect(out[0].name).toBe('Goblet Squat');
    });
  });

  it('intermediate: 2 swaps; the swapped ones keep sets/reps and say what they replace', () => {
    const out = applyWeeklySwaps({ programName: 'Intermediate Push', exercises: push, level: 'intermediate', category: 'gym', date: MON });
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
    const out = applyWeeklySwaps({ programName: 'Intermediate Push', exercises: linked, level: 'intermediate', category: 'gym', date: MON });
    expect(out.some(e => e.swappedFrom)).toBe(true);
    out.forEach((e, i) => {
      if (e.swappedFrom) expect(e).not.toHaveProperty('exerciseId');
      else expect(e.exerciseId).toBe(linked[i].exerciseId);
    });
  });

  it('advanced strength: 1 swap, only among the last exercises', () => {
    const strength = ex('Bench Press', 'Incline Barbell Press', 'Overhead Press (Barbell)', 'Close Grip Bench Press', 'Cable Overhead Triceps Extension');
    weeks(6).forEach(date => {
      const out = applyWeeklySwaps({ programName: 'Advanced Push (Strength)', exercises: strength, level: 'advanced', category: 'gym', date });
      expect(out.slice(0, 3).map(e => e.name)).toEqual(['Bench Press', 'Incline Barbell Press', 'Overhead Press (Barbell)']);
      expect(out.filter(e => e.swappedFrom)).toHaveLength(1);
    });
  });

  it('core / conditioning days can swap any exercise (no main lift)', () => {
    const cond = ex('Burpee', 'High Knees', 'Jumping Jack', 'Mountain Climber', 'Foot Fires');
    const swappedPositions = new Set();
    weeks(6).forEach(date => {
      applyWeeklySwaps({ programName: 'Home Advanced Conditioning', exercises: cond, level: 'advanced', category: 'home', date })
        .forEach((e, i) => e.swappedFrom && swappedPositions.add(i));
    });
    expect(swappedPositions.has(0)).toBe(true);
  });

  it('changes week to week, and every original exercise keeps coming back', () => {
    const plans = weeks(4).map(date => applyWeeklySwaps({ programName: 'Intermediate Push', exercises: push, level: 'intermediate', category: 'gym', date }).map(e => e.name).join('|'));
    expect(plans[1]).not.toBe(plans[0]);
    const swappedEver = new Set();
    weeks(4).forEach(date => applyWeeklySwaps({ programName: 'Intermediate Push', exercises: push, level: 'intermediate', category: 'gym', date })
      .forEach(e => e.swappedFrom && swappedEver.add(e.swappedFrom)));
    expect(swappedEver).toEqual(new Set(['Overhead Press (Dumbbell)', 'Incline Dumbbell Press', 'Cable Fly', 'Triceps Pushdown']));
  });

  it('is the same all week (Monday to Sunday)', () => {
    const a = applyWeeklySwaps({ programName: 'Intermediate Push', exercises: push, level: 'intermediate', category: 'gym', date: MON });
    const b = applyWeeklySwaps({ programName: 'Intermediate Push', exercises: push, level: 'intermediate', category: 'gym', date: new Date(2026, 9, 18) });
    expect(b).toEqual(a);
  });

  it('home programs only get equipment-free alternatives', () => {
    const homeUpper = ex('Push Up', 'Diamond Push-up', 'Explosive / Plyometric Push-Up', 'Superman', 'Plank');
    weeks(8).forEach(date => {
      applyWeeklySwaps({ programName: 'Home Intermediate Upper Body', exercises: homeUpper, level: 'intermediate', category: 'home', date })
        .filter(e => e.swappedFrom)
        .forEach(e => expect(SWAP_ALTERNATIVES.home[e.swappedFrom.toLowerCase()]).toContain(e.name));
    });
  });

  it('never creates a duplicate exercise in the session', () => {
    // Pull-up's first alternative is Lat Pulldown; Lat Pulldown's last is Pull-up.
    const both = ex('Barbell Row', 'Lat Pulldown', 'Pull-up');
    weeks(10).forEach(date => {
      const names = applyWeeklySwaps({ programName: 'Pull', exercises: both, level: 'intermediate', category: 'gym', date }).map(e => e.name.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
    });
  });

  it('leaves non-library templates alone', () => {
    expect(applyWeeklySwaps({ programName: 'Push Day', exercises: push, level: null, category: 'gym', date: MON })).toEqual(push);
  });

  it('gives a client who has not trained in an earlier week the plain program', () => {
    expect(applyWeeklySwaps({ programName: 'Intermediate Push', exercises: push, level: 'intermediate', category: 'gym', date: MON, trainedBefore: false })).toEqual(push);
  });
});

describe('hasTrainedBeforeThisWeek', () => {
  const WED = new Date(2026, 9, 14); // week starting Mon 12 Oct

  it('is false with no history, or only this week', () => {
    expect(hasTrainedBeforeThisWeek([], WED)).toBe(false);
    expect(hasTrainedBeforeThisWeek(undefined, WED)).toBe(false);
    expect(hasTrainedBeforeThisWeek(['2026-10-12', '2026-10-14'], WED)).toBe(false);
  });

  it('is true once a workout was logged in an earlier week', () => {
    expect(hasTrainedBeforeThisWeek(['2026-10-11'], WED)).toBe(true);
    expect(hasTrainedBeforeThisWeek(['2026-09-01T10:00:00Z', '2026-10-14'], WED)).toBe(true);
  });

  it('ignores blank or malformed dates', () => {
    expect(hasTrainedBeforeThisWeek([null, '', 'yesterday'], WED)).toBe(false);
  });
});
