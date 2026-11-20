import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import WarmupMoveRow from './WarmupMoveRow';

const ex = { name: 'Leg Swing', sets: [{ reps: '10', isCompleted: false, isWarmup: true }] };
const noop = () => {};
const props = { ex, onShowFormGuide: noop, onRepsChange: noop, onTick: noop };
const WHY = 'Leg day. Leg swings open your hips.';

describe('WarmupMoveRow reason line', () => {
  afterEach(cleanup);

  it('shows the reason under the last warm-up row', () => {
    render(<WarmupMoveRow {...props} isFirst isLast why={WHY} />);
    expect(screen.getByText(WHY)).toBeTruthy();
  });

  it('leaves it off rows that are not last', () => {
    render(<WarmupMoveRow {...props} isFirst isLast={false} why={WHY} />);
    expect(screen.queryByText(WHY)).toBeNull();
  });

  it('shows nothing without a reason (library warm-ups)', () => {
    const { container } = render(<WarmupMoveRow {...props} isFirst isLast />);
    expect(container.querySelector('.warmup-move-why')).toBeNull();
  });
});
