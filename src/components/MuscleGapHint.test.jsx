// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import MuscleGapHint from './MuscleGapHint';

const logs = [{ exercise_name: 'Bench Press', log_date: '2000-01-01' }]; // nothing this week → everything behind

describe('MuscleGapHint', () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('folds to one line on tap and remembers it for next time', () => {
    localStorage.setItem('userId', 'u1');
    const onAdd = vi.fn();
    render(<MuscleGapHint logs={logs} onAdd={onAdd} onOpenMuscleMap={() => {}} />);
    expect(document.querySelectorAll('.muscle-gap-card').length).toBeGreaterThan(3);

    fireEvent.click(screen.getByRole('button', { name: /behind this week/ }));
    expect(document.querySelectorAll('.muscle-gap-card').length).toBe(0);
    expect(screen.queryByText('Muscle map →')).toBeNull();
    expect(screen.getByText(/behind this week/)).toBeTruthy();

    cleanup();
    render(<MuscleGapHint logs={logs} onAdd={onAdd} />);
    expect(document.querySelectorAll('.muscle-gap-card').length).toBe(0); // still folded

    fireEvent.click(screen.getByRole('button', { name: /behind this week/ }));
    expect(document.querySelectorAll('.muscle-gap-card').length).toBeGreaterThan(3);
  });

  it('folds and unfolds from the labeled Hide / Show button', () => {
    localStorage.setItem('userId', 'u2');
    render(<MuscleGapHint logs={logs} onAdd={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^Hide/ }));
    expect(document.querySelectorAll('.muscle-gap-card').length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /^Show/ }));
    expect(document.querySelectorAll('.muscle-gap-card').length).toBeGreaterThan(3);
  });
});
