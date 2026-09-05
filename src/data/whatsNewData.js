// Static changelog for the "What's New" screen (client + coach settings).
// Manually curated — add a new entry to the TOP of this array whenever a
// user-visible change ships. `audience` controls who sees it:
//   'all'    -> shown to both clients and coaches
//   'client' -> shown only on the client Profile screen
//   'coach'  -> shown only on the coach Profile screen
// Keep entries short (one line is usually enough) — this is a quick "what
// changed recently" glance, not a full engineering changelog.
export const WHATS_NEW = [
  {
    date: '2026-09-05',
    audience: 'all',
    title: 'Push notifications register reliably again',
    description: 'Fixed an issue where turning on notifications (or signing in on a new device) could silently fail to save. Coach notes, client replies, and reminders now reach your device as expected.',
  },
  {
    date: '2026-09-04',
    audience: 'all',
    title: 'Pull-to-refresh on your dashboard',
    description: 'Pull down at the top of your Home or Dashboard screen to refresh your data with a native-feeling gesture instead of reaching for the browser reload button.',
  },
  {
    date: '2026-09-04',
    audience: 'all',
    title: 'Quicker sign-in with saved accounts',
    description: 'After logging out, pick your account from a compact list (with your name, email, and real photo) instead of going through the full Google sign-in flow again.',
  },
  {
    date: '2026-09-04',
    audience: 'coach',
    title: 'Client count in your client list',
    description: 'The Coach Dashboard\'s client list header now shows how many clients you have at a glance.',
  },
  {
    date: '2026-09-03',
    audience: 'coach',
    title: 'Share a client\'s Muscle Balance or Heat Map on WhatsApp',
    description: 'A new share icon sends a client\'s Muscle Balance or Heat Map straight to WhatsApp, with a personalized message and a link that opens right to that view.',
  },
  {
    date: '2026-09-01',
    audience: 'all',
    title: 'Install banner no longer clipped on notch phones',
    description: 'The "Add to Home Screen" banner no longer gets cut off under the Dynamic Island or status bar on newer phones.',
  },
  {
    date: '2026-09-01',
    audience: 'coach',
    title: 'Coach invite links now show your real name',
    description: 'Invite links you share with new clients now include your actual name and a working link to the app, instead of placeholder text.',
  },
  {
    date: '2026-08-31',
    audience: 'coach',
    title: 'Client stat cards now match the client view',
    description: 'A client\'s Daily/Monthly workout summary on your dashboard now shows the same tab order, labels, and numbers (including a 0 kcal rest day) as what the client sees on their own Home screen.',
  },
  {
    date: '2026-08-31',
    audience: 'client',
    title: 'Coach details view and a smoother workout chart',
    description: 'Tap your coach\'s name to see a read-only Coach Details view. The Strength Progression chart in Progress now spaces sessions evenly, scrolls once you have more than a handful, and shows a proper tooltip.',
  },
  {
    date: '2026-08-30',
    audience: 'coach',
    title: 'Monthly payment breakdown with comparison chart',
    description: 'Client Payments now has a month picker with a month-over-month bar chart instead of a static list of every month — tap a bar or pick from the dropdown to see that month\'s change and ledger.',
  },
  {
    date: '2026-08-28',
    audience: 'coach',
    title: 'Running total on Client Payments',
    description: 'The Client Payments ledger now shows a running total so you can see collected amounts at a glance.',
  },
  {
    date: '2026-08-28',
    audience: 'coach',
    title: 'Tidier mobile header',
    description: 'The coach header on mobile now collapses into a single menu behind your profile photo, instead of several crowded icons.',
  },
  {
    date: '2026-08-28',
    audience: 'coach',
    title: 'Edit & delete client payments',
    description: 'Logged payments in the Client Payments ledger can now be edited or deleted, not just added.',
  },
  {
    date: '2026-08-27',
    audience: 'all',
    title: 'Real profile photos',
    description: 'Client and coach avatars now show your real photo (from Google sign-in or your account) instead of a placeholder icon.',
  },
  {
    date: '2026-08-26',
    audience: 'all',
    title: 'Easier-to-see date picker icon',
    description: 'The calendar icon on date fields is now visible in both light and dark mode across the app.',
  },
];

// Returns entries relevant to the given audience ('client' | 'coach'),
// newest first as authored above.
export function getWhatsNewFor(audience) {
  return WHATS_NEW.filter(entry => entry.audience === 'all' || entry.audience === audience);
}

// ─── "New" dot tracking (2026-08-29: "Whenever anything new comes in any
// navigation. There should be dot") ───
// Entries have no stable per-entry id (just date+title, and dates aren't
// strictly ordered — see the file header's "add to the TOP" convention,
// which isn't always followed by date). Rather than rely on either, this
// tracks a simple entry COUNT per audience: whenever the count of entries
// visible to that audience exceeds the count last recorded as "seen", a new
// entry must have been added since. Keyed by audience so the client and
// coach sides (this changelog and WhatsNewList.jsx are shared between both)
// never share or clobber each other's seen state.
function seenCountKey(audience) {
  return `whatsNewSeenCount_${audience}`;
}

export function hasUnseenWhatsNew(audience) {
  const total = getWhatsNewFor(audience).length;
  const seen = Number(localStorage.getItem(seenCountKey(audience)) || 0);
  return total > seen;
}

export function markWhatsNewSeen(audience) {
  localStorage.setItem(seenCountKey(audience), String(getWhatsNewFor(audience).length));
}
