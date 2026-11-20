import { createPortal } from 'react-dom';
import './WorkoutFullScreenExit.css';

// The floating down arrow shown while the logger is full-screen
// (useWorkoutFullScreen): one tap brings back the tabs and bottom navbar.
export default function WorkoutFullScreenExit({ onClick }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <button
      type="button"
      className="workout-full-screen-exit"
      onClick={onClick}
      aria-label="Show tabs and menu"
      title="Show tabs and menu"
      data-testid="full-screen-exit"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>,
    document.body
  );
}
