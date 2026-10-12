import { describe, it, expect } from 'vitest';
import { WARMUP_BLOCKS, getWorkoutDayType, getWarmupWeekIndex, buildWarmupExercises } from './warmupBlocks';
import { findPreviousLoggedSetIn, findPreviousExerciseSetsIn } from './prevSets';

const ex = (...names) => names.map(name => ({ name, sets: 3, reps: '10' }));

// Every Workout Library program as it stands in workout_templates.
const LIBRARY = [
  ['Advanced Legs (Strength)', ex('Front Squat', 'Romanian Deadlift', 'Bulgarian Split Squat', 'Hack Squat', 'Seated Calf Raise'), 'lower'],
  ['Advanced Push (Strength)', ex('Bench Press', 'Incline Barbell Press', 'Overhead Press (Barbell)', 'Close Grip Bench Press', 'Cable Overhead Triceps Extension'), 'upper'],
  ['Advanced Pull (Strength)', ex('Deadlift', 'Pendlay Row', 'Pull-up', 'Barbell Shrug', 'Face Pull (Cable)'), 'upper'],
  ['Advanced Full Body Power', ex('Clean and Press', 'Front Squat', 'Push-up (Wide Grip)', 'Box Squat', 'V Up'), 'full'],
  ['Advanced Athletic Conditioning', ex('Box Jump', 'Burpee', 'Kettlebell Swing', 'Sumo Deadlift', 'Plank (Side)'), 'core'],
  ['Advanced Hypertrophy Pull', ex('Lat Pulldown (Wide Grip)', 'One Arm Dumbbell Row', 'Cable Row (Seated)', 'Rear Delt Fly (Cable)', 'EZ Bar Curl'), 'upper'],
  ['Advanced Hypertrophy Push', ex('Incline Dumbbell Press', 'Chest Dip', 'Cable Crossover', 'Lateral Raise (Cable)', 'Triceps Rope Pushdown'), 'upper'],
  ['Beginner Full Body A', ex('Goblet Squat', 'Push-up', 'Dumbbell Row', 'Plank'), 'full'],
  ['Beginner Full Body B', ex('Leg Press', 'Chest Press (Machine)', 'Seated Row (Machine)', 'Dead Bug'), 'full'],
  ['Beginner Lower & Core', ex('Dumbbell Squat', 'Glute Bridge', 'Calf Raise (Standing)', 'Crunch'), 'lower'],
  ['Intermediate Core & Conditioning', ex('Kettlebell Swing', 'Russian Twist', 'Hanging Knee Raise', 'Mountain Climber', 'Farmer Walk'), 'core'],
  ['Intermediate Upper Body', ex('Shoulder Press (Barbell)', 'Pull-up', 'Dip', 'Dumbbell Row', 'Lateral Raise'), 'upper'],
  ['Intermediate Legs', ex('Barbell Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl (Seated)', 'Calf Raise (Standing)'), 'lower'],
  ['Intermediate Pull', ex('Barbell Row', 'Lat Pulldown', 'Seated Cable Row', 'Face Pull', 'Hammer Curl'), 'upper'],
  ['Intermediate Push', ex('Bench Press', 'Overhead Press (Dumbbell)', 'Incline Dumbbell Press', 'Cable Fly', 'Triceps Pushdown'), 'upper'],
  ['Home Advanced Conditioning', ex('Burpee', 'High Knees', 'Jumping Jack', 'Mountain Climber', 'Foot Fires'), 'core'],
  ['Home Advanced Push', ex('Diamond Push-up', 'Explosive / Plyometric Push-Up', 'Deficit Push-Up', 'Push-up (Wide Grip)', 'Plank'), 'upper'],
  ['Home Advanced Legs', ex('Jump Squat', 'Bulgarian Split Squat', 'Curtsy Lunge', 'Single Leg Deadlift', 'Wall Sit'), 'lower'],
  ['Home Beginner Full Body A', ex('Squat', 'Push Up', 'Glute Bridge', 'Plank'), 'full'],
  ['Home Beginner Full Body B', ex('Split Squat', 'Incline Push-up', 'Superman', 'Dead Bug'), 'full'],
  ['Home Beginner Core & Mobility', ex('Bird dog', 'Cat camel', 'Crunch', 'Wall Sit'), 'core'],
  ['Home Intermediate Upper Body', ex('Push Up', 'Diamond Push-up', 'Explosive / Plyometric Push-Up', 'Superman', 'Plank'), 'upper'],
  ['Home Intermediate Lower Body', ex('Jump Squat', 'Bulgarian Split Squat', 'Reverse Lunge', 'Glute Bridge', 'Wall Sit'), 'lower'],
  ['Home Intermediate Core & Cardio', ex('Russian Twist', 'V Up', 'Sit Up', 'Mountain Climber', 'Burpee'), 'core'],
];

describe('getWorkoutDayType', () => {
  it.each(LIBRARY)('%s is a %s… day', (name, exercises, expected) => {
    expect(getWorkoutDayType(name, exercises)).toBe(expected);
  });

  it('falls back to full body with no exercises', () => {
    expect(getWorkoutDayType('Anything', [])).toBe('full');
  });
});

describe('getWarmupWeekIndex', () => {
  it('stays the same Monday to Sunday and moves on the next Monday', () => {
    const monday = new Date(2026, 9, 12);
    const sunday = new Date(2026, 9, 18);
    const nextMonday = new Date(2026, 9, 19);
    expect(getWarmupWeekIndex(sunday)).toBe(getWarmupWeekIndex(monday));
    expect(getWarmupWeekIndex(nextMonday)).toBe((getWarmupWeekIndex(monday) + 1) % 3);
  });

  it('cycles through all three weeks', () => {
    const seen = new Set([0, 7, 14, 21].map(d => getWarmupWeekIndex(new Date(2026, 9, 12 + d))));
    expect(seen).toEqual(new Set([0, 1, 2]));
  });
});

describe('buildWarmupExercises', () => {
  it('has 4 day types × gym/home × 3 weeks, 3 moves each', () => {
    Object.values(WARMUP_BLOCKS).forEach(byPlace => {
      ['gym', 'home'].forEach(place => {
        expect(byPlace[place]).toHaveLength(3);
        byPlace[place].forEach(block => expect(block).toHaveLength(3));
      });
    });
  });

  it("gives this week's block for the day type and place, all sets tagged warm-up", () => {
    const date = new Date(2026, 9, 12);
    const week = getWarmupWeekIndex(date);
    const [, exercises] = LIBRARY.find(([n]) => n === 'Intermediate Push');
    const out = buildWarmupExercises({ programName: 'Intermediate Push', exercises, category: 'gym', date });
    expect(out.map(e => e.name)).toEqual(WARMUP_BLOCKS.upper.gym[week].map(i => i.name));
    out.forEach(e => e.sets.forEach(s => {
      expect(s.isWarmup).toBe(true);
      expect(s.setType).toBe('warmup');
      expect(s.isCompleted).toBe(false);
    }));
  });

  it('never repeats an exercise that is already in the program', () => {
    LIBRARY.forEach(([name, exercises]) => {
      ['gym', 'home'].forEach(category => {
        [0, 7, 14].forEach(d => {
          const out = buildWarmupExercises({ programName: name, exercises, category, date: new Date(2026, 9, 12 + d) });
          const names = out.map(e => e.name.toLowerCase());
          const program = exercises.map(e => e.name.toLowerCase());
          expect(names.filter(n => program.includes(n))).toEqual([]);
          expect(new Set(names).size).toBe(names.length);
          expect(out).toHaveLength(3);
        });
      });
    });
  });

  it('swaps in a stand-in from the same area (Home Beginner Full Body A has Squat + Glute Bridge)', () => {
    const [, exercises] = LIBRARY.find(([n]) => n === 'Home Beginner Full Body A');
    // Find a week whose home full-body block uses Glute Bridge.
    const d = [0, 7, 14].find(off => WARMUP_BLOCKS.full.home[getWarmupWeekIndex(new Date(2026, 9, 12 + off))].some(i => i.name === 'Glute Bridge'));
    const out = buildWarmupExercises({ programName: 'Home Beginner Full Body A', exercises, category: 'home', date: new Date(2026, 9, 12 + d) });
    expect(out.map(e => e.name)).not.toContain('Glute Bridge');
    expect(out.map(e => e.name)).toContain('Leg Swing');
  });

  it('uses the right set shape: cardio = time target, bodyweight = BW, band moves = empty kg', () => {
    const date = [0, 7, 14].map(d => new Date(2026, 9, 12 + d)).find(dt => getWarmupWeekIndex(dt) === 0);
    const out = buildWarmupExercises({ programName: 'Intermediate Push', exercises: ex('Bench Press'), category: 'gym', date });
    const byName = Object.fromEntries(out.map(e => [e.name, e.sets[0]]));
    expect(byName['Cross Trainer']).toMatchObject({ distanceKm: '', time: '', targetTime: '04:00' });
    expect(byName['Arm Circle']).toMatchObject({ reps: '20' });
    expect(byName['Band Pull Apart']).toMatchObject({ reps: '15', weight: '' });

    const home = buildWarmupExercises({ programName: 'Intermediate Push', exercises: ex('Bench Press'), category: 'home', date });
    expect(home[0]).toMatchObject({ name: 'Jumping Jack' });
    expect(home[0].sets).toHaveLength(2);
    expect(home[0].sets[0]).toMatchObject({ reps: '30', weight: '0', bodyweightMode: true });
  });
});

describe('PREV skips warm-up-only entries', () => {
  const sessions = [
    { clientName: 'a', date: '2026-10-10', exercises: [{ name: 'Squat', sets: [{ reps: '12', weight: '0', isWarmup: true, setType: 'warmup' }] }] },
    { clientName: 'a', date: '2026-10-01', exercises: [{ name: 'Squat', sets: [{ reps: '8', weight: '20' }] }] },
  ];

  it('reads the last real working sets, not the newer warm-up', () => {
    expect(findPreviousLoggedSetIn(sessions, 'a', 'Squat', 0)).toMatchObject({ reps: '8', weight: '20' });
    expect(findPreviousExerciseSetsIn(sessions, 'a', 'Squat')).toEqual([{ reps: '8', weight: '20' }]);
  });

  it('still counts an entry that mixes warm-up and working sets', () => {
    const mixed = [{ clientName: 'a', date: '2026-10-10', exercises: [{ name: 'Squat', sets: [{ reps: '5', weight: '10', isWarmup: true }, { reps: '5', weight: '40' }] }] }];
    expect(findPreviousLoggedSetIn(mixed, 'a', 'Squat', 1)).toMatchObject({ weight: '40' });
  });
});
