// Local-timezone date helpers. `new Date().toISOString().split('T')[0]` and
// similar always return the UTC calendar day, which is wrong for any user
// east of UTC (e.g. IST) during the hours where local time has rolled over
// to a new day but UTC hasn't yet (or vice versa west of UTC). Every place
// that needs "today" or a calendar day as a YYYY-MM-DD string should go
// through these so the calendar widget, "today" badges, and history grouping
// can never disagree.

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Formats a Date as YYYY-MM-DD in the given (default: browser local) timezone.
// en-CA locale formats natively as YYYY-MM-DD, avoiding manual padding/joins.
export const getLocalDateString = (date = new Date(), timeZone = LOCAL_TZ) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

// Parses a YYYY-MM-DD string as local midnight. New Date('YYYY-MM-DD') parses
// as UTC midnight per spec, which silently shifts the day for any non-UTC user.
export const parseLocalDateString = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Shifts a YYYY-MM-DD string by N days (N can be negative) and returns the
// result as a YYYY-MM-DD string, entirely in local-time arithmetic.
export const shiftLocalDateString = (dateStr, days) => {
  const d = parseLocalDateString(dateStr);
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
};

export const isLocalToday = (dateStr) => dateStr === getLocalDateString();
