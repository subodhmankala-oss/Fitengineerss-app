import './WorkoutFullScreenExit.css';

// The down arrow at the end of the logger's timer bar, shown while the
// workout is full-screen (useWorkoutFullScreen): one tap brings back the
// tabs and bottom navbar. Same block style as the bar's stopwatch button.
export default function WorkoutFullScreenExit({ onClick }) {
  return (
    <button
      type="button"
      className="btn-timer-stopwatch workout-full-screen-exit"
      onClick={onClick}
      aria-label="Show tabs and menu"
      title="Show tabs and menu"
      data-testid="full-screen-exit"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}
