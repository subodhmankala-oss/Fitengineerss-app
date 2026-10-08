// Slide the freshly added set row in instead of having it pop into place.
// Called from the "Add Set" click handlers; the row doesn't exist until React
// commits the state update, so wait a frame before looking for it.
export function animateNewSetRow(button) {
  // The exercise this button belongs to. Every exercise in the client logger,
  // the coach's Live Log and the coach's plan editor sits in its own
  // .ex-reorder-row. (This used to look for .ex-card-actions, which the plan
  // editor's Add Set isn't wrapped in — so its new sets never animated.)
  const card = button?.closest('.ex-reorder-row') || button?.closest('.ex-card-actions')?.parentElement;
  // A hidden page's animation clock can sit frozen at the first frame
  // (max-height 0), hiding the row — just show it.
  if (!card || document.visibilityState === 'hidden') return;
  requestAnimationFrame(() => {
    const rows = card.querySelectorAll('.hevy-set-row');
    const row = rows[rows.length - 1];
    if (!row) return;
    // Same measured-height trick as animateRemoveSetRow so both motions match.
    row.style.setProperty('--row-h', `${row.offsetHeight}px`);
    row.classList.add('set-row-enter');
    row.addEventListener('animationend', () => row.classList.remove('set-row-enter'), { once: true });
  });
}
