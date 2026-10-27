// Typing a cardio time fills KM (like the logger), until the user types KM.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AddMissedExercisesModal from './AddMissedExercisesModal';

vi.mock('./ExercisePickerModal', () => ({
  default: ({ open, onAdd }) => (open ? <button onClick={() => onAdd('Cycling')}>pick cycling</button> : null)
}));

describe('AddMissedExercisesModal cardio KM', () => {
  it('fills KM from the typed time, and stops once KM is typed by hand', () => {
    const props = { onClose: () => {}, onSave: async () => {}, planName: 'Leg day', dateLabel: 'Today' };
    const { rerender } = render(<AddMissedExercisesModal open={false} {...props} />);
    rerender(<AddMissedExercisesModal open {...props} />);
    fireEvent.click(screen.getByText('pick cycling'));
    const km = screen.getByLabelText('Cycling set 1 km');
    const time = screen.getByLabelText('Cycling set 1 time');
    fireEvent.change(time, { target: { value: '0500' } });
    expect(time.value).toBe('05:00');
    expect(Number(km.value)).toBeGreaterThan(0);

    fireEvent.change(km, { target: { value: '3' } });
    fireEvent.change(time, { target: { value: '1000' } });
    expect(km.value).toBe('3');
  });
});

describe('AddMissedExercisesModal PREV hints', () => {
  it('fills an empty box from last time when tapped', () => {
    const history = [{ log_date: '2026-10-24', exercise_name: 'Cycling', set_number: 1, distance_km: 4, cardio_duration_seconds: 600, reps: 0, weight_kg: 0 }];
    const props = { onClose: () => {}, onSave: async () => {}, planName: 'Leg day', dateLabel: 'Today', logDate: '2026-10-27', history };
    const { rerender } = render(<AddMissedExercisesModal open={false} {...props} />);
    rerender(<AddMissedExercisesModal open {...props} />);
    fireEvent.click(screen.getAllByText('pick cycling').at(-1));
    expect(screen.getByText('4km · 10:00')).toBeTruthy();
    const km = screen.getAllByLabelText('Cycling set 1 km').at(-1);
    expect(km.value).toBe('');
    fireEvent.focus(km);
    expect(km.value).toBe('4');
  });
});
