import { useState } from 'react';
import { LEAD_LOST_REASONS, LEAD_SOURCES, followUpsDue } from './gymView';
import { openWhatsapp, toWhatsappNumber } from '../utils/whatsappNudge';
import { shortDate } from '../utils/ownerView';

const SHOW = 6;
const sourceLabel = (k) => LEAD_SOURCES.find((s) => s.key === k)?.label || k;
const reasonLabel = (k) => LEAD_LOST_REASONS.find((r) => r.key === k)?.label || k;

// Overview card: enquiries whose follow-up day is today or already passed.
// "Done" clears the date; WhatsApp opens a friendly hello. Hidden until the
// leads tables are set up (biz.leads is null).
export default function GymFollowUps({ data, biz, service, onChanged }) {
  const today = data.insights?.today;
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  if (!biz?.leads || !today) return null;

  const due = followUpsDue(biz.leads, today);
  const done = async (lead) => {
    setBusy(lead.id); setError('');
    const r = await service.gymLead({ op: 'follow_up', leadId: lead.id, followUpOn: null });
    setBusy(null);
    if (!r.success) { setError(r.error); return; }
    onChanged?.();
  };

  return (
    <section className="gx-card">
      <h2 className="gx-h2">Follow up today</h2>
      <p className="gx-sub">{due.length ? `${due.length} enquir${due.length === 1 ? 'y' : 'ies'} to call or message today.` : 'No follow-ups due today.'}</p>
      {error && <p className="gx-err" role="alert">{error}</p>}
      <div className="gx-list">
        {due.slice(0, SHOW).map((l) => {
          const day = String(l.follow_up_on).slice(0, 10);
          const phone = toWhatsappNumber(l.phone);
          return (
            <div key={l.id} className="gx-rank">
              <div className="gx-rank-main">
                <div className="gx-name">{l.name} <span className="gx-pill amber">{sourceLabel(l.source)}</span>{l.stage === 'lost' && <> <span className="gx-pill red">Lost · {reasonLabel(l.lost_reason)}</span></>}</div>
                <div className="gx-sub">{day < today ? `Was due ${shortDate(day)}` : 'Due today'}{l.note ? ` · ${l.note}` : ''}</div>
              </div>
              {phone && <button type="button" className="gx-btn gx-btn-soft" onClick={() => openWhatsapp(phone, `Hi ${String(l.name).split(' ')[0]}, thanks for your interest in ${data.gym.name}! Just checking in. Would you like to come by?`)}>WhatsApp</button>}
              <button type="button" className="gx-btn gx-btn-dark" disabled={busy === l.id} onClick={() => done(l)}>Done</button>
            </div>
          );
        })}
      </div>
      {due.length > SHOW && <p className="gx-sub">+ {due.length - SHOW} more in Leads.</p>}
    </section>
  );
}
