import { describe, it, expect } from 'vitest';
import { pickNextBeginnerProgram, determineWorkoutGuidance } from './beginnerGuidance';

const programs = [
  { name: 'Beginner Full Body A' },
  { name: 'Beginner Full Body B' },
  { name: 'Beginner Lower & Core' }
];

describe('pickNextBeginnerProgram', () => {
  it('returns null when there are no beginner programs', () => {
    expect(pickNextBeginnerProgram([], [])).toBeNull();
    expect(pickNextBeginnerProgram(null, [])).toBeNull();
  });

  it('suggests the first program for a client with no sessions at all', () => {
    const result = pickNextBeginnerProgram(programs, []);
    expect(result.program).toBe(programs[0]);
    expect(result.reason).toBe('no-sessions');
  });

  it('suggests the first program when no logged session matches a beginner program', () => {
    const sessions = [{ date: '2026-09-01', planName: 'Custom Routine' }];
    const result = pickNextBeginnerProgram(programs, sessions);
    expect(result.program).toBe(programs[0]);
    expect(result.reason).toBe('no-beginner-session');
  });

  it('suggests the next program in rotation after the most recent match', () => {
    const sessions = [
      { date: '2026-09-01', planName: 'Beginner Full Body A' },
      { date: '2026-09-05', planName: 'Beginner Full Body B' }
    ];
    const result = pickNextBeginnerProgram(programs, sessions);
    expect(result.program).toBe(programs[2]); // Lower & Core, after Full Body B
    expect(result.reason).toBe('rotation');
    expect(result.lastProgram).toBe(programs[1]);
  });

  it('wraps back to the first program after the last one', () => {
    const sessions = [{ date: '2026-09-05', planName: 'Beginner Lower & Core' }];
    const result = pickNextBeginnerProgram(programs, sessions);
    expect(result.program).toBe(programs[0]);
  });

  it('matches regardless of spacing/case differences', () => {
    const sessions = [{ date: '2026-09-05', planName: 'beginner full body a' }];
    const result = pickNextBeginnerProgram(programs, sessions);
    expect(result.program).toBe(programs[1]);
  });

  it('only considers the most recent match, ignoring unsorted input order', () => {
    const sessions = [
      { date: '2026-09-05', planName: 'Beginner Full Body B' },
      { date: '2026-09-01', planName: 'Beginner Full Body A' }
    ];
    const result = pickNextBeginnerProgram(programs, sessions);
    expect(result.program).toBe(programs[2]);
  });
});

describe('determineWorkoutGuidance', () => {
  const gymBeginner = [{ name: 'Gym Beginner A' }, { name: 'Gym Beginner B' }, { name: 'Gym Beginner C' }];
  const gymIntermediate = [{ name: 'Gym Intermediate A' }, { name: 'Gym Intermediate B' }];
  const gymAdvanced = [{ name: 'Gym Advanced A' }, { name: 'Gym Advanced B' }];
  const homeBeginner = [{ name: 'Home Beginner A' }, { name: 'Home Beginner B' }, { name: 'Home Beginner C' }];
  const homeIntermediate = [{ name: 'Home Intermediate A' }, { name: 'Home Intermediate B' }];
  const homeAdvanced = [{ name: 'Home Advanced A' }, { name: 'Home Advanced B' }];

  const library = {
    gym: { beginner: gymBeginner, intermediate: gymIntermediate, advanced: gymAdvanced },
    home: { beginner: homeBeginner, intermediate: homeIntermediate, advanced: homeAdvanced }
  };

  // Fixed reference point for every time-based test below — never the real
  // wall clock, so these can't drift or flake as actual time passes.
  const NOW = new Date('2026-12-01T00:00:00').getTime();
  const daysBeforeNow = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const ONE_LEVEL_WEEKS = 12; // must match WEEKS_PER_LEVEL in beginnerGuidance.js

  it('returns null when neither category has any programs', () => {
    expect(determineWorkoutGuidance({ gym: {}, home: {} }, [], NOW)).toBeNull();
  });

  it('defaults to Gym Beginner for a client with zero sessions', () => {
    const result = determineWorkoutGuidance(library, [], NOW);
    expect(result.category).toBe('gym');
    expect(result.level).toBe('beginner');
    expect(result.program).toBe(gymBeginner[0]);
    expect(result.reason).toBe('no-sessions');
  });

  it('defaults to Gym Beginner when sessions exist but match nothing', () => {
    const sessions = [{ date: daysBeforeNow(5), planName: 'Custom Routine' }];
    const result = determineWorkoutGuidance(library, sessions, NOW);
    expect(result.category).toBe('gym');
    expect(result.level).toBe('beginner');
    expect(result.reason).toBe('no-beginner-session');
  });

  it('follows the client into Home once that is where their activity is', () => {
    const sessions = [{ date: daysBeforeNow(5), planName: 'Home Beginner A' }];
    const result = determineWorkoutGuidance(library, sessions, NOW);
    expect(result.category).toBe('home');
    expect(result.level).toBe('beginner');
    expect(result.program).toBe(homeBeginner[1]);
    expect(result.reason).toBe('rotation');
  });

  it('stays on Beginner for the first ~3 months regardless of how many programs were done', () => {
    const sessions = [
      { date: daysBeforeNow(70), planName: 'Gym Beginner A' }, // 10 weeks — comfortably under the 12-week boundary
      { date: daysBeforeNow(5), planName: 'Gym Beginner C' }
    ];
    const result = determineWorkoutGuidance(library, sessions, NOW);
    expect(result.level).toBe('beginner');
  });

  it('levels up to Intermediate once ~3 months have passed since the first-ever session, even with zero Intermediate activity', () => {
    const sessions = [
      { date: daysBeforeNow(ONE_LEVEL_WEEKS * 7 + 7), planName: 'Custom Routine' } // 13 weeks — comfortably past 3 months, never did a named Beginner program
    ];
    const result = determineWorkoutGuidance(library, sessions, NOW);
    expect(result.category).toBe('gym');
    expect(result.level).toBe('intermediate');
    expect(result.program).toBe(gymIntermediate[0]);
    expect(result.reason).toBe('leveled-up');
  });

  it('continues rotating within Intermediate once something has been logged there', () => {
    const sessions = [
      { date: daysBeforeNow(ONE_LEVEL_WEEKS * 7 + 30), planName: 'Gym Beginner A' }, // first-ever session, well past 3 months ago
      { date: daysBeforeNow(5), planName: 'Gym Intermediate A' }
    ];
    const result = determineWorkoutGuidance(library, sessions, NOW);
    expect(result.level).toBe('intermediate');
    expect(result.program).toBe(gymIntermediate[1]);
    expect(result.reason).toBe('rotation');
  });

  it('levels up to Advanced once ~6 months have passed since the first-ever session', () => {
    const sessions = [
      { date: daysBeforeNow(ONE_LEVEL_WEEKS * 2 * 7 + 7), planName: 'Gym Beginner A' } // 25 weeks — comfortably past 6 months
    ];
    const result = determineWorkoutGuidance(library, sessions, NOW);
    expect(result.level).toBe('advanced');
    expect(result.reason).toBe('leveled-up');
    expect(result.program).toBe(gymAdvanced[0]);
  });

  it('keeps rotating Advanced forever well past 6 months too (no higher level to reach)', () => {
    const sessions = [
      { date: daysBeforeNow(400), planName: 'Gym Beginner A' }, // over a year ago
      { date: daysBeforeNow(5), planName: 'Gym Advanced B' }
    ];
    const result = determineWorkoutGuidance(library, sessions, NOW);
    expect(result.level).toBe('advanced');
    expect(result.reason).toBe('rotation');
    expect(result.program).toBe(gymAdvanced[0]); // wraps back to the first
  });

  it('never drags a client back to Beginner if they already have Advanced history, even on day one of their tenure', () => {
    // Their only-ever session, logged today — tenure alone says Beginner
    // (0 weeks in), but they already did a named Advanced program (e.g. a
    // coach assigned it), so the floor rule takes over instead.
    const sessions = [{ date: daysBeforeNow(0), planName: 'Gym Advanced A' }];
    const result = determineWorkoutGuidance(library, sessions, NOW);
    expect(result.category).toBe('gym');
    expect(result.level).toBe('advanced');
    expect(result.program).toBe(gymAdvanced[1]);
    expect(result.reason).toBe('rotation');
  });

  it('tracks Gym and Home progress independently and leads with whichever has more activity', () => {
    const sessions = [
      { date: daysBeforeNow(10), planName: 'Gym Beginner A' },
      { date: daysBeforeNow(9), planName: 'Home Beginner A' },
      { date: daysBeforeNow(5), planName: 'Home Beginner B' }
    ];
    const result = determineWorkoutGuidance(library, sessions, NOW);
    expect(result.category).toBe('home'); // 2 home sessions vs 1 gym
    expect(result.program).toBe(homeBeginner[2]);
  });
});
