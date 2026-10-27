// Edit workout sheet: change a value, remove a set, and save sends only that.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import EditSavedWorkoutModal from './EditSavedWorkoutModal';

const rows = [
  { id: 1, exercise_name: 'Bench Press', reps: 10, weight_kg: 60, created_at: '2026-10-27T10:00:00Z', session_row: 0 },
  { id: 2, exercise_name: 'Bench Press', reps: 8, weight_kg: 60, created_at: '2026-10-27T10:00:00Z', session_row: 1 }
];

function open(onSave) {
  const props = { onClose: () => {}, onSave, rows, planName: 'Push Day', dateLabel: 'Today' };
  const { rerender } = render(<EditSavedWorkoutModal open={false} {...props} />);
  rerender(<EditSavedWorkoutModal open {...props} />);
}

describe('EditSavedWorkoutModal', () => {
  it('saves only what changed', async () => {
    const onSave = vi.fn(async () => {});
    open(onSave);
    expect(screen.getByText('Save changes').disabled).toBe(true); // nothing changed yet
    expect(screen.getByLabelText('Bench Press set 1 kg').value).toBe('60'); // sets shown, not folded
    fireEvent.change(screen.getByLabelText('Bench Press set 1 kg'), { target: { value: '65' } });
    fireEvent.click(screen.getByLabelText('Remove Bench Press set 2'));
    expect(screen.getByText('2 changes', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByText('Save changes'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const diff = onSave.mock.calls[0][0];
    expect(diff.changes).toEqual([{ id: 1, name: 'Bench Press', set: { reps: 10, weight: 65 } }]);
    expect(diff.deletes).toEqual([2]);
  });

  it("won't remove every set", () => {
    const onSave = vi.fn(async () => {});
    open(onSave);
    fireEvent.click(screen.getByLabelText('Remove Bench Press'));
    expect(screen.getByText('Removed')).toBeTruthy();
    fireEvent.click(screen.getByText('Save changes'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/at least one set/);
  });
});
