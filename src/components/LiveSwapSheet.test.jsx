import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import LiveSwapSheet from './LiveSwapSheet';

afterEach(cleanup);

const catalog = [
  { name: 'Bench Press (Barbell)', muscle: 'Chest', category: 'Chest' },
  { name: 'Dumbbell Bench Press', muscle: 'Chest', category: 'Chest' },
  { name: 'Chest Press Machine', muscle: 'Chest', category: 'Chest' },
  { name: 'Seated Cable Row', muscle: 'Back', category: 'Back' }
];
const exercise = { name: 'Bench Press (Barbell)', sets: [{ reps: '8', weight: '5', isCompleted: true }, { reps: '8', weight: '5', isCompleted: false }] };

const renderSheet = (props = {}) => {
  const onSwap = vi.fn();
  const onWatch = vi.fn();
  render(
    <LiveSwapSheet
      exercise={exercise}
      catalog={catalog}
      excludeNames={[]}
      getLast={(name) => (name === 'Dumbbell Bench Press' ? '14 kg × 10' : null)}
      onWatch={onWatch}
      onSwap={onSwap}
      onClose={() => {}}
      {...props}
    />
  );
  return { onSwap, onWatch };
};

describe('LiveSwapSheet', () => {
  it('lists same-muscle options with match % and Last, best first', () => {
    renderSheet();
    const names = screen.getAllByRole('button', { pressed: false }).map(b => b.querySelector('strong')?.textContent).filter(Boolean);
    expect(names[0]).toBe('Dumbbell Bench Press');
    expect(names).not.toContain('Seated Cable Row');
    expect(screen.getByText('14 kg × 10')).toBeTruthy();
    expect(screen.getAllByText('match').length).toBe(2);
    expect(screen.getByText(/1 ticked set stays on Bench Press/)).toBeTruthy();
  });

  it('picks a row, then the bottom button names it and swaps', () => {
    const { onSwap } = renderSheet();
    const go = screen.getByRole('button', { name: 'Pick an exercise' });
    expect(go.disabled).toBe(true);
    fireEvent.click(screen.getByText('Chest Press Machine'));
    const swap = screen.getByRole('button', { name: /Swap to Chest Press Machine/ });
    fireEvent.click(swap);
    expect(onSwap).toHaveBeenCalledWith(expect.objectContaining({ name: 'Chest Press Machine' }));
  });

  it('the round icon opens the video without picking the row', () => {
    const { onWatch, onSwap } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Watch how to do Dumbbell Bench Press' }));
    expect(onWatch).toHaveBeenCalledWith(expect.objectContaining({ name: 'Dumbbell Bench Press' }));
    expect(onSwap).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pick an exercise' }).disabled).toBe(true);
  });

  it('search covers the whole library', () => {
    renderSheet();
    fireEvent.change(screen.getByPlaceholderText('Search exercises'), { target: { value: 'row' } });
    expect(screen.getByText('Seated Cable Row')).toBeTruthy();
  });
});
