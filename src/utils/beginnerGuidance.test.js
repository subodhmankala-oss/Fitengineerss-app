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

  it('returns null when neither category has any programs', () => {
    expect(determineWorkoutGuidance({ gym: {}, home: {} }, [])).toBeNull();
  });

  it('defaults to Gym Beginner for a client with zero sessions', () => {
    const result = determineWorkoutGuidance(library, []);
    expect(result.category).toBe('gym');
    expect(result.level).toBe('beginner');
    expect(result.program).toBe(gymBeginner[0]);
    expect(result.reason).toBe('no-sessions');
  });

  it('defaults to Gym Beginner when sessions exist but match nothing', () => {
    const sessions = [{ date: '2026-09-01', planName: 'Custom Routine' }];
    const result = determineWorkoutGuidance(library, sessions);
    expect(result.category).toBe('gym');
    expect(result.level).toBe('beginner');
    expect(result.reason).toBe('no-beginner-session');
  });

  it('follows the client into Home once that is where their activity is', () => {
    const sessions = [{ date: '2026-09-01', planName: 'Home Beginner A' }];
    const result = determineWorkoutGuidance(library, sessions);
    expect(result.category).toBe('home');
    expect(result.level).toBe('beginner');
    expect(result.program).toBe(homeBeginner[1]);
    expect(result.reason).toBe('rotation');
  });

  it('stays on Beginner until all 3 Beginner programs are done, regardless of order', () => {
    const sessions = [
      { date: '2026-09-01', planName: 'Gym Beginner A' },
      { date: '2026-09-05', planName: 'Gym Beginner C' }
    ];
    const result = determineWorkoutGuidance(library, sessions);
    expect(result.level).toBe('beginner');
    // Most recent match is C -> next in rotation wraps to A, not B — this
    // only verifies level stays Beginner; pickNextProgramInRotation's own
    // tests already cover the rotation order itself.
  });

  it('levels up to Intermediate once all 3 Beginner programs are cleared', () => {
    const sessions = [
      { date: '2026-09-01', planName: 'Gym Beginner A' },
      { date: '2026-09-02', planName: 'Gym Beginner B' },
      { date: '2026-09-03', planName: 'Gym Beginner C' }
    ];
    const result = determineWorkoutGuidance(library, sessions);
    expect(result.category).toBe('gym');
    expect(result.level).toBe('intermediate');
    expect(result.program).toBe(gymIntermediate[0]);
    expect(result.reason).toBe('leveled-up');
  });

  it('continues rotating within Intermediate once it has been started', () => {
    const sessions = [
      { date: '2026-09-01', planName: 'Gym Beginner A' },
      { date: '2026-09-02', planName: 'Gym Beginner B' },
      { date: '2026-09-03', planName: 'Gym Beginner C' },
      { date: '2026-09-04', planName: 'Gym Intermediate A' }
    ];
    const result = determineWorkoutGuidance(library, sessions);
    expect(result.level).toBe('intermediate');
    expect(result.program).toBe(gymIntermediate[1]);
    expect(result.reason).toBe('rotation');
  });

  it('levels up to Advanced once Beginner and Intermediate are both cleared', () => {
    const sessions = [
      { date: '2026-09-01', planName: 'Gym Beginner A' },
      { date: '2026-09-02', planName: 'Gym Beginner B' },
      { date: '2026-09-03', planName: 'Gym Beginner C' },
      { date: '2026-09-04', planName: 'Gym Intermediate A' },
      { date: '2026-09-05', planName: 'Gym Intermediate B' }
    ];
    const result = determineWorkoutGuidance(library, sessions);
    expect(result.level).toBe('advanced');
    expect(result.reason).toBe('leveled-up');
    expect(result.program).toBe(gymAdvanced[0]);
  });

  it('keeps rotating Advanced forever once fully cleared too (no higher level to reach)', () => {
    const sessions = [
      { date: '2026-09-01', planName: 'Gym Beginner A' },
      { date: '2026-09-02', planName: 'Gym Beginner B' },
      { date: '2026-09-03', planName: 'Gym Beginner C' },
      { date: '2026-09-04', planName: 'Gym Intermediate A' },
      { date: '2026-09-05', planName: 'Gym Intermediate B' },
      { date: '2026-09-06', planName: 'Gym Advanced A' },
      { date: '2026-09-07', planName: 'Gym Advanced B' }
    ];
    const result = determineWorkoutGuidance(library, sessions);
    expect(result.level).toBe('advanced');
    expect(result.reason).toBe('rotation');
    expect(result.program).toBe(gymAdvanced[0]); // wraps back to the first
  });

  it('never drags a client back to Beginner if they already have Advanced history with no Beginner/Intermediate history at all', () => {
    const sessions = [{ date: '2026-09-01', planName: 'Gym Advanced A' }];
    const result = determineWorkoutGuidance(library, sessions);
    expect(result.category).toBe('gym');
    expect(result.level).toBe('advanced');
    expect(result.program).toBe(gymAdvanced[1]);
    expect(result.reason).toBe('rotation');
  });

  it('tracks Gym and Home progress independently and leads with whichever has more activity', () => {
    const sessions = [
      { date: '2026-09-01', planName: 'Gym Beginner A' },
      { date: '2026-09-02', planName: 'Home Beginner A' },
      { date: '2026-09-03', planName: 'Home Beginner B' }
    ];
    const result = determineWorkoutGuidance(library, sessions);
    expect(result.category).toBe('home'); // 2 home sessions vs 1 gym
    expect(result.program).toBe(homeBeginner[2]);
  });
});
