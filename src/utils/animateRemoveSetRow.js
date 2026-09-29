// Collapse a set row out before it's removed (mirror of animateNewSetRow).
// The removal runs once the exit animation ends; a timeout backs it up in
// case animationend never fires (reduced motion, hidden tab).
export function animateRemoveSetRow(button, onRemove) {
  const row = button?.closest('.hevy-set-row');
  if (!row || row.classList.contains('set-row-exit')) {
    if (!row) onRemove();
    return;
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onRemove();
  };
  // Animate from the row's real height so the collapse starts immediately
  // (a fixed max-height larger than the row makes the first part invisible).
  row.style.setProperty('--row-h', `${row.offsetHeight}px`);
  row.classList.add('set-row-exit');
  row.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 700);
}
