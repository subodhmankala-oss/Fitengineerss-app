import { describe, it, expect } from 'vitest';
import { buildSessionRecap, noteFirstName, buildQuickReplies, splitLogRowsForRecap } from './coachNoteRecap';

const prior = [{
  date: '2026-11-10',
  exercises: [{ name: 'Bench Press', sets: [{ reps: 8, weight: 60 }, { reps: 8, weight: 60 }] }],
}];

describe('buildSessionRecap', () => {
  it('flags a PR only when beating an earlier best', () => {
    const [bench, squat] = buildSessionRecap([
      { name: 'Bench Press', sets: [{ reps: 5, weight: 62.5 }, { reps: 5, weight: 60 }] },
      { name: 'Squat', sets: [{ reps: 5, weight: 100 }] },
    ], prior);
    expect(bench.isPR).toBe(true);
    expect(bench.prWeight).toBe('62.5 kg');
    expect(bench.reply).toContain('PR');
    expect(bench.detail).toBe('2 × 5 · 62.5 kg');
    expect(squat.isPR).toBe(false); // first time logged — not a PR
  });

  it('ignores warm-ups for the PR and empty sets entirely', () => {
    const [bench] = buildSessionRecap([
      { name: 'Bench Press', sets: [{ reps: 5, weight: 80, isWarmup: true }, { reps: 8, weight: 55 }] },
    ], prior);
    expect(bench.isPR).toBe(false);
    const [empty] = buildSessionRecap([{ name: 'Dips', sets: [{ reps: '', weight: '' }] }], prior);
    expect(empty.status).toBe('skipped');
    expect(empty.reply).toContain('skipped');
  });

  it('live: only ticked sets count; untouched exercises are todo', () => {
    const [row, back] = buildSessionRecap([
      { name: 'Barbell Row', sets: [{ reps: 10, weight: 40, isCompleted: true }, { reps: 10, weight: 40 }] },
      { name: 'Lower Back', sets: [{ reps: 12, weight: 0 }] },
    ], [], { live: true });
    expect(row.status).toBe('done');
    expect(row.detail).toBe('1 × 10 · 40 kg');
    expect(back.status).toBe('todo');
    expect(back.reply).toContain('next time');
  });
});

describe('noteFirstName', () => {
  it('keeps real first names and drops usernames', () => {
    expect(noteFirstName('Saurav Kumar')).toBe('Saurav');
    expect(noteFirstName('gk.goginenikiran')).toBe(null);
    expect(noteFirstName('kiran_92')).toBe(null);
    expect(noteFirstName('')).toBe(null);
  });
});

describe('buildQuickReplies', () => {
  it('uses the stat phrase and name when known, no emoji', () => {
    const [first] = buildQuickReplies('Saurav', '43 min and 143 kcal');
    expect(first.text).toBe('Great session, Saurav! 43 min and 143 kcal — solid work.');
    const [noName] = buildQuickReplies(null, '');
    expect(noName.text).toBe('Great work today! Really solid session.');
    buildQuickReplies('A', 'x').forEach(r => expect(r.text).not.toMatch(/\p{Extended_Pictographic}/u));
  });
});

describe('splitLogRowsForRecap', () => {
  it('splits the newest session from earlier ones and feeds the PR check', () => {
    const rows = [
      { log_date: '2026-11-17', exercise_name: 'Bench Press', set_number: 2, reps: 5, weight_kg: 62.5 },
      { log_date: '2026-11-17', exercise_name: 'Bench Press', set_number: 1, reps: 5, weight_kg: 60 },
      { log_date: '2026-11-10', exercise_name: 'Bench Press', set_number: 1, reps: 8, weight_kg: 60 },
    ];
    const s = splitLogRowsForRecap(rows);
    expect(s.latestDate).toBe('2026-11-17');
    expect(s.exercises[0].sets.map(x => x.weight)).toEqual([60, 62.5]);
    expect(s.latestRows).toHaveLength(2);
    expect(s.priorSessions).toHaveLength(1);
    const [bench] = buildSessionRecap(s.exercises, s.priorSessions);
    expect(bench.isPR).toBe(true);
  });
  it('handles no rows', () => {
    expect(splitLogRowsForRecap([])).toMatchObject({ latestDate: null, exercises: [], priorSessions: [] });
  });
});
