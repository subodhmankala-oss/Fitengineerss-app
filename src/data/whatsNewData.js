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
    date: '2026-10-23',
    audience: 'coach',
    title: 'Active/inactive dot on client photos',
    description: 'Each client\'s photo in your client list now shows a small dot telling you at a glance who has trained recently and who has gone quiet.',
  },
  {
    date: '2026-10-23',
    audience: 'coach',
    title: 'Remove a client who stopped training with you',
    description: 'You can now remove a client from your list (also from the renewal-due row menu) once they no longer train with you.',
  },
  {
    date: '2026-10-23',
    audience: 'all',
    title: 'Push/Pull/Legs and This Week pinned in the workout picker',
    description: 'The most-used templates now sit at the top of the workout picker so you can start them in one tap.',
  },
  {
    date: '2026-10-23',
    audience: 'all',
    title: 'Exercise history follows small name differences',
    description: '"Face Pulls" and "Face Pull" (and similar variants) now share the same Form Guide video and PREV numbers, and a double-saved workout no longer doubles a template\'s sets.',
  },
  {
    date: '2026-10-18',
    audience: 'coach',
    title: 'Payment receipts and a cleaner Payments screen',
    description: 'Every logged payment now has a receipt you can share, the month-over-month chart is sharper, and sending a payment QR outside the app lives in one card.',
  },
  {
    date: '2026-10-18',
    audience: 'all',
    title: 'Added exercises show on the muscle map',
    description: 'Exercises you add now appear under Overview and Heat Map, with a total in the muscle sheet.',
  },
  {
    date: '2026-10-14',
    audience: 'all',
    title: 'Workout streak badge',
    description: 'A flame badge on Home shows your current workout streak, with a hint for your next workout and the next badge to earn.',
  },
  {
    date: '2026-10-13',
    audience: 'all',
    title: 'New Workout Library with Hyrox and trend programs',
    description: 'A redesigned Library screen with Gym, Home and Hyrox sections, level filters, muscle maps on every program, and new programs like 12-3-30, Zone 2 and Pilates core.',
  },
  {
    date: '2026-10-13',
    audience: 'all',
    title: 'Faster set logging',
    description: 'A kg typed in one set fills the empty kg boxes below it, and warm-up moves now sit together in one Warm-up card at the top.',
  },
  {
    date: '2026-10-13',
    audience: 'coach',
    title: 'Hand a Live Log session over to your client',
    description: 'Finish part of a session with your client and hand the rest over for them to log, or move not-started exercises to the next session.',
  },
  {
    date: '2026-10-12',
    audience: 'all',
    title: 'Library programs change week to week',
    description: 'Library programs now get a weekly warm-up block, level-based exercise swaps, and a finisher for a muscle you\'ve been neglecting.',
  },
  {
    date: '2026-10-12',
    audience: 'all',
    title: 'Bigger Home banner with today\'s focus',
    description: 'The Home banner shows today\'s focus muscles for your next program with a Start workout button, and "Recent workouts" is now in the Existing Plan dropdown.',
  },
  {
    date: '2026-10-09',
    audience: 'all',
    title: 'Tap to zoom on the heat map',
    description: 'Tap the heat map to zoom in, see each muscle split into its parts with names, and drag around smoothly at any zoom.',
  },
  {
    date: '2026-10-09',
    audience: 'coach',
    title: '"Clients have gone quiet" card',
    description: 'Your home screen lists clients inactive for 3+ days, with a one-tap WhatsApp check-in.',
  },
  {
    date: '2026-10-09',
    audience: 'coach',
    title: 'Add suggested exercises from the muscle map',
    description: '"Try these" chips on a client\'s muscle map add exercises straight to their Live Log, and plans show a "Muscle map →" link when a muscle is behind this week.',
  },
  {
    date: '2026-10-08',
    audience: 'all',
    title: 'Exercise history with suggestions',
    description: 'Tap an exercise to see its history, what to do when a muscle is undertrained, and alternative exercises you can add with one tap.',
  },
  {
    date: '2026-10-07',
    audience: 'all',
    title: 'Pick exercises by tapping a muscle',
    description: 'Add Exercise has a tap-a-muscle body picker, region chips (Mid Back, Upper Chest, Tibialis…) and 31 new exercises.',
  },
  {
    date: '2026-10-07',
    audience: 'all',
    title: 'More accurate calories',
    description: 'Calories now count real active burn, including recovery between strength sets, and use your sex from your profile for calorie targets. The heat map also shows a female body when set.',
  },
  {
    date: '2026-10-03',
    audience: 'client',
    title: 'Pick your level and start your first workout',
    description: 'New clients choose Beginner to Advanced and Gym or Home, and can start their first Library workout straight from Home.',
  },
  {
    date: '2026-10-03',
    audience: 'client',
    title: 'New coach plans show on Home',
    description: 'Plans your coach sent in the last 7 days appear on Home, and after saving a workout you land on your Muscle Balance overview.',
  },
  {
    date: '2026-09-30',
    audience: 'all',
    title: 'Bigger set logger and smoother animations',
    description: 'Larger text in the set logger, a calendar-day Progress chart, and smooth slide animations when adding or deleting a set.',
  },
  {
    date: '2026-09-29',
    audience: 'all',
    title: 'Rest timer, interval beeps and exercise menu',
    description: 'Start rest manually, interval countdowns stop at 00:00 with a beep, and each exercise has a 3-dot menu to reorder or remove it.',
  },
  {
    date: '2026-09-29',
    audience: 'all',
    title: 'Workout clock keeps counting off screen',
    description: 'Workout duration now starts with your workout and keeps running even when you switch apps.',
  },
  {
    date: '2026-09-28',
    audience: 'all',
    title: 'One-tap set logging',
    description: 'Tick a set to log it with PREV pre-filled; every set is saved as you go and the rest timer survives a reload.',
  },
  {
    date: '2026-09-27',
    audience: 'all',
    title: '"New version available" banner',
    description: 'When an update ships you\'ll see a banner to load it, and resetting your password no longer ends on a blank screen.',
  },
  {
    date: '2026-09-26',
    audience: 'all',
    title: 'Unread dots on notifications',
    description: 'Every push notification now shows a blue unread dot and opens the exact screen it\'s about.',
  },
  {
    date: '2026-09-24',
    audience: 'all',
    title: 'Fixed duplicate workouts and calorie counts',
    description: 'Workouts are no longer saved more than once, and cardio, carries, rowing, swimming and jump rope now count calories correctly.',
  },
  {
    date: '2026-09-22',
    audience: 'all',
    title: 'Cardio target times count down',
    description: 'Cardio sets with a target time now count down, and the workout calendar lets you go back to previous months.',
  },
  {
    date: '2026-09-21',
    audience: 'all',
    title: 'Monthly progress reports',
    description: 'Coaches can send a monthly progress report; clients see it on Home with tappable trend bars to switch months.',
  },
  {
    date: '2026-09-18',
    audience: 'all',
    title: 'Auto theme follows the time of day',
    description: 'Auto theme now switches to light from 6am to 6pm, and the heat map looks more realistic with clear muscle seams.',
  },
  {
    date: '2026-09-17',
    audience: 'coach',
    title: 'Send a payment QR on WhatsApp',
    description: 'Send your payment QR to people outside the app via WhatsApp, with your message baked onto the image.',
  },
  {
    date: '2026-09-16',
    audience: 'all',
    title: 'Light, Dark or Auto theme',
    description: 'Choose Light, Dark or Auto from the menu, and typing no longer gets hidden behind the phone keyboard.',
  },
  {
    date: '2026-09-15',
    audience: 'client',
    title: 'Stay signed in',
    description: 'You stay signed in across app restarts, and the app offers to turn on notifications after your first login.',
  },
  {
    date: '2026-09-14',
    audience: 'client',
    title: 'Home workouts and step-by-step guidance',
    description: 'A bodyweight Home library sits alongside the Gym one, with guidance to your next workout and inline form videos.',
  },
  {
    date: '2026-09-12',
    audience: 'all',
    title: 'Add weight to bodyweight exercises',
    description: 'Tap the BW box on bodyweight moves (pull-ups, dips, planks, lunges…) to log added weight.',
  },
  {
    date: '2026-09-11',
    audience: 'coach',
    title: 'WhatsApp renewal reminders',
    description: 'Send gentle renewal reminders on WhatsApp with your payment QR, logo and name.',
  },
  {
    date: '2026-09-10',
    audience: 'all',
    title: 'Faster Form Guide videos',
    description: 'Form Guide videos load faster, show loading feedback, and portrait videos are no longer cropped.',
  },
  {
    date: '2026-09-06',
    audience: 'coach',
    title: 'Pause a client\'s subscription',
    description: 'Pause (and unpause) a client from the renewal reminder; paused clients are marked in your client list.',
  },
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
