import React from 'react';
import Avatar from './Avatar';
import { getActivityStatus, daysSinceLogin } from '../utils/activityStatus';
import { buildQuietMessage } from '../utils/quietClients';
import { toWhatsappNumber, openWhatsapp } from '../utils/whatsappNudge';
import { BREAK_REASONS, formatBreakDateShort } from '../utils/clientBreaks';
import { BreakReasonIcon } from './ClientBreakIcons';
import './CoachClientList.css';

const GOAL_CLASS = (goal = '') => {
  const g = goal.toLowerCase();
  if (g.includes('fat')) return 'fat';
  if (g.includes('muscle')) return 'muscle';
  if (g.includes('gut')) return 'gut';
  return 'other';
};
const GOAL_SHORT = { 'Fat Loss': 'Fat loss', 'Muscle Building': 'Muscle', 'Gut Fix': 'Gut fix', 'Gut Health': 'Gut fix', 'General Fitness': 'Fitness' };

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function WeekDots({ glance, live = false }) {
  return (
    <span className="ccl-week" aria-label={`${glance.weekCount} workout day${glance.weekCount === 1 ? '' : 's'} this week`}>
      {glance.days.map((on, i) => (
        <span
          key={i}
          className={live && i === glance.todayIndex
            ? 'ccl-day live'
            : `ccl-day${on ? ' on' : ''}${glance.offDays?.[i] ? ' off' : ''}${i === glance.todayIndex ? ' today' : ''}${i > glance.todayIndex ? ' future' : ''}`}
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
// NEEDS_YOU_DAYS+ days get a red "since last workout" line (the only red on
// the list) and a WhatsApp button with a check-in message already written.
// A client training right now (liveIds) gets a pulsing green today dot. Email and phone are deliberately not shown — the
// search box still matches email, and contact lives in the client's details.
export default function CoachClientList({
  clients,
  glances,
  recaps = {},
  liveIds = null,
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
          const live = !!liveIds?.has(client.id) && !paused;
          // Training right now beats "needs you" — they're back.
          const needs = !!glance?.needsYou && !live;
          const activity = getActivityStatus(client.last_login);
          const activityLabel = client.last_login
            ? `App: ${activity.label} · last seen ${new Date(client.last_login).toLocaleString()}`
            : `App: ${activity.label}`;
          // Main goal first, then the second goal if the client picked one.
          const goals = [...new Set([client.userGoal, client.userSecondaryGoal].filter(Boolean))];
          const open = () => { if (!paused) onOpen(client); };
          // On a break the whole row takes the reason's colour (Holiday blue,
          // Illness violet, Emergency red, Other amber).
          const away = glance?.away && !live ? glance.away : null;
          const awayMeta = away ? (BREAK_REASONS[away.reason] || BREAK_REASONS.other) : null;
          const awayTitle = away ? `${awayMeta.label}: ${away.note}` : undefined;

          return (
            <div
              key={client.id}
              className={`ccl-row${needs ? ' needs' : ''}${paused ? ' paused' : ''}${away ? ' away' : ''}`}
              style={away ? { '--c': awayMeta.color, '--c-rgb': awayMeta.rgb } : undefined}
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
                {away ? (
                  // On a break: the reason's icon sits where the app dot is.
                  <span className="ccl-app-dot ccl-break-badge" role="img" title={awayTitle} aria-label={`${awayMeta.status}, ${glance.label}`}>
                    <BreakReasonIcon reason={away.reason} size={14} strokeWidth={2.4} />
                  </span>
                ) : (
                  <span className="ccl-app-dot" role="img" title={activityLabel} aria-label={activityLabel} style={{ background: activity.color }} />
                )}
              </span>

              <span className="ccl-body">
                <span className="ccl-top">
                  <span className="ccl-name-line">
                    <span className="ccl-name">{client.userName}</span>
                    {goals.map(g => (
                      <span key={g} className={`ccl-goal ${GOAL_CLASS(g)}`}>{GOAL_SHORT[g] || g}</span>
                    ))}
                  </span>
                  <span className="ccl-tags">
                    {isNewConnection(client.id) && <span className="ccl-pill new">New</span>}
                    {paused && <span className="ccl-pill muted">Paused</span>}
                    {showGenericTag && !client.coach_id && <span className="ccl-pill muted">Generic</span>}
                  </span>
                </span>
                <span className="ccl-sub">
                  {!glance ? (
                    !glances && <span className="ccl-week-skeleton" aria-hidden="true" />
                  ) : needs ? (
                    <span className="ccl-alert">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
                      {glance.label}
                    </span>
                  ) : away ? (
                    <>
                      <WeekDots glance={glance} />
                      <span className="ccl-away" title={awayTitle}>
                        {awayMeta.short} · back {formatBreakDateShort(away.backDate)}
                      </span>
                    </>
                  ) : live ? (
                    <>
                      <WeekDots glance={glance} live />
                      <span className="ccl-sub-text live">Training now</span>
                    </>
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
