import React from 'react';
import Avatar from './Avatar';
import { getActivityStatus, daysSinceLogin } from '../utils/activityStatus';
import { buildQuietMessage } from '../utils/quietClients';
import { toWhatsappNumber, openWhatsapp } from '../utils/whatsappNudge';
import './CoachClientList.css';

const GOAL_CLASS = (goal = '') => {
  const g = goal.toLowerCase();
  if (g.includes('fat')) return 'fat';
  if (g.includes('muscle')) return 'muscle';
  if (g.includes('gut')) return 'gut';
  return 'other';
};
const GOAL_SHORT = { 'Fat Loss': 'Fat loss', 'Muscle Building': 'Muscle', 'Gut Fix': 'Gut fix' };

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function WeekDots({ glance }) {
  return (
    <span className="ccl-week" aria-label={`${glance.weekCount} workout day${glance.weekCount === 1 ? '' : 's'} this week`}>
      {glance.days.map((on, i) => (
        <span
          key={i}
          className={`ccl-day${on ? ' on' : ''}${i === glance.todayIndex ? ' today' : ''}${i > glance.todayIndex ? ' future' : ''}`}
          aria-hidden="true"
        >{DAY_LETTERS[i]}</span>
      ))}
    </span>
  );
}

const WhatsappIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9" />
    <path d="M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1" />
  </svg>
);

const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

// Coach's client list (option 2, "coach's glance"): one card, a row per
// client with this week's Mon–Sun workout dots. Clients with no workout for
// NEEDS_YOU_DAYS+ days get a red row and a WhatsApp button with a check-in
// message already written. Email and phone are deliberately not shown — the
// search box still matches email, and contact lives in the client's details.
export default function CoachClientList({
  clients,
  glances,
  recaps = {},
  demoRow = null,
  onOpen,
  hasUnread,
  isNewConnection,
  showGenericTag = false,
}) {
  const coachName = (localStorage.getItem('userName') || '').trim();
  const coachBrand = (localStorage.getItem('userBrand') || 'Fitengineers').trim();
  const signOff = coachName ? `${coachName} · ${coachBrand}` : coachBrand;

  const activeCount = clients.filter(c => !c.paused_at).length;

  return (
    <div className="ccl-wrap">
      <div className="ccl-head">
        <span>Clients · {activeCount}</span>
        <span className="ccl-head-key">This week</span>
      </div>
      <div className="ccl-card">
        {demoRow}
        {clients.map(client => {
          const glance = glances?.[client.id];
          const paused = !!client.paused_at;
          const needs = !!glance?.needsYou;
          const activity = getActivityStatus(client.last_login);
          const activityLabel = client.last_login
            ? `App: ${activity.label} · last seen ${new Date(client.last_login).toLocaleString()}`
            : `App: ${activity.label}`;
          const goal = client.userGoal;
          const open = () => { if (!paused) onOpen(client); };

          return (
            <div
              key={client.id}
              className={`ccl-row${needs ? ' needs' : ''}${paused ? ' paused' : ''}`}
              role="button"
              tabIndex={paused ? -1 : 0}
              aria-disabled={paused || undefined}
              title={paused ? 'Unpause this client (Client Payments) to manage them again' : undefined}
              onClick={open}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
            >
              <span className="ccl-avatar">
                <Avatar className="client-avatar" email={client.email} name={client.userName} avatarUrl={client.avatarUrl} size={40} />
                {hasUnread(client.id) && <span className="unread-dot ccl-unread" aria-label="New update" />}
                <span className="ccl-app-dot" role="img" title={activityLabel} aria-label={activityLabel} style={{ background: activity.color }} />
              </span>

              <span className="ccl-body">
                <span className="ccl-top">
                  <span className="ccl-name">{client.userName}</span>
                  <span className="ccl-tags">
                    {isNewConnection(client.id) && <span className="ccl-pill new">New</span>}
                    {paused && <span className="ccl-pill muted">Paused</span>}
                    {showGenericTag && !client.coach_id && <span className="ccl-pill muted">Generic</span>}
                    {goal && <span className={`ccl-pill ${GOAL_CLASS(goal)}`}>{GOAL_SHORT[goal] || goal}</span>}
                  </span>
                </span>
                <span className="ccl-sub">
                  {!glance ? (
                    !glances && <span className="ccl-week-skeleton" aria-hidden="true" />
                  ) : needs ? (
                    <span className="ccl-alert">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12.5" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                      {glance.label}
                    </span>
                  ) : (
                    <>
                      <WeekDots glance={glance} />
                      <span className="ccl-sub-text">{glance.weekCount > 0 ? `${glance.weekCount} this week` : glance.label}</span>
                    </>
                  )}
                </span>
              </span>

              {needs ? (
                <button
                  type="button"
                  className="ccl-wa"
                  aria-label={`WhatsApp ${client.userName}`}
                  title={toWhatsappNumber(client.phone) ? 'Send a check-in on WhatsApp' : 'No phone number saved — WhatsApp will ask who to send it to'}
                  onClick={e => {
                    e.stopPropagation();
                    openWhatsapp(toWhatsappNumber(client.phone), buildQuietMessage(client, daysSinceLogin(client.last_login), signOff, recaps[client.id]));
                  }}
                >
                  <WhatsappIcon />
                </button>
              ) : !paused && (
                <span className="ccl-chev"><Chevron /></span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
