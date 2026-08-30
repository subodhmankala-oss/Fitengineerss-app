import { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import Avatar from './Avatar';
import './ConnectCoachModal.css';

// Read-only view of the connected coach's business profile, opened by
// tapping the "Coach: [Name]" pill on the client dashboard. Reuses the
// ConnectCoachModal's chrome (backdrop/card/header) for a consistent look,
// but shows static fields instead of a form — this is display-only, a
// client can't edit their coach's business info.
export default function CoachDetailsModal({ coachId, coachName, onClose }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Belt-and-suspenders timeout: getCoachDetailsById already goes through
    // a service-role endpoint with its own internal timeout, but that whole
    // chain still starts by awaiting resolveBearerToken() — a hang anywhere
    // upstream of this component (confirmed once already, see
    // refreshAccessTokenRaw's comment in databaseService.js) would otherwise
    // leave this modal stuck on "Loading…" forever with no way out but the
    // Close button. This bounds it locally too, independent of any fix
    // upstream.
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), 10000));
    Promise.race([databaseService.getCoachDetailsById(coachId), timeout]).then(result => {
      if (!cancelled) { setDetails(result); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [coachId]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const displayName = details?.name || coachName || 'Coach';
  const rows = details ? [
    ['Business / Brand Name', details.brand],
    ['Specialization', details.specialization],
    ['Certifications', details.certifications],
    ['Years of Experience', details.experienceYears],
    ['Location / City', details.locationCity],
    ['Social Handle', details.socialHandle],
  ].filter(([, value]) => value) : [];

  return (
    <div className="ccm-backdrop" onClick={handleBackdropClick}>
      <div className="ccm-modal" role="dialog" aria-modal="true" aria-label="Coach Details">
        <div className="ccm-header">
          <Avatar name={displayName} avatarUrl={details?.avatarUrl} size={44} style={{ flexShrink: 0 }} />
          <div>
            <h2 className="ccm-title">{displayName}</h2>
            <p className="ccm-subtitle">Your coach</p>
          </div>
          <button className="ccm-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {loading ? (
          <p className="ccm-info">Loading coach details…</p>
        ) : rows.length > 0 ? (
          <div className="cdm-field-list">
            {rows.map(([label, value]) => (
              <div className="cdm-field-row" key={label}>
                <span className="cdm-field-label">{label}</span>
                <span className="cdm-field-value">{value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="ccm-info">Your coach hasn't added their business details yet.</p>
        )}

        <div className="ccm-actions">
          <button type="button" className="ccm-btn-primary" style={{ flex: 1 }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
