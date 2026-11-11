import { useState } from 'react';
import { TODAY_KINDS, todaysMessages } from './gymToday';
import { sendWhatsapp } from './gymMessages';
import { memberPlans } from './gymView';

// Overview card: the WhatsApp messages due today (receipts, renewal reminders,
// "we miss you"), each one tap to open in WhatsApp. Nothing is sent by itself:
// there is no WhatsApp Business account behind the app, so the owner taps Send.
export default function GymTodayMessages({ data, biz, service, onChanged }) {
  const { clients, gym, insights } = data;
  const [gone, setGone] = useState(() => new Set());
  const [error, setError] = useState('');
  const today = insights?.today;
  const plans = biz && today ? memberPlans(biz, today) : {};
  const items = todaysMessages({ clients, plans, biz, today, gymName: gym.name }).filter((m) => !gone.has(m.key));
  const s = biz?.settings || {};
  const anyOn = (s.wa_renewal ?? true) || (s.wa_miss ?? true) || (s.wa_receipt ?? true);

  const mark = async (m, action) => {
    setError('');
    setGone((g) => new Set(g).add(m.key));
    const r = await service.markGymMessageSent({ memberId: m.client.id, kind: m.kind, ref: m.ref, action });
    if (r.success) onChanged();
    else setError(r.error);
  };
  // Start saving "sent" first, then open WhatsApp: on a phone opening WhatsApp
  // leaves the page, and the save has already been started by then.
  const send = (m) => { const saving = mark(m, 'sent'); sendWhatsapp(m.client, m.text); return saving; };

  if (!biz || !anyOn) return null;
  return (
    <section className="gx-card">
      <h2 className="gx-h2">Today’s messages to send</h2>
      <p className="gx-sub">{items.length ? `${items.length} WhatsApp message${items.length === 1 ? '' : 's'} ready. Tap Send, WhatsApp opens with the words filled in.` : 'Nothing to send today.'} Choose which ones appear in Settings.</p>
      <div className="gx-list">
        {items.map((m) => (
          <div key={m.key} className="gx-rank">
            <div className="gx-grow">
              <div className="gx-name">{m.client.name} <span className={`gx-pill ${m.kind === 'receipt' ? 'green' : 'amber'}`}>{TODAY_KINDS[m.kind].label}</span></div>
              <div className="gx-sub">{m.text.replace('{name}', m.client.name.split(' ')[0]).slice(0, 110)}{m.text.length > 110 ? '…' : ''}</div>
            </div>
            <button type="button" className="gx-btn gx-btn-dark" disabled={!m.hasPhone} title={m.hasPhone ? '' : 'No phone number saved for this member'} onClick={() => send(m)}>Send</button>
            <button type="button" className="gx-link" onClick={() => mark(m, 'skipped')}>Skip</button>
          </div>
        ))}
      </div>
      {error && <p className="gx-err" role="alert">{error}</p>}
    </section>
  );
}
