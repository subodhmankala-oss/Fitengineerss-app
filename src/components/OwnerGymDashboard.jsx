import React, { useCallback, useEffect, useMemo, useState } from 'react';
import databaseService from '../services/databaseService';
import AdminSearchBox from './admin/AdminSearchBox';
import { matchesSearch } from '../utils/matchesSearch';
import { toWhatsappNumber } from '../utils/whatsappNudge';
import { OWNER_STATUS, messageMember, statusReason, weekLabels, weekRanges } from '../utils/ownerView';
import { HealthBar, PeakGrid, StatusChip, WeeklyBars } from './OwnerCharts';
import { MemberProfile, TrainerProfile } from './OwnerProfiles';

// "🏢 My Gym" — the gym owner's view inside the coach dashboard (owners are
// coach accounts that own a gym; see api/data-read.js handleOwnerGym).
// Activity only: private coach notes / progress photos are not shown to
// owners (gyms.owner_sees_private, off by default). `service` is injectable
// for tests.
//
// coachingOption (gym owners only; null for the super-admin): whether this
// owner also coaches clients — { on, locked, onChange }. When off, the owner
// is left out of their own Trainers list and the trainer dropdowns, so the
// gym shows only the trainers who actually coach there.

const UNASSIGNED = '__unassigned__';
const SELF_GUIDED = '__self__';
const ACTIVE = '__active__';
const NUDGE = '__nudge__';
const WORKOUTS = '__workouts__';
const RISK = '__risk__';
const STATUS_PREFIX = 'status:';
const AT_RISK = ['slipping', 'quiet', 'inactive'];
const RISK_ORDER = { slipping: 0, quiet: 1, inactive: 2 };
// "Need a nudge": no workout in this many days (or none in the 30-day window).
const NUDGE_DAYS = 14;

function daysSince(isoDate, today = new Date()) {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((t - d) / 86400000);
}

const isWaiting = (c) => !c.trainerName && !c.selfGuided;
const needsNudge = (c) => {
  const d = daysSince(c.lastWorkout);
  return d === null || d >= NUDGE_DAYS;
};

// "Wed, 14 Oct" — the days a member trained, shown on their card.
function dayLabel(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

// The tile views (Trained this week / Workouts this week / Not trained in 2
// weeks) each open the client list with a one-line explanation on top.
const VIEW_INFO = {
  [ACTIVE]: { title: 'Trained this week', text: 'Members who logged at least one workout in the last 7 days.' },
  [WORKOUTS]: { title: 'Workouts this week', text: 'Who trained in the last 7 days, and on which days.' },
  [NUDGE]: { title: 'Not trained in 2 weeks', text: `Members with no workout logged in the last ${NUDGE_DAYS} days. A quick message often brings them back.` },
  [RISK]: { title: 'Members to watch', text: 'Members who are slipping, have gone quiet or haven’t started — the ones most likely to leave. Each shows why.' }
};

const STATUS_TEXT = {
  thriving: 'Training twice a week or more, and not dropping off.',
  steady: 'Training regularly.',
  slipping: 'Trained often before, but under half as often in the last 2 weeks.',
  quiet: `No workout in ${NUDGE_DAYS}+ days.`,
  inactive: 'Joined a while ago but has never logged a workout.',
  new: 'Joined in the last 2 weeks and hasn’t logged a workout yet.'
};

// Title + one-line explanation for the strip above a filtered client list.
function viewInfo(filter) {
  if (VIEW_INFO[filter]) return VIEW_INFO[filter];
  if (filter.startsWith(STATUS_PREFIX)) {
    const key = filter.slice(STATUS_PREFIX.length);
    return OWNER_STATUS[key] ? { title: OWNER_STATUS[key].label, text: STATUS_TEXT[key] } : null;
  }
  return null;
}

function daysAgoLabel(isoDate, today = new Date()) {
  if (!isoDate) return 'No workouts in 30 days';
  const d = new Date(`${isoDate}T00:00:00`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((t - d) / 86400000);
  if (days <= 0) return 'Worked out today';
  if (days === 1) return 'Worked out yesterday';
  return `Last workout ${days} days ago`;
}

const card = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '14px',
  padding: '14px 16px'
};

const muted = { fontSize: '0.74rem', color: 'var(--text-muted)' };

const smallButton = {
  background: 'rgba(var(--fg-rgb), 0.04)',
  border: '1px solid var(--border-color)',
  color: 'var(--text-main)',
  borderRadius: '8px',
  padding: '6px 12px',
  fontSize: '0.78rem',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer'
};

function Initial({ name }) {
  return (
    <span aria-hidden="true" style={{
      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(var(--accent-rgb), 0.12)', color: 'var(--accent-text)',
      fontWeight: 800, fontSize: '0.85rem'
    }}>
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

// One client in My Gym → Clients. 2026-10-15: the old always-on trainer
// dropdown moved a client the instant it changed, with only "Moved to X"
// after — "a lot confusing what is happening", and no way to unassign. Now:
// a status chip (trainer / waiting), a "Change trainer" panel listing every
// trainer plus "No trainer — back to the waiting list", a plain-language
// confirm step, and a plain-language result.
const NO_TRAINER = '__none__';
const ON_OWN = '__own__';

function ClientCard({ client, trainers, locked, busy, message, onAssign, onUnassign, onOpen, view = null, gymName = '' }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(null);
  const hasTrainer = !!client.trainerName;
  const selfGuided = !hasTrainer && !!client.selfGuided;
  const current = trainers.find((t) => t.id === client.coachId);
  const chosen = trainers.find((t) => t.id === choice);
  const nameOf = (t) => (t?.isOwner ? 'you' : t?.name);

  const close = () => { setOpen(false); setChoice(null); };
  const confirm = async () => {
    const ok = choice === NO_TRAINER || choice === ON_OWN
      ? await onUnassign(client, choice === ON_OWN)
      : await onAssign(client, chosen);
    if (ok) close();
  };

  const fromTrainer = hasTrainer ? ` from ${nameOf(current) || client.trainerName}` : '';
  const confirmText = choice === NO_TRAINER
    ? hasTrainer
      ? `Remove ${client.name}${fromTrainer}? They go back to the waiting list and their app shows "Trainer coming soon".`
      : `Put ${client.name} back on the waiting list? Their app shows "Trainer coming soon" until you pick a trainer.`
    : choice === ON_OWN
      ? `${hasTrainer ? `Remove ${client.name}${fromTrainer} and mark them` : `Mark ${client.name}`} as training on their own? They stay a gym member, leave the waiting list, and won't be shown "Trainer coming soon".`
      : chosen
      ? hasTrainer
        ? `Move ${client.name}${fromTrainer} to ${nameOf(chosen)}?`
        : `Give ${client.name} to ${nameOf(chosen)} as their trainer?`
      : null;

  const option = (key, label, sub, isCurrent) => {
    const selected = choice === key;
    return (
      <button
        key={key}
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={isCurrent || busy}
        onClick={() => setChoice(key)}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left',
          padding: '10px 12px', borderRadius: '10px', fontFamily: 'inherit',
          cursor: isCurrent ? 'default' : 'pointer',
          background: selected ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
          border: `1.5px solid ${selected ? 'rgba(var(--accent-rgb), 0.6)' : 'var(--border-color)'}`,
          opacity: isCurrent ? 0.6 : 1, color: 'var(--text-main)'
        }}
      >
        <span aria-hidden="true" style={{
          width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
          border: `2px solid ${selected ? 'rgb(var(--accent-rgb))' : 'rgba(var(--fg-rgb), 0.3)'}`,
          boxShadow: selected ? 'inset 0 0 0 3px var(--bg-card), inset 0 0 0 8px rgb(var(--accent-rgb))' : 'none'
        }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '0.84rem', fontWeight: 700 }}>{label}</span>
          {sub && <span style={{ display: 'block', ...muted }}>{sub}</span>}
        </span>
        {isCurrent && <span style={{ ...muted, fontWeight: 700 }}>Current</span>}
      </button>
    );
  };

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Initial name={client.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <button
            type="button"
            onClick={() => onOpen && onOpen(client)}
            aria-label={`Open ${client.name}’s profile`}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}
          >
            {client.name} <span aria-hidden="true" style={{ color: 'var(--accent-text)' }}>›</span>
          </button>
          <div style={{ ...muted, color: client.workouts7d > 0 ? 'var(--accent-text)' : 'var(--text-muted)' }}>
            {daysAgoLabel(client.lastWorkout)}{client.workouts7d > 0 ? ` · ${client.workouts7d} this week` : ''}
          </div>
        </div>
        {client.engagement && <StatusChip status={client.engagement.status} />}
      </div>

      {(view === RISK || view === NUDGE) && client.engagement && (
        <div style={{ ...muted, lineHeight: 1.4, color: 'var(--text-main)' }}>{statusReason(client)}</div>
      )}

      {view === WORKOUTS && (client.recentDays || []).length > 0 && (
        <div aria-label={`Days ${client.name} trained this week`} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {client.recentDays.map((day) => (
            <span key={day} style={{
              fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-text)',
              background: 'rgba(var(--accent-rgb), 0.1)', border: '1px solid rgba(var(--accent-rgb), 0.25)',
              borderRadius: '999px', padding: '3px 9px'
            }}>
              {dayLabel(day)}
            </span>
          ))}
        </div>
      )}

      {(view === NUDGE || view === RISK) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {toWhatsappNumber(client.phone) ? (
            <button
              type="button"
              onClick={() => messageMember(client, gymName)}
              style={{ ...smallButton, color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.08)' }}
            >
              Message on WhatsApp
            </button>
          ) : (
            <span style={muted}>No phone number on file</span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {hasTrainer ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700,
            color: 'var(--text-main)', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: '999px', padding: '4px 10px'
          }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} />
            Trainer: {current?.isOwner ? 'You' : client.trainerName}
          </span>
        ) : selfGuided ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700,
            color: 'var(--text-main)', background: 'rgba(var(--accent-rgb), 0.1)', border: '1px solid rgba(var(--accent-rgb), 0.35)',
            borderRadius: '999px', padding: '4px 10px'
          }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgb(var(--accent-rgb))' }} />
            Trains on their own
          </span>
        ) : (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700,
            color: 'var(--text-main)', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '999px', padding: '4px 10px'
          }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b' }} />
            Waiting for a trainer
          </span>
        )}
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={locked}
            style={{ ...smallButton, marginLeft: 'auto', opacity: locked ? 0.5 : 1, cursor: locked ? 'default' : 'pointer' }}
          >
            {hasTrainer || selfGuided ? 'Change' : 'Assign trainer'}
          </button>
        )}
      </div>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '6px' }}>
            {hasTrainer || selfGuided ? `What should change for ${client.name}?` : `Pick a trainer for ${client.name}`}
          </div>
          <div role="radiogroup" aria-label={`Trainer for ${client.name}`} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {trainers.length === 0 && <div style={muted}>No trainers in your gym yet — share your gym code with them first.</div>}
            {trainers.map((t) => option(
              t.id,
              t.isOwner ? `${t.name} (you)` : t.name,
              `${t.clientCount} client${t.clientCount === 1 ? '' : 's'}`,
              t.id === client.coachId
            ))}
            {(hasTrainer || selfGuided) && option(NO_TRAINER, 'Waiting list', 'No trainer yet — you’ll pick one later', false)}
            {!selfGuided && option(ON_OWN, 'Trains on their own', 'Gym member, doesn’t want a trainer', false)}
          </div>

          {confirmText && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', background: 'rgba(var(--accent-rgb), 0.06)', border: '1px solid rgba(var(--accent-rgb), 0.2)', borderRadius: '10px', padding: '10px 12px', lineHeight: 1.45 }}>
              {confirmText}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={confirm}
              disabled={!confirmText || busy}
              style={{
                ...smallButton, flex: 1, padding: '9px 12px', border: 'none',
                background: confirmText ? 'linear-gradient(135deg, var(--primary-accent-light), var(--primary-accent))' : 'rgba(var(--fg-rgb), 0.08)',
                color: confirmText ? '#fff' : 'var(--text-muted)',
                cursor: confirmText && !busy ? 'pointer' : 'default'
              }}
            >
              {busy ? 'Saving…' : 'Confirm'}
            </button>
            <button type="button" onClick={close} disabled={busy} style={{ ...smallButton, flex: '0 0 auto', padding: '9px 14px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <div role={message.error ? 'alert' : 'status'} style={{ fontSize: '0.78rem', fontWeight: 600, color: message.error ? 'var(--danger)' : '#10b981' }}>
          {message.error ? '✕ ' : '✓ '}{message.text}
        </div>
      )}
    </div>
  );
}

export default function OwnerGymDashboard({ service = databaseService, coachingOption = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('overview');
  const [profileClient, setProfileClient] = useState(null);
  const [profileTrainer, setProfileTrainer] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [trainerFilter, setTrainerFilter] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [rowMsg, setRowMsg] = useState({});
  const [copied, setCopied] = useState(false);

  const applyLoad = useCallback((result) => {
    if (result.success) {
      setData(result);
      setLoadError('');
    } else {
      setLoadError(result.error);
    }
    setLoading(false);
  }, []);

  const load = async () => applyLoad(await service.getOwnerGym());

  useEffect(() => {
    let cancelled = false;
    service.getOwnerGym().then((result) => { if (!cancelled) applyLoad(result); });
    return () => { cancelled = true; };
  }, [service, applyLoad]);

  const ownerCoaches = !coachingOption || coachingOption.on;
  const trainers = useMemo(
    () => (data?.trainers || []).filter((t) => ownerCoaches || !t.isOwner),
    [data, ownerCoaches]
  );
  const clients = useMemo(() => data?.clients || [], [data]);

  const filteredClients = useMemo(() => clients
    .filter((c) => {
      if (!trainerFilter) return true;
      if (trainerFilter === UNASSIGNED) return isWaiting(c);
      if (trainerFilter === SELF_GUIDED) return !c.trainerName && c.selfGuided;
      if (trainerFilter === ACTIVE || trainerFilter === WORKOUTS) return c.workouts7d > 0;
      if (trainerFilter === NUDGE) return needsNudge(c);
      if (trainerFilter === RISK) return AT_RISK.includes(c.engagement?.status);
      if (trainerFilter.startsWith(STATUS_PREFIX)) return c.engagement?.status === trainerFilter.slice(STATUS_PREFIX.length);
      return c.coachId === trainerFilter;
    })
    .filter((c) => matchesSearch(searchQuery, [c.name, c.email, c.trainerName]))
    .sort((a, b) => {
      // Most active first; quietest first for the nudge list (never-trained
      // members lead it).
      if (trainerFilter === ACTIVE || trainerFilter === WORKOUTS) {
        return (b.workouts7d - a.workouts7d) || a.name.localeCompare(b.name);
      }
      if (trainerFilter === RISK) {
        const ra = RISK_ORDER[a.engagement?.status] ?? 9;
        const rb = RISK_ORDER[b.engagement?.status] ?? 9;
        return (ra - rb) || ((b.engagement?.prior28 || 0) - (a.engagement?.prior28 || 0)) || a.name.localeCompare(b.name);
      }
      if (trainerFilter === NUDGE) {
        const da = a.lastWorkout || '';
        const db = b.lastWorkout || '';
        return da.localeCompare(db) || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    }),
  [clients, trainerFilter, searchQuery]);

  if (loading) {
    return (
      <div className="trainer-loading-container" style={{ padding: '40px 0' }}>
        <div className="trainer-spinner"></div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading your gym...</p>
      </div>
    );
  }

  if (!data?.gym) {
    return (
      <div className="trainer-empty-state">
        <h5>{loadError ? 'Could not load your gym' : 'No gym yet'}</h5>
        <p>{loadError || 'This account does not own a gym.'}</p>
        {loadError && <button type="button" style={smallButton} onClick={load}>Retry</button>}
      </div>
    );
  }

  const { gym } = data;
  const activeThisWeek = clients.filter((c) => c.workouts7d > 0).length;
  const workoutsThisWeek = clients.reduce((sum, c) => sum + (c.workouts7d || 0), 0);
  const nudgeCount = clients.filter(needsNudge).length;
  const unassignedCount = clients.filter(isWaiting).length;
  const selfGuidedCount = clients.filter((c) => !c.trainerName && c.selfGuided).length;
  const showClients = (filter) => { setTab('clients'); setTrainerFilter(filter); setSearchQuery(''); };
  const handleManage = (client) => {
    setProfileClient(null);
    setTab('clients');
    setTrainerFilter('');
    setSearchQuery(client.name);
  };
  const insights = data.insights || null;
  const atRiskMembers = clients
    .filter((c) => AT_RISK.includes(c.engagement?.status))
    .sort((a, b) => (RISK_ORDER[a.engagement.status] - RISK_ORDER[b.engagement.status]) || (b.engagement.prior28 - a.engagement.prior28) || a.name.localeCompare(b.name));
  const topMembers = [...clients].filter((c) => c.workouts30d > 0).sort((a, b) => b.workouts30d - a.workouts30d || a.name.localeCompare(b.name)).slice(0, 3);
  const weeklyWorkouts = insights ? insights.weekly.map((w) => w.workouts) : [];
  const thisWeek = weeklyWorkouts[weeklyWorkouts.length - 1] ?? 0;
  const lastWeek = weeklyWorkouts[weeklyWorkouts.length - 2] ?? 0;
  const trendText = thisWeek === lastWeek
    ? `${thisWeek} this week · same as last week`
    : `${thisWeek} this week · ${thisWeek > lastWeek ? 'up' : 'down'} ${Math.abs(thisWeek - lastWeek)} from last week`;

  const overview = !insights ? (
    <div style={{ ...card, ...muted }}>Insights will appear here once your members start training.</div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={card}>
        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)' }}>Workouts per week</div>
        <div style={{ ...muted, marginBottom: '10px' }}>{trendText}</div>
        <WeeklyBars
          values={weeklyWorkouts}
          labels={weekLabels(insights.today, weeklyWorkouts.length)}
          ranges={weekRanges(insights.today, weeklyWorkouts.length)}
          secondary={insights.weekly.map((w) => w.members)}
          unit="workouts"
          title="Gym workouts per week"
        />
      </div>

      <div style={card}>
        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)' }}>Member health</div>
        <div style={{ ...muted, marginBottom: '10px' }}>Where each member is right now, from how often they trained lately. Tap a group to see them.</div>
        <HealthBar health={insights.health} onSelect={(k) => showClients(`${STATUS_PREFIX}${k}`)} />
      </div>

      <div style={card}>
        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)' }}>Members to watch</div>
        <div style={{ ...muted, marginBottom: '6px' }}>The members most likely to leave, with why.</div>
        {atRiskMembers.length === 0 ? (
          <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', padding: '6px 0' }}>Nobody is slipping right now. 🎉</div>
        ) : (
          <>
            {atRiskMembers.slice(0, 5).map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderTop: i ? '1px solid rgba(var(--fg-rgb), 0.06)' : 'none' }}>
                <Initial name={c.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button type="button" onClick={() => setProfileClient(c)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)', textAlign: 'left' }}>
                    {c.name} <span aria-hidden="true" style={{ color: 'var(--accent-text)' }}>›</span>
                  </button>
                  <div style={{ ...muted, lineHeight: 1.35 }}>{statusReason(c)}</div>
                  <div style={{ marginTop: 5, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <StatusChip status={c.engagement.status} />
                    {toWhatsappNumber(c.phone) && (
                      <button type="button" onClick={() => messageMember(c, gym.name)} style={{ ...smallButton, padding: '3px 10px', fontSize: '0.72rem', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.4)' }}>
                        Message
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => showClients(RISK)} style={{ ...smallButton, marginTop: '8px' }}>
              See all {atRiskMembers.length} ›
            </button>
          </>
        )}
      </div>

      <div style={card}>
        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)' }}>Busiest times</div>
        <div style={{ ...muted, marginBottom: '10px' }}>When members log workouts (India time), over the last 8 weeks.</div>
        {insights.peak.total < 5 ? (
          <div style={muted}>Not enough workouts yet — this fills in as members train.</div>
        ) : (
          <PeakGrid grid={insights.peak.grid} />
        )}
      </div>

      <div style={card}>
        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)' }}>Most consistent this month</div>
        <div style={{ ...muted, marginBottom: '6px' }}>Workout days in the last 30 days.</div>
        {topMembers.length === 0 ? (
          <div style={muted}>No workouts in the last 30 days.</div>
        ) : topMembers.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setProfileClient(c)}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', background: 'none', border: 'none', borderTop: i ? '1px solid rgba(var(--fg-rgb), 0.06)' : 'none', padding: '9px 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'inherit' }}
          >
            <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.74rem', fontWeight: 800, background: 'rgba(var(--accent-rgb), 0.12)', color: 'var(--accent-text)' }}>{i + 1}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)' }}>{c.name}</span>
              <span style={{ display: 'block', ...muted }}>{c.trainerName ? `Trainer: ${c.trainerName}` : 'No trainer'}</span>
            </span>
            <span style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-main)' }}>{c.workouts30d} days</span>
          </button>
        ))}
      </div>
    </div>
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(gym.joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — the code is on screen */ }
  };

  // Both resolve true on success so the card can close its panel.
  const runChange = async (client, call, successText) => {
    setSavingId(client.id);
    setRowMsg((m) => ({ ...m, [client.id]: null }));
    const result = await call();
    setSavingId(null);
    if (!result.success) {
      setRowMsg((m) => ({ ...m, [client.id]: { error: true, text: result.error } }));
      return false;
    }
    setRowMsg((m) => ({ ...m, [client.id]: { error: false, text: successText } }));
    await load();
    return true;
  };

  const handleAssign = (client, trainer) => runChange(
    client,
    () => service.ownerAssignClient(client.id, trainer.id),
    trainer.isOwner
      ? `${client.name} is now your client.`
      : `${client.name} is now with ${trainer.name}. ${trainer.name} has been notified.`
  );

  const handleUnassign = (client, selfGuided) => runChange(
    client,
    () => service.ownerUnassignClient(client.id, selfGuided),
    selfGuided ? `${client.name} now trains on their own.` : `${client.name} is back on the waiting list.`
  );

  // This-week insight tiles (2026-10-15: the old Trainers / Clients counts
  // just repeated the tab labels below). Tapping one lists those clients.
  const statTile = (label, value, tone, filter) => (
    <button
      type="button"
      onClick={() => showClients(filter)}
      style={{
        ...card, flex: 1, minWidth: 0, padding: '12px 8px 10px', textAlign: 'center', fontFamily: 'inherit',
        cursor: 'pointer', color: 'inherit'
      }}
    >
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: tone || 'var(--text-main)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ ...muted, marginTop: 4, lineHeight: 1.25, color: 'var(--text-main)', fontWeight: 600 }}>{label}</div>
      <div style={{ ...muted, marginTop: 5, fontSize: '0.66rem', fontWeight: 700, color: 'var(--accent-text)' }}>See who ›</div>
    </button>
  );

  return (
    <div className="owner-gym-view animate-scale-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '24px', width: '100%', boxSizing: 'border-box' }}>
      {gym.status === 'suspended' && (
        <div role="alert" style={{ ...card, borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.06)', color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 600 }}>
          This gym is suspended. You can still see your trainers and clients, but changes are paused. Contact Fitengineers support.
        </div>
      )}

      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <div style={{ ...muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>🏢 My Gym</div>
          <h3 style={{ margin: '2px 0 0 0', fontSize: '1.15rem', color: 'var(--text-main)' }}>{gym.name}</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <code style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-main)', background: 'rgba(var(--fg-rgb), 0.05)', border: '1px dashed var(--border-color)', borderRadius: '8px', padding: '6px 12px' }}>
            {gym.joinCode}
          </code>
          <button type="button" onClick={handleCopy} style={smallButton}>
            {copied ? 'Copied' : 'Copy code'}
          </button>
        </div>
        <div style={muted}>Share it with your trainers and with new members. Trainers join straight away; members wait here for you to pick their trainer.</div>
      </div>

      {unassignedCount > 0 && gym.status === 'active' && (
        <button
          type="button"
          onClick={() => showClients(UNASSIGNED)}
          style={{ ...card, display: 'flex', alignItems: 'center', gap: '10px', width: '100%', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderColor: 'rgba(245, 158, 11, 0.35)', background: 'rgba(245, 158, 11, 0.08)' }}
        >
          <span style={{ fontSize: '1.2rem' }}>👋</span>
          <span style={{ flex: 1, fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-main)' }}>
            {unassignedCount} client{unassignedCount === 1 ? ' is' : 's are'} waiting for a trainer
          </span>
          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#f59e0b', whiteSpace: 'nowrap' }}>Assign →</span>
        </button>
      )}

      <div>
        <div style={{ ...muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 2px 8px' }}>This week</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {statTile('Trained this week', `${activeThisWeek}/${clients.length}`, 'var(--accent-text)', ACTIVE)}
          {statTile('Workouts this week', workoutsThisWeek, null, WORKOUTS)}
          {statTile('Not trained in 2 weeks', nudgeCount, nudgeCount ? '#f59e0b' : null, NUDGE)}
        </div>
      </div>

      <div role="tablist" aria-label="Gym view" style={{ display: 'flex', gap: '4px', padding: '4px', background: 'rgba(var(--fg-rgb), 0.04)', border: '1px solid rgba(var(--fg-rgb), 0.08)', borderRadius: '12px' }}>
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'trainers', label: `Trainers (${trainers.length})` },
          { key: 'clients', label: `Clients (${clients.length})` }
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '9px 10px', borderRadius: '9px', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 800,
              background: tab === t.key ? 'rgba(var(--accent-rgb), 0.14)' : 'transparent',
              color: tab === t.key ? 'var(--accent-text)' : 'rgba(148,163,184,0.65)'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        overview
      ) : tab === 'trainers' ? (
        trainers.length === 0 ? (
          <div className="trainer-empty-state"><h5>No trainers yet</h5><p>Share your gym code with your trainers.</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ ...muted, margin: '0 2px' }}>Ordered by how many of each trainer’s clients are still training. Tap a trainer for their full picture.</div>
            {[...trainers].sort((a, b) => ((b.stats?.activePct ?? -1) - (a.stats?.activePct ?? -1)) || a.name.localeCompare(b.name)).map((t) => {
              const st = t.stats || {};
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setProfileTrainer(t)}
                  style={{ ...card, display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', width: '100%' }}
                  title={`Open ${t.name}’s profile`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                    <Initial name={t.name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {t.name}
                        {t.isOwner && <span style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--tint-violet)', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '4px', padding: '1px 5px' }}>You</span>}
                      </div>
                      <div style={{ ...muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.email}</div>
                    </div>
                    <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>›</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                    <div style={{ flex: '0 0 22%' }}>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>{t.clientCount}</div>
                      <div style={muted}>client{t.clientCount === 1 ? '' : 's'}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>{st.activePct === null || st.activePct === undefined ? '–' : `${st.activePct}%`}</div>
                      <div style={muted}>still training</div>
                      <div aria-hidden="true" style={{ height: 4, borderRadius: 2, background: 'rgba(var(--fg-rgb), 0.08)', marginTop: 5 }}>
                        <div style={{ width: `${st.activePct || 0}%`, height: '100%', borderRadius: 2, background: 'rgb(var(--accent-rgb))' }} />
                      </div>
                    </div>
                    <div style={{ flex: '0 0 26%' }}>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>{st.perClientWeek ?? '–'}</div>
                      <div style={muted}>workouts / client / week</div>
                    </div>
                  </div>
                  {st.atRisk > 0 && (
                    <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#f59e0b' }}>
                      {st.atRisk} client{st.atRisk === 1 ? '' : 's'} slipping or gone quiet
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 180px' }}>
              <AdminSearchBox value={searchQuery} onChange={setSearchQuery} placeholder="🔍 Search client or trainer..." />
            </div>
            <select
              aria-label="Filter by trainer"
              value={trainerFilter}
              onChange={(e) => setTrainerFilter(e.target.value)}
              style={{ flex: '0 1 170px', background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px', fontFamily: 'inherit', fontSize: '0.8rem' }}
            >
              <option value="">All clients</option>
              <option value={ACTIVE}>Trained this week ({activeThisWeek})</option>
              <option value={WORKOUTS}>Workouts this week ({workoutsThisWeek})</option>
              <option value={NUDGE}>Not trained in 2 weeks ({nudgeCount})</option>
              <option value={RISK}>Members to watch ({atRiskMembers.length})</option>
              {trainerFilter.startsWith(STATUS_PREFIX) && viewInfo(trainerFilter) && (
                <option value={trainerFilter}>{viewInfo(trainerFilter).title}</option>
              )}
              {trainers.map((t) => <option key={t.id} value={t.id}>{t.isOwner ? 'Your clients' : `${t.name}’s clients`}</option>)}
              {unassignedCount > 0 && <option value={UNASSIGNED}>Waiting for a trainer ({unassignedCount})</option>}
              {selfGuidedCount > 0 && <option value={SELF_GUIDED}>Train on their own ({selfGuidedCount})</option>}
            </select>
          </div>

          {viewInfo(trainerFilter) && (
            <div style={{ ...card, padding: '10px 14px', background: 'rgba(var(--accent-rgb), 0.06)', borderColor: 'rgba(var(--accent-rgb), 0.2)' }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {viewInfo(trainerFilter).title}
                {trainerFilter === WORKOUTS && ` · ${workoutsThisWeek} workout${workoutsThisWeek === 1 ? '' : 's'} by ${activeThisWeek} member${activeThisWeek === 1 ? '' : 's'}`}
              </div>
              <div style={{ ...muted, marginTop: 2, lineHeight: 1.4 }}>{viewInfo(trainerFilter).text}</div>
            </div>
          )}

          {filteredClients.length === 0 ? (
            <div className="trainer-empty-state">
              {trainerFilter === NUDGE && !searchQuery.trim() ? (
                <>
                  <h5>Everyone’s been training 🎉</h5>
                  <p>Every member has logged a workout in the last {NUDGE_DAYS} days.</p>
                </>
              ) : (trainerFilter === ACTIVE || trainerFilter === WORKOUTS) && !searchQuery.trim() ? (
                <>
                  <h5>No workouts yet this week</h5>
                  <p>Members who log a workout in the last 7 days will show up here.</p>
                </>
              ) : (
                <>
                  <h5>No clients {clients.length ? 'match' : 'yet'}</h5>
                  <p>{clients.length ? 'Try a different search or trainer.' : 'Clients appear here when they join one of your trainers.'}</p>
                </>
              )}
            </div>
          ) : filteredClients.map((c) => (
            <ClientCard
              key={c.id}
              client={c}
              view={trainerFilter === WORKOUTS || trainerFilter === NUDGE || trainerFilter === RISK ? trainerFilter : null}
              onOpen={setProfileClient}
              gymName={gym.name}
              trainers={trainers}
              locked={gym.status !== 'active'}
              busy={savingId === c.id}
              message={rowMsg[c.id]}
              onAssign={handleAssign}
              onUnassign={handleUnassign}
            />
          ))}
        </div>
      )}

      {coachingOption && (
        <label style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px', cursor: coachingOption.locked ? 'default' : 'pointer' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>Also coach clients</div>
            <div style={muted}>
              {coachingOption.locked
                ? 'On while you have clients of your own.'
                : coachingOption.on
                  ? 'You have a My Clients tab and can invite clients yourself.'
                  : 'Turn on to get a My Clients tab and invite your own clients.'}
            </div>
          </div>
          <input
            type="checkbox"
            role="switch"
            aria-label="Also coach clients"
            checked={coachingOption.on}
            disabled={coachingOption.locked}
            onChange={(e) => coachingOption.onChange(e.target.checked)}
            style={{ width: 20, height: 20, accentColor: 'var(--primary-accent, #4364bd)', cursor: 'inherit' }}
          />
        </label>
      )}

      {profileClient && (
        <MemberProfile
          client={profileClient}
          gymName={gym.name}
          today={insights?.today}
          service={service}
          onClose={() => setProfileClient(null)}
          onManage={handleManage}
        />
      )}
      {profileTrainer && (
        <TrainerProfile
          trainer={profileTrainer}
          clients={clients}
          today={insights?.today}
          onClose={() => setProfileTrainer(null)}
          onOpenMember={(c) => { setProfileTrainer(null); setProfileClient(c); }}
          onShowClients={(t) => { setProfileTrainer(null); showClients(t.id); }}
        />
      )}
    </div>
  );
}
