// Slide the freshly added set row in instead of having it pop into place.
// Called from the "Add Set" click handlers; the row doesn't exist until React
// commits the state update, so wait a frame before looking for it.
export function animateNewSetRow(button) {
  const card = button?.closest('.ex-card-actions')?.parentElement;
  if (!card) return;
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
