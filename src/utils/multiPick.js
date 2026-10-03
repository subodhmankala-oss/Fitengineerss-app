// "Pick up to N" lists for the sign-up wizard's goal and concern steps.
// Order matters: index 0 is the MAIN pick (it's what clients.program /
// primary_concern hold and what drives the calorie target); index 1 is the
// "also" pick, saved separately (clients.secondary_program / _concern).

export const MAX_PICKS = 2;

// Toggle `id` in `list`. Tapping a picked item removes it (the other pick,
// if any, becomes the main one); tapping a new item adds it while there's
// room. When the list is already full, nothing changes and `full` is true so
// the caller can tell the person to remove one first.
export function togglePick(list, id, max = MAX_PICKS) {
  if (list.includes(id)) return { list: list.filter(x => x !== id), full: false };
  if (list.length >= max) return { list, full: true };
  return { list: [...list, id], full: false };
}

// Small tag shown on a picked option, only once there are two to tell apart.
export function pickTag(list, id) {
  if (list.length < 2) return null;
  const i = list.indexOf(id);
  if (i === 0) return 'Main';
  if (i === 1) return 'Also';
  return null;
}

// Display label for a saved second pick, or '' (labels: id -> text).
export function secondaryLabel(slug, labels) {
  return (slug && labels[slug]) || '';
}
