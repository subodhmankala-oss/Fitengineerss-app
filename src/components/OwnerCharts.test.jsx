// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { WeeklyBars } from './OwnerCharts';

const labels = ['5 Sep', '12 Sep', '19 Sep', '26 Sep'];
const ranges = ['5–11 Sep', '12–18 Sep', '19–25 Sep', '26 Sep – 2 Oct'];

describe('WeeklyBars', () => {
  afterEach(cleanup);

  it('puts a number on every bar that has workouts, so nothing is a mystery', () => {
    const { container } = render(<WeeklyBars values={[0, 2, 1, 3]} labels={labels} ranges={ranges} unit="workouts" />);
    const group = screen.getByRole('group');
    const numbers = Array.from(group.querySelectorAll('button span')).map((s) => s.textContent).filter((t) => /^\d+$/.test(t));
    expect(numbers).toEqual(['2', '1', '3']); // the empty week gets none
    expect(container.textContent).toContain('Each bar is one week, labelled by its first day.');
  });

  it('describes each bar with its week range and a correct plural', () => {
    render(<WeeklyBars values={[0, 2, 1, 3]} labels={labels} ranges={ranges} unit="workouts" secondary={[0, 2, 1, 2]} secondaryUnit="members" />);
    expect(screen.getByRole('button', { name: '12–18 Sep: 2 workouts, 2 members' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '19–25 Sep: 1 workout, 1 member' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '5–11 Sep: 0 workouts, 0 members' })).toBeTruthy();
  });

  it('the readout starts on the latest week and follows the tapped bar', () => {
    render(<WeeklyBars values={[0, 2, 1, 3]} labels={labels} ranges={ranges} unit="workouts" />);
    const readout = screen.getByText('26 Sep – 2 Oct').parentElement;
    expect(readout.textContent).toBe('26 Sep – 2 Oct · 3 workouts');
    fireEvent.click(screen.getByRole('button', { name: /^19–25 Sep/ }));
    expect(screen.getByText('19–25 Sep').parentElement.textContent).toBe('19–25 Sep · 1 workout'); // not "1 workouts"
  });

  it('weeks before the member joined read as such, not as zeros', () => {
    const { container } = render(<WeeklyBars values={[0, 0, 1, 3]} labels={labels} ranges={ranges} unit="workouts" beforeCount={2} />);
    expect(screen.getByRole('button', { name: '5–11 Sep: before they joined' })).toBeTruthy();
    expect(container.textContent).toContain('A dotted line means they hadn’t joined yet.');
    fireEvent.click(screen.getByRole('button', { name: '12–18 Sep: before they joined' }));
    expect(screen.getByText('12–18 Sep').parentElement.textContent).toBe('12–18 Sep · Before they joined');
    // no number on a before-joining bar
    const numbers = Array.from(screen.getByRole('group').querySelectorAll('button span')).map((s) => s.textContent).filter((t) => /^\d+$/.test(t));
    expect(numbers).toEqual(['1', '3']);
  });

  it('the table lists each week as a range with its workouts', () => {
    render(<WeeklyBars values={[0, 2, 1, 3]} labels={labels} ranges={ranges} unit="workouts" beforeCount={1} />);
    fireEvent.click(screen.getByText('Show as table'));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Week')).toBeTruthy();
    expect(within(table).getByText('Workouts')).toBeTruthy();
    expect(within(table).getByText('Before they joined')).toBeTruthy();
    expect(within(table).getByText('12–18 Sep').nextSibling.textContent).toBe('2');
  });
});
