import { firstThirtyDays, HOOKED_WORKOUTS, likelyNotToRenew, MEMBER_TAGS, NO_START_FLAG_DAYS } from './gymView';
import { newMemberMessageText, renewalMessageText, sendWhatsapp } from './gymMessages';
import { shortDate } from '../utils/ownerView';

const SHOW = 5;
const hasPhone = (c) => !!String(c.phone || '').replace(/\D/g, '');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const planWhen = (p) => (p.daysLeft < 0 ? `ended ${plural(-p.daysLeft, 'day')} ago` : p.daysLeft === 0 ? 'ends today' : `ends in ${plural(p.daysLeft, 'day')}`);

// Overview card: plans ending within 14 days (or just ended) held by members
// who are slipping, have stopped coming, or never started. Activity + plan
// dates only. One tap opens WhatsApp with a renewal message and the UPI link.
export function NotRenewCard({ data, plans, upiId, onOpenMembers }) {
  const { clients, gym } = data;
  const all = likelyNotToRenew(clients, plans);
  const rows = all.slice(0, SHOW);
  return (
    <section className="gx-card">
      <h2 className="gx-h2">Likely not to renew</h2>
      <p className="gx-sub">{all.length ? 'Plan ending within 14 days, and they have stopped or slowed down. A message now can win them back.' : 'Nobody with a plan ending soon has stopped training.'}</p>
      <div className="gx-list">
        {rows.map(({ client, plan, lastWorkout, status }) => (
          <div key={client.id} className="gx-rank">
            <div className="gx-rank-main">
              <div className="gx-name">{client.name} <span className={`gx-pill ${MEMBER_TAGS[status].tone === 'red' ? 'red' : 'amber'}`}>{MEMBER_TAGS[status].label}</span></div>
              <div className="gx-sub">{plan.planName} {planWhen(plan)} · {lastWorkout ? `last workout ${shortDate(lastWorkout)}` : 'no workout logged'}</div>
            </div>
            <button type="button" className="gx-btn gx-btn-dark" disabled={!hasPhone(client)} title={hasPhone(client) ? '' : 'No phone number saved for this member'} onClick={() => sendWhatsapp(client, renewalMessageText(client, gym.name, plan, upiId))}>Send renewal</button>
          </div>
        ))}
      </div>
      {all.length > SHOW && <button type="button" className="gx-link" onClick={() => onOpenMembers('notrenew')}>See all {all.length}</button>}
    </section>
  );
}

const Stage = ({ on, label }) => <span className={`gx-stage${on ? ' on' : ''}`}>{on ? '✓ ' : ''}{label}</span>;

// Overview card: everyone who joined in the last 30 days and how far along
// they are. No first workout after 3 days is flagged, with one tap to assign
// a trainer or send a welcome message.
export function FirstThirtyDaysCard({ data, onOpenMembers }) {
  const { clients, gym } = data;
  const { rows, summary } = firstThirtyDays(clients);
  const shown = rows.slice(0, 6);
  return (
    <section className="gx-card">
      <h2 className="gx-h2">First 30 days</h2>
      <p className="gx-sub">
        {rows.length
          ? `${summary.joined} joined · ${summary.started} started · ${summary.hooked} hooked (${HOOKED_WORKOUTS}+ workouts in their first 2 weeks)${summary.needNudge ? ` · ${summary.needNudge} need a nudge` : ''}`
          : 'Nobody joined in the last 30 days.'}
      </p>
      <div className="gx-list">
        {shown.map((r) => (
          <div key={r.client.id} className="gx-rank">
            <div className="gx-rank-main">
              <div className="gx-name">{r.client.name} {r.needsNudge && <span className="gx-pill red">No workout yet</span>}</div>
              <div className="gx-sub">Day {r.dayN}{r.needsTrainer ? ' · waiting for a trainer' : ''}</div>
              <div className="gx-stages">
                <Stage on label="Joined" />
                <Stage on={r.started} label={r.started ? `First workout, day ${r.firstWorkoutDay + 1}` : 'First workout'} />
                <Stage on={r.hooked} label={`${HOOKED_WORKOUTS}+ workouts (${r.workouts})`} />
              </div>
            </div>
            {r.needsNudge && (
              <div className="gx-actions">
                {r.needsTrainer && <button type="button" className="gx-btn gx-btn-blue" onClick={() => onOpenMembers('waiting', r.client.id)}>Assign trainer</button>}
                <button type="button" className="gx-btn gx-btn-dark" disabled={!hasPhone(r.client)} title={hasPhone(r.client) ? '' : 'No phone number saved for this member'} onClick={() => sendWhatsapp(r.client, newMemberMessageText(gym.name, 'waiting'))}>Welcome message</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {rows.length > shown.length && <p className="gx-sub">+{rows.length - shown.length} more who joined recently. Flagged after {NO_START_FLAG_DAYS} days with no workout.</p>}
    </section>
  );
}
