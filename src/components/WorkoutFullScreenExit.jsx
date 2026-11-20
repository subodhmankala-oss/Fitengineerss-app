import './WorkoutFullScreenExit.css';

// The down arrow at the start of the logger's timer bar, shown while the
// workout is full-screen (useWorkoutFullScreen): one tap brings back the
// tabs and bottom navbar.
export default function WorkoutFullScreenExit({ onClick }) {
  return (
    <button
      type="button"
      className="workout-full-screen-exit"
      onClick={onClick}
      aria-label="Show tabs and menu"
      title="Show tabs and menu"
      data-testid="full-screen-exit"
    >
      <span className="fs-exit-badge" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </button>
  );
}
