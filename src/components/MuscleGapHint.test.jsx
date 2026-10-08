// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import MuscleGapHint from './MuscleGapHint';

const logs = [{ exercise_name: 'Bench Press', log_date: '2000-01-01' }]; // nothing this week → everything behind

// The body stays mounted so it can animate; folded = class + aria-hidden.
const isFolded = () => document.querySelector('.muscle-gap-hint--collapsed') !== null
  && document.querySelector('.muscle-gap-body').getAttribute('aria-hidden') === 'true';

describe('MuscleGapHint', () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('folds to one line on tap and remembers it for next time', () => {
    localStorage.setItem('userId', 'u1');
    const onAdd = vi.fn();
    render(<MuscleGapHint logs={logs} onAdd={onAdd} onOpenMuscleMap={() => {}} />);
    expect(isFolded()).toBe(false);
    expect(document.querySelectorAll('.muscle-gap-card').length).toBeGreaterThan(3);

    fireEvent.click(screen.getByRole('button', { name: /behind this week/ }));
    expect(isFolded()).toBe(true);
    expect(screen.getByText(/behind this week/)).toBeTruthy();

    cleanup();
    render(<MuscleGapHint logs={logs} onAdd={onAdd} />);
    expect(isFolded()).toBe(true); // still folded

    fireEvent.click(screen.getByRole('button', { name: /behind this week/ }));
    expect(isFolded()).toBe(false);
  });

  it('folds and unfolds from the circled arrow button', () => {
    localStorage.setItem('userId', 'u2');
    render(<MuscleGapHint logs={logs} onAdd={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide suggestions' }));
    expect(isFolded()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Show suggestions' }));
    expect(isFolded()).toBe(false);
  });
});
