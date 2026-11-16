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

describe('MuscleGapHint variant="list" (coach Live tab)', () => {
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('shows the 3 furthest-behind muscles, opens a row to add its exercise, and See all shows the rest', () => {
    const onAdd = vi.fn();
    render(<MuscleGapHint variant="list" logs={logs} onAdd={onAdd} onOpenMuscleMap={() => {}} />);
    expect(screen.getByText('Still to train this week')).toBeTruthy();
    const rows = () => document.querySelectorAll('.muscle-gap-row');
    expect(rows().length).toBe(3);

    // Nothing to add until a row is opened.
    expect(document.querySelector('.muscle-gap-row-add')).toBeNull();
    fireEvent.click(rows()[0].querySelector('.muscle-gap-row-main'));
    const chip = document.querySelector('.muscle-gap-row-add button');
    expect(chip).toBeTruthy();
    fireEvent.click(chip);
    expect(onAdd).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /See all \d+/ }));
    expect(rows().length).toBeGreaterThan(3);
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
  });
});
