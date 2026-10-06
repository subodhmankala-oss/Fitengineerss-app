// Workout Library top sections: Recently used and Favorites. (Recommended
// comes from determineWorkoutGuidance in beginnerGuidance.js.)

// { gym: { beginner: [...], ... }, home: {...} } -> [{ category, level, workout }]
export function flattenLibrary(library) {
  const out = [];
  ['gym', 'home'].forEach(category => {
    ['beginner', 'intermediate', 'advanced'].forEach(level => {
      (library?.[category]?.[level] || []).forEach(workout => out.push({ category, level, workout }));
    });
  });
  return out;
}

const key = s => String(s || '').trim().toLowerCase();

// Library programs the client has logged, most recent first, each once.
// Sessions are matched to programs by plan name (that's what a session
// started from the library records).
export function getRecentlyUsed(entries, sessions, max = 3) {
  const byName = new Map();
  entries.forEach(e => { if (!byName.has(key(e.workout?.name))) byName.set(key(e.workout?.name), e); });
  const sorted = [...(sessions || [])]
    .filter(s => s?.date && s?.planName)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const seen = new Set();
  const out = [];
  for (const s of sorted) {
    const e = byName.get(key(s.planName));
    if (!e || seen.has(e.workout.id)) continue;
    seen.add(e.workout.id);
    out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

// Favorites are stored per client on this device as a list of program ids.
export function readFavoriteIds(storageKey) {
  try {
    const ids = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(ids) ? ids : [];
  } catch { return []; }
}

export function toggleFavoriteId(ids, id) {
  return ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
}

// Favorited entries in the order they were starred.
export function getFavorites(entries, ids) {
  const byId = new Map(entries.map(e => [e.workout?.id, e]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}
