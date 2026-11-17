// Line icons for the break reasons (no emoji — see the app's UI style).
const PATHS = {
  holiday: <><path d="M2 16l20-6-4-3-6 2-5-5-2 1 3 6-4 1-2-2-1 1z" /><path d="M3 21h18" /></>,
  illness: <path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" />,
  emergency: <><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>,
  other: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
};

export function BreakReasonIcon({ reason, size = 17, strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[reason] || PATHS.other}
    </svg>
  );
}

// Calendar with a dash: the Profile row.
export function BreakCalendarIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="M9 15h6" />
    </svg>
  );
}
