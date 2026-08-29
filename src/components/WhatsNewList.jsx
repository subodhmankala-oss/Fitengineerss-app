import { getWhatsNewFor } from '../data/whatsNewData';

// Shared "What's New" list body — used inside both ClientProfile's and
// CoachProfile's own sub-page shell (back header etc. stay with the caller
// so each keeps its own back-navigation), so the changelog itself is
// authored once in whatsNewData.js and never drifts between the two sides.
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

export default function WhatsNewList({ audience }) {
  const entries = getWhatsNewFor(audience);
  if (entries.length === 0) {
    return (
      <div className="cp-form-card" style={{ padding: '18px 16px' }}>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Nothing new to show yet — check back soon.</div>
      </div>
    );
  }
  return (
    <div className="cp-form-card" style={{ padding: '4px 0' }}>
      {entries.map((entry, idx) => (
        <div
          key={`${entry.date}-${entry.title}`}
          style={{ padding: '14px 16px', borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
        >
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--primary-accent-light)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {fmtDate(entry.date)}
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff', marginTop: '4px' }}>{entry.title}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.5 }}>{entry.description}</div>
        </div>
      ))}
    </div>
  );
}
