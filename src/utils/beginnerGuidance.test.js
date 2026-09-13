import { describe, it, expect } from 'vitest';
import { pickNextBeginnerProgram } from './beginnerGuidance';

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
