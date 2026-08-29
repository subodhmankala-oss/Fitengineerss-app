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
    date: '2026-08-28',
    audience: 'coach',
    title: 'Running total on Client Payments',
    description: 'The Client Payments ledger now shows a running total so you can see collected amounts at a glance.',
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
];

// Returns entries relevant to the given audience ('client' | 'coach'),
// newest first as authored above.
export function getWhatsNewFor(audience) {
  return WHATS_NEW.filter(entry => entry.audience === 'all' || entry.audience === audience);
}
