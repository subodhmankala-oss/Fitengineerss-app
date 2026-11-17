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

// A quiet scene behind a coach-list row while the client is away: a soft
// wash in the reason's colour with a gentle line along the bottom, and one
// small motif at the far right — sun and palm (Holiday), crescent moon
// (Illness / injury), heartbeat (Emergency), paper plane (Other).
// Decorative only; kept faint so the row's text stays easy to read.
const SCENES = {
  holiday: {
    tint: '56,189,248',
    ground: <path d="M0 54 Q30 49 60 54 T120 54 T180 54 T240 54" />,
    motif: (
      <>
        <circle cx="30" cy="14" r="6" fill="#fbbf24" stroke="none" opacity="0.8" />
        <path d="M22 60 C23 48 26 38 32 30" stroke="#d6a35c" />
        <path d="M32 30 C25 27 18 29 14 34 M32 30 C29 23 23 20 17 21 M32 30 C38 24 44 24 48 28 M32 30 C39 30 43 35 43 40" stroke="#4ade80" />
      </>
    ),
  },
  illness: {
    tint: '167,139,250',
    ground: <path d="M0 56 Q40 50 80 55 T160 54 T240 56" />,
    motif: (
      <>
        <path d="M34 14 a10 10 0 1 0 8 17 a8 8 0 0 1 -8 -17z" fill="#ddd6fe" stroke="none" opacity="0.8" />
        <circle cx="16" cy="18" r="1.3" fill="#ddd6fe" stroke="none" />
        <circle cx="22" cy="40" r="1.1" fill="#ddd6fe" stroke="none" />
        <circle cx="48" cy="46" r="1.3" fill="#ddd6fe" stroke="none" />
      </>
    ),
  },
  emergency: {
    tint: '248,113,113',
    ground: <path d="M0 55 H240" />,
    motif: <path d="M4 34 H16 L21 24 L28 44 L35 18 L41 36 L45 32 H58" stroke="#f87171" />,
  },
  other: {
    tint: '245,158,11',
    ground: <path d="M0 55 Q60 51 120 55 T240 55" />,
    motif: (
      <>
        <path d="M6 48 C16 46 22 38 28 30" stroke="#f59e0b" strokeDasharray="1.5 4" />
        <path d="M28 18 L50 26 L32 31 L30 40 L26 29 Z" fill="#fbbf24" stroke="none" opacity="0.8" />
      </>
    ),
  },
};

export function BreakScene({ reason }) {
  const s = SCENES[reason] || SCENES.other;
  return (
    <span className="ccl-scene" aria-hidden="true" style={{ '--scene-rgb': s.tint }}>
      <svg className="ccl-scene-ground" viewBox="0 0 240 64" preserveAspectRatio="none" fill="none" stroke={`rgb(${s.tint})`} strokeWidth="1.2" vectorEffect="non-scaling-stroke">
        {s.ground}
      </svg>
      <svg className="ccl-scene-motif" viewBox="0 0 60 64" preserveAspectRatio="xMaxYMid meet" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {s.motif}
      </svg>
    </span>
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
