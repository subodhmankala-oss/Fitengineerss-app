// "Intermediate Push (week-3) Session 2" → the workout's own name plus its
// level, week and session, so each can be shown on its own. Coaches type
// these by hand in many ways ("Upper Body(Week-2)", "Leg day (oct-w3)",
// "UB Oct w4", "Conditioning day5"), so this only lifts out what it is sure
// of and leaves everything else in the name.
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const NUM = `(\\d{1,2}|${Object.keys(WORDS).join('|')})`;
const MONTH = '(jan|feb|mar|apr|may|june?|july?|aug|sept?|oct|nov|dec)';

const LEVEL_RE = /\b(?:for\s+)?(beginner|intermediate|advanced)s?\b/i;
const LEVEL_NUM_RE = new RegExp(`\\blevel[\\s-]*${NUM}\\b`, 'i');
const WEEK_RE = new RegExp(`(?:\\b${MONTH}[\\s-]*)?\\(?\\s*\\b(?:(?:week|wk)[\\s-]*${NUM}|w[\\s-]?(\\d{1,2}))\\b\\s*\\)?(?:\\s*${MONTH}\\b)?`, 'i');
const SESSION_RE = new RegExp(`\\b(session|day|phase)[\\s-]*${NUM}\\b`, 'i');

const toNumber = (s) => WORDS[String(s).toLowerCase()] || Number(s);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// What lifting a part out leaves behind: empty or half brackets, loose dashes.
function tidy(s) {
  let out = s.replace(/\(\s*[-–,·]*\s*\)/g, ' ');
  const open = (out.match(/\(/g) || []).length;
  const close = (out.match(/\)/g) || []).length;
  if (open !== close) out = out.replace(/[()]/g, ' ');
  return out.replace(/\s+/g, ' ').replace(/\s*[-–·,:|]+\s*$/, '').replace(/^\s*[-–·,:|]+\s*/, '').trim();
}

/** { name, level, levelKey, week, session } — parts not in the title are null. */
export function workoutNameParts(title) {
  const full = String(title || '').trim();
  const parts = { name: full, level: null, levelKey: null, week: null, session: null };
  let rest = full;
  const lift = (re) => {
    const m = re.exec(rest);
    if (m) rest = `${rest.slice(0, m.index)} ${rest.slice(m.index + m[0].length)}`;
    return m;
  };

  const level = lift(LEVEL_RE);
  if (level) { parts.level = capital(level[1]); parts.levelKey = level[1].toLowerCase(); }
  else {
    const n = lift(LEVEL_NUM_RE);
    if (n) { parts.level = `Level ${toNumber(n[1])}`; parts.levelKey = 'number'; }
  }
  const week = lift(WEEK_RE);
  if (week) {
    const month = week[1] || week[4];
    parts.week = `${month ? `${capital(month)} ` : ''}Week ${toNumber(week[2] || week[3])}`;
  }
  const session = lift(SESSION_RE);
  if (session) parts.session = `${capital(session[1])} ${toNumber(session[2])}`;

  const name = tidy(rest);
  // Nothing left to call it ("Week 2"): keep the title whole.
  return /[a-z]/i.test(name) ? { ...parts, name } : { ...parts, name: full, level: null, levelKey: null, week: null, session: null };
}

/** The parts as small labels, in reading order: [{ kind, text }]. */
export function workoutNameTags(parts) {
  return [
    parts.level && { kind: `level-${parts.levelKey}`, text: parts.level },
    parts.week && { kind: 'week', text: parts.week },
    parts.session && { kind: 'session', text: parts.session },
  ].filter(Boolean);
}
