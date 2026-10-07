export function daysAgo(dateStr) {
  const then = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((now - then) / 86400000);
}

export function formatDaysAgo(n) {
  if (n <= 0) return 'Today';
  if (n === 1) return 'Yesterday';
  return `${n} days ago`;
}

// Training-status read: how consistently has this exercise been trained
// lately? Based on session frequency over the trailing 28 days, with a
// hard override to "Neglected" once it's been untouched for 3+ weeks
// regardless of how it was trained before that window.
export function getTrainingStatus(entries) {
  if (!entries || entries.length === 0) {
    return { key: 'none', label: 'Not Yet Trained', icon: '⚪', tone: 'neutral', detail: 'No sessions logged for this exercise yet.' };
  }
  const gap = daysAgo(entries[0].date);
  const recent28 = entries.filter(e => daysAgo(e.date) <= 28);
  const perWeek = recent28.length / 4;

  if (gap > 21) {
    return { key: 'neglected', label: 'Neglected', icon: '🔴', tone: 'danger', detail: `Last trained ${formatDaysAgo(gap).toLowerCase()} — this needs to get back into rotation.`, action: 'Do this exercise in your next workout, or swap in one of the alternatives below.' };
  }
  if (perWeek >= 3.5) {
    return { key: 'high', label: 'Highly Trained', icon: '🔵', tone: 'success', detail: `~${perWeek.toFixed(1)}x/week over the last 4 weeks — you're hitting this a lot. Make sure you're recovering between sessions.` };
  }
  if (perWeek >= 1.75) {
    return { key: 'optimal', label: 'Optimally Trained', icon: '✅', tone: 'success', detail: `~${perWeek.toFixed(1)}x/week over the last 4 weeks — solid, consistent frequency.` };
  }
  if (perWeek >= 1) {
    return { key: 'low', label: 'Slightly Undertrained', icon: '🟡', tone: 'warning', detail: `~${perWeek.toFixed(1)}x/week over the last 4 weeks — a touch below the ~2x/week most muscle groups respond best to.`, action: 'Add one more session this week — or work in one of the alternatives below.' };
  }
  return { key: 'under', label: 'Undertrained', icon: '🟠', tone: 'orange', detail: `Only ~${perWeek.toFixed(1)}x/week over the last 4 weeks — this muscle group is falling behind.`, action: 'Aim for 2 sessions a week. Add this exercise to another workout day, or work in one of the alternatives below.' };
}

// Status for one exercise straight from the client's saved sessions — the same
// read the history sheet shows, so a plan card can flag an undertrained
// exercise without opening it. Only session dates matter here.
export function getExerciseStatusFromSessions(exerciseName, sessions, clientName) {
  const target = (exerciseName || '').toLowerCase();
  const who = (clientName || '').toLowerCase();
  const entries = (sessions || [])
    .filter(s => (s.clientName || '').toLowerCase() === who)
    .filter(s => (s.exercises || []).some(e => (e.name || '').toLowerCase() === target && e.sets && e.sets.length > 0))
    .map(s => ({ date: s.date }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return getTrainingStatus(entries);
}
