import React from 'react';

// "Built for this client" — the programming brief the server applied to an
// AI draft (api/generate-workout-draft.js → briefSummary), shown above the
// draft's day tabs, plus every warning it returned: missing profile fields,
// exercises removed or adjusted per day, weekly sets over the cap.

const LEVEL_SOURCE = { experience: 'saved level', library_level: 'library level', coachPick: 'your pick' };
const IMPACT_TEXT = { none: 'no impact (seated / supported)', low: 'low (no jumps or running)' };
const NOTE_ORDER = { profile: 0, day: 1, week: 2 };

const span = ([lo, hi]) => (lo === hi ? `${lo}` : `${lo}–${hi}`);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const Item = ({ label, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
    <strong style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 700, lineHeight: 1.3 }}>{value}</strong>
  </div>
);

const AiDraftBriefSummary = ({ brief, notes = [] }) => {
  if (!brief) return null;
  const sorted = [...notes].sort((a, b) => (NOTE_ORDER[a.kind] ?? 3) - (NOTE_ORDER[b.kind] ?? 3));
  return (
    <div
      data-testid="ai-brief-summary"
      style={{
        border: '1px solid rgba(var(--accent-rgb), 0.3)',
        background: 'rgba(var(--accent-rgb), 0.06)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        marginBottom: '12px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', color: 'var(--accent-text)', fontSize: '0.78rem', fontWeight: 800 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" />
        </svg>
        Built for this client
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
        <Item label="Level" value={`${cap(brief.level)}${brief.levelSource ? ` (${LEVEL_SOURCE[brief.levelSource] || brief.levelSource})` : ''}`} />
        <Item label="Reps" value={`Main ${span(brief.reps.mainLifts)} · accessories ${span(brief.reps.accessories)}`} />
        <Item label="Impact" value={brief.impactCap ? IMPACT_TEXT[brief.impactCap] : 'no limit'} />
        <Item
          label="Excluded areas"
          value={brief.injuries.length ? `${brief.injuries.join(', ')}` : 'None'}
        />
      </div>
      {brief.excludedCount > 0 && (
        <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          {brief.excludedCount} exercise{brief.excludedCount === 1 ? '' : 's'} from your library left out for this client.
        </p>
      )}
      {sorted.length > 0 && (
        <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {sorted.map((n, i) => (
            <li key={i} style={{ display: 'flex', gap: '6px', fontSize: '0.74rem', lineHeight: 1.4, color: 'var(--text-main)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }}>
                <path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              </svg>
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AiDraftBriefSummary;
