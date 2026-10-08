// Exercises queued from outside the logger (e.g. the muscle detail screen's
// "+ Add" on a suggestion) for the client's workout. The Home dashboard and
// WorkoutTracker are separate tabs that never mount together, so the queue
// lives in localStorage; WorkoutTracker drains it on mount — appending to the
// in-progress session, or starting one. Per user, like the workout draft.

const keyFor = () => `pendingWorkoutAdds_${localStorage.getItem('userId') || 'anon'}`;

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(keyFor()) || '[]');
    return Array.isArray(list) ? list.filter(n => typeof n === 'string' && n) : [];
  } catch {
    return [];
  }
}

export function getPendingWorkoutAdds() {
  return read();
}

// Returns false if the name was already queued.
export function queueWorkoutAdd(name) {
  const list = read();
  if (list.some(n => n.toLowerCase() === name.toLowerCase())) return false;
  try { localStorage.setItem(keyFor(), JSON.stringify([...list, name])); } catch { return false; }
  return true;
}

// Returns the queued names and clears the queue.
export function takePendingWorkoutAdds() {
  const list = read();
  try { localStorage.removeItem(keyFor()); } catch { /* ignore */ }
  return list;
}
