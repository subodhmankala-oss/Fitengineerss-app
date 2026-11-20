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
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
      </svg>
      <span>Menu</span>
    </button>,
    // Inside the app frame, like the rest timer: on the page body it sat
    // behind .app-container (or outside the phone frame on desktop).
    document.querySelector('.app-container') || document.body
  );
}
