import { describe, it, expect } from 'vitest';
import { workoutNameParts, workoutNameTags } from './workoutNameParts';

const read = (title) => {
  const p = workoutNameParts(title);
  return [p.name, ...workoutNameTags(p).map(t => t.text)];
};

// Real names coaches have typed.
describe('workoutNameParts', () => {
  it.each([
    ['Intermediate Push', ['Push', 'Intermediate']],
    ['Beginner Full Body A', ['Full Body A', 'Beginner']],
    ['Beginner Lower & Core', ['Lower & Core', 'Beginner']],
    ['Advanced Push (Strength)', ['Push (Strength)', 'Advanced']],
    ['Upper Body(Week-2)', ['Upper Body', 'Week 2']],
    ['Leg day (week-2)', ['Leg day', 'Week 2']],
    ['Leg day (week -10)', ['Leg day', 'Week 10']],
    ['Leg day ( week-6)', ['Leg day', 'Week 6']],
    ['Whole Body (week-4', ['Whole Body', 'Week 4']],
    ['Upper Body(week-1) nov', ['Upper Body', 'Nov Week 1']],
    ['Leg day (oct-w3)', ['Leg day', 'Oct Week 3']],
    ['Legs(Oct w3)', ['Legs', 'Oct Week 3']],
    ['WB(Oct w3', ['WB', 'Oct Week 3']],
    ['UB Oct w4', ['UB', 'Oct Week 4']],
    ['UB Oct(week3)', ['UB', 'Oct Week 3']],
    ['Upper sept-(week2)', ['Upper', 'Sept Week 2']],
    ['Whole Body(oct- w1) ', ['Whole Body', 'Oct Week 1']],
    ['Cricket drills workout(week-2)', ['Cricket drills workout', 'Week 2']],
    ['Whole Body Day11', ['Whole Body', 'Day 11']],
    ['Conditioning day 8', ['Conditioning', 'Day 8']],
    ['Cardio-day1', ['Cardio', 'Day 1']],
    ['Stength & Conditioning phase 2', ['Stength & Conditioning', 'Phase 2']],
    ['Cardio level 1', ['Cardio', 'Level 1']],
    ['Full Body Strength and Conditioning for Beginners Week Three Session Two',
      ['Full Body Strength and Conditioning', 'Beginner', 'Week 3', 'Session 2']],
  ])('%s', (title, expected) => expect(read(title)).toEqual(expected));

  it.each([
    'Leg Day', 'Custom Session', 'Fat Burn session', 'End‑of‑Week Cardio Mix', 'LCW4', 'Strength and Conditioning',
    'Legs – Quads, Hamstrings, Glutes, Calves', 'Body Weight (Strength & Conditioning)', 'Upper B – Chest, Back & Rehab Shoulders',
  ])('leaves "%s" as it is', (title) => expect(read(title)).toEqual([title]));

  it('never leaves a workout without a name', () => {
    expect(read('Week 2')).toEqual(['Week 2']);
    expect(read('Beginner')).toEqual(['Beginner']);
    expect(read('')).toEqual(['']);
  });
});
