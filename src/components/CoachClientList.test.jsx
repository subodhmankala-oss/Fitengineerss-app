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

  it('does not repeat a goal picked twice', () => {
    const { container } = renderList([
      { ...base, id: 'c1', userName: 'Priya Rao', userGoal: 'Fat Loss', userSecondaryGoal: 'Fat Loss' },
    ]);
    expect(container.querySelectorAll('.ccl-goal')).toHaveLength(1);
  });
});
