import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import CoachClientList from './CoachClientList';

// No vitest globals here, so unmount ourselves: otherwise React work left
// over after the last test runs once jsdom is gone ("window is not defined").
afterEach(cleanup);

const base = { email: 'x@example.com', last_login: null, coach_id: 'coach-1' };

function renderList(clients) {
  return render(
    <CoachClientList
      clients={clients}
      glances={{}}
      onOpen={() => {}}
      hasUnread={() => false}
      isNewConnection={() => false}
    />
  );
}

describe('CoachClientList goals', () => {
  it('shows both goals beside the name, main goal first, no pill', () => {
    const { container } = renderList([
      { ...base, id: 'c1', userName: 'Shubham Shetty', userGoal: 'Muscle Building', userSecondaryGoal: 'Fat Loss' },
    ]);
    const line = container.querySelector('.ccl-name-line');
    const goals = [...line.querySelectorAll('.ccl-goal')];
    expect(goals.map(g => g.textContent)).toEqual(['Muscle', 'Fat loss']);
    expect(goals.map(g => g.className)).toEqual(['ccl-goal muscle', 'ccl-goal fat']);
    expect(container.querySelector('.ccl-pill.goal')).toBeNull();
  });

  it('shows one goal when there is no second goal, and none when unset', () => {
    const { container } = renderList([
      { ...base, id: 'c1', userName: 'Rahul Kumar', userGoal: 'Gut Health', userSecondaryGoal: '' },
      { ...base, id: 'c2', userName: 'Anita Menon', userGoal: '' },
    ]);
    const lines = container.querySelectorAll('.ccl-name-line');
    expect([...lines[0].querySelectorAll('.ccl-goal')].map(g => g.textContent)).toEqual(['Gut fix']);
    expect(lines[1].querySelectorAll('.ccl-goal')).toHaveLength(0);
  });

  it('drops the "N this week" text but keeps the last-workout line for an empty week', () => {
    const g = (days, label) => ({ days, offDays: days.map(() => false), todayIndex: 2, weekCount: days.filter(Boolean).length, needsYou: false, label });
    const { container } = render(
      <CoachClientList
        clients={[
          { ...base, id: 'c1', userName: 'Priya Rao', userGoal: 'Fat Loss' },
          { ...base, id: 'c2', userName: 'Anita Menon', userGoal: '' },
        ]}
        glances={{
          c1: g([true, false, true, false, false, false, false], 'Trained today'),
          c2: g([false, false, false, false, false, false, false], 'Last workout 5 days ago'),
        }}
        onOpen={() => {}}
        hasUnread={() => false}
        isNewConnection={() => false}
      />
    );
    const rows = container.querySelectorAll('.ccl-row');
    expect(rows[0].querySelector('.ccl-sub-text')).toBeNull();
    expect(rows[0].textContent).not.toMatch(/this week/);
    expect(rows[1].querySelector('.ccl-sub-text').textContent).toBe('Last workout 5 days ago');
  });

  it('while workouts load: names and goals show, each row gets 7 pulsing day dots', () => {
    const { container } = render(
      <CoachClientList
        clients={[
          { ...base, id: 'c1', userName: 'Nagesh A', userGoal: 'Fat Loss' },
          { ...base, id: 'c2', userName: 'Vinitha Reddy', userGoal: 'Fat Loss' },
        ]}
        glances={null}
        onOpen={() => {}}
        hasUnread={() => false}
        isNewConnection={() => false}
      />
    );
    const loading = container.querySelectorAll('.ccl-week-loading');
    expect(loading).toHaveLength(2);
    expect(loading[0].querySelectorAll('.ccl-day')).toHaveLength(7);
    expect(loading[1].style.getPropertyValue('--row-delay')).toBe('0.12s');
    expect(container.textContent).toContain('Nagesh A');
    expect(container.textContent).not.toMatch(/days since last workout/);
  });

  it('does not repeat a goal picked twice', () => {
    const { container } = renderList([
      { ...base, id: 'c1', userName: 'Priya Rao', userGoal: 'Fat Loss', userSecondaryGoal: 'Fat Loss' },
    ]);
    expect(container.querySelectorAll('.ccl-goal')).toHaveLength(1);
  });
});
