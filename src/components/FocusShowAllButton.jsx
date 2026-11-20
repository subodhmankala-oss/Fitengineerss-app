import './FocusShowAllButton.css';

// The chevron under the focused exercise card (see useFocusExercise): one
// tap brings the rest of the workout back. Names what's next so the user
// knows what they're opening up to.
export default function FocusShowAllButton({ hiddenCount, nextName, onClick }) {
  return (
    <button type="button" className="focus-show-all" onClick={onClick} data-testid="focus-show-all">
      <span className="focus-show-all-text">
        {nextName ? <>Next: <strong>{nextName}</strong></> : 'Show the whole workout'}
        {hiddenCount > 0 && <small>{hiddenCount === 1 ? '1 more exercise' : `${hiddenCount} more exercises`}</small>}
      </span>
      <span className="focus-show-all-chevron" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </button>
  );
}
