// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import WorkoutHeadLine from './WorkoutHeadLine';

const groups = [
  { label: 'Coach assigned', items: [] },
  { label: 'Push / Pull / Legs', items: [{ id: 'core:push', name: 'Push Day' }] },
  { label: 'Recent workouts', items: [{ id: 'r1', name: 'Arms Blast', meta: '20 Nov' }] },
];

function Host({ initial = '', initialSheet = null, ...props }) {
  const [name, setName] = useState(initial);
  const [sheet, setSheet] = useState(initialSheet);
  return (
    <WorkoutHeadLine name={name} onNameChange={setName} date="2026-11-23" onDateChange={() => {}}
      groups={groups} onPick={() => {}} sheet={sheet} onSheet={setSheet} {...props} />
  );
}

describe('WorkoutHeadLine', () => {
  afterEach(cleanup);

  it('shows the name and date, and opens the sheet with only the groups that have plans', () => {
    render(<Host initial="Push Day" />);
    const line = screen.getByTestId('workout-head');
    expect(line.textContent).toContain('Push Day');
    expect(line.textContent).toContain('Mon 23 Nov');
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByTitle('Name and plans'));
    const sheet = screen.getByRole('dialog', { name: 'Workout name and plans' });
    expect(sheet.textContent).not.toContain('Coach assigned');
    expect(sheet.textContent).toContain('Arms Blast');
    fireEvent.change(screen.getByLabelText('Workout name'), { target: { value: 'Chest' } });
    fireEvent.click(screen.getByText('Done'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(line.textContent).toContain('Chest');
  });

  it('lets any name be typed: clears the old one, and starts typing when there is none', () => {
    render(<Host initial="Push Day" />);
    fireEvent.click(screen.getByTitle('Name and plans'));
    const box = screen.getByLabelText('Workout name');
    expect(document.activeElement).not.toBe(box); // has a name: plans stay in view
    fireEvent.click(screen.getByLabelText('Clear name'));
    expect(box.value).toBe('');
    expect(document.activeElement).toBe(box);
    fireEvent.change(box, { target: { value: 'Riya glutes + core' } });
    fireEvent.click(screen.getByText('Done'));
    expect(screen.getByTestId('workout-head').textContent).toContain('Riya glutes + core');
    cleanup();

    render(<Host />);
    fireEvent.click(screen.getByTitle('Name and plans'));
    expect(document.activeElement?.id).toBe('workoutNameInputTop');
  });

  it('loads a plan on one tap, or on a second tap once sets are ticked', () => {
    const onPick = vi.fn();
    const { rerender } = render(<Host initialSheet="open" onPick={onPick} />);
    fireEvent.click(screen.getByText('Arms Blast'));
    expect(onPick).toHaveBeenCalledWith('r1');
    expect(screen.queryByRole('dialog')).toBeNull();

    onPick.mockClear();
    rerender(<Host initialSheet="open" onPick={onPick} hasTicked />);
    fireEvent.click(screen.getByTitle('Name and plans'));
    fireEvent.click(screen.getByText('Arms Blast'));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByText(/Clears your ticked sets/)).toBeTruthy();
    fireEvent.click(screen.getByText('Arms Blast'));
    expect(onPick).toHaveBeenCalledWith('r1');
  });

  it('focuses and flags the box when Save found no name', () => {
    render(<Host initialSheet="missing" />);
    expect(document.activeElement?.id).toBe('workoutNameInputTop');
    expect(screen.getByRole('alert').textContent).toContain('Add a name');
    fireEvent.change(screen.getByLabelText('Workout name'), { target: { value: 'Legs' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('pressing Enter in the box closes the sheet without submitting the logger form', () => {
    const onSubmit = vi.fn(e => e.preventDefault());
    render(<form onSubmit={onSubmit}><Host initialSheet="open" clientName="Riya" /></form>);
    expect(screen.getByTestId('workout-head').textContent).toContain('Riya');
    fireEvent.keyDown(screen.getByLabelText('Workout name'), { key: 'Enter' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
