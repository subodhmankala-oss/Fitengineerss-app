import React, { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import { toWhatsappNumber } from '../utils/whatsappNudge';
import { agoLabel, messageMember, shortDate, statusReason, weekLabels, weekRanges, weeksBeforeJoin } from '../utils/ownerView';
import { StatusChip, WeeklyBars } from './OwnerCharts';
import './OwnerGymDashboard.css';

// Full-screen profiles opened from My Gym: one member (12 weeks of activity,
// recent sessions, who has coached them) and one trainer (their scorecard,
// their clients' weekly activity, their client list). Activity and coaching
// history only — private notes, photos and body measurements are never shown
// to owners.

const card = {
  background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '14px 16px'
};
const muted = { fontSize: '0.74rem', color: 'var(--text-muted)' };
const smallButton = {
  background: 'rgba(var(--fg-rgb), 0.04)', border: '1px solid var(--border-color)', color: 'var(--text-main)',
  borderRadius: '8px', padding: '7px 12px', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer'
};

function Overlay({ title, onClose, children }) {
  return (
    <div
      className="og-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="og-overlay-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button type="button" onClick={onClose} aria-label="Back" style={{ ...smallButton, padding: '8px 12px' }}>‹ Back</button>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 0, padding: '12px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ ...muted, marginTop: 4, lineHeight: 1.25, color: 'var(--text-main)', fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ ...muted, fontSize: '0.66rem', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ margin: '2px 2px 8px' }}>
      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)' }}>{children}</div>
      {sub && <div style={muted}>{sub}</div>}
    </div>
  );
}

function Initial({ name, size = 44 }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(var(--accent-rgb), 0.12)', color: 'var(--accent-text)', fontWeight: 800, fontSize: size * 0.4
    }}>
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

const fmtNumber = (n) => Number(n || 0).toLocaleString('en-IN');

// ─── One member ───
export function MemberProfile({ client, gymName, today, service = databaseService, onClose, onManage }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    service.getOwnerMember(client.id).then((r) => {
      if (cancelled) return;
      setState(r.success ? { loading: false, data: r, error: '' } : { loading: false, data: null, error: r.error });
    });
    return () => { cancelled = true; };
  }, [service, client.id]);

  const { data } = state;
  const m = data?.member;
  const hasPhone = !!toWhatsappNumber(client.phone);

  return (
    <Overlay title="Member" onClose={onClose}>
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Initial name={client.name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>{client.name}</div>
            <div style={{ ...muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.email}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <StatusChip status={client.engagement?.status} />
          <span style={muted}>
            {client.trainerName ? `Trainer: ${client.trainerName}` : client.selfGuided ? 'Trains on their own' : 'Waiting for a trainer'}
          </span>
        </div>
        <div style={{ ...muted, lineHeight: 1.45 }}>{statusReason(client)}</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {hasPhone && <button type="button" onClick={() => messageMember(client, gymName)} style={{ ...smallButton, color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.4)' }}>Message on WhatsApp</button>}
          <button type="button" onClick={() => onManage(client)} style={smallButton}>Change trainer</button>
        </div>
      </div>

      {state.loading && <div style={{ ...muted, textAlign: 'center', padding: '24px 0' }}>Loading their activity…</div>}
      {state.error && <div role="alert" style={{ ...card, color: 'var(--danger)', fontSize: '0.8rem', fontWeight: 600 }}>{state.error}</div>}

      {data && (
        <>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Stat label="Workouts · 30 days" value={data.stats.workouts30d} />
            <Stat label="Workouts · 90 days" value={data.stats.workouts90d} sub={`${data.stats.perWeek} a week`} />
            <Stat label="Last workout" value={agoLabel(data.stats.lastWorkout)} />
          </div>

          <div style={card}>
            <SectionTitle sub="Workouts in each of the last 12 weeks">Activity</SectionTitle>
            <WeeklyBars
              values={data.stats.weeks}
              labels={weekLabels(today, data.stats.weeks.length)}
              ranges={weekRanges(today, data.stats.weeks.length)}
              beforeCount={weeksBeforeJoin(today, data.stats.weeks.length, m.joinedAt)}
              unit="workouts"
              labelEvery={3}
              title={`${client.name}: workouts per week`}
            />
          </div>

          <div style={card}>
            <SectionTitle>About</SectionTitle>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: '0.82rem' }}>
              {[
                ['Goal', m.goal],
                ['Program', m.program ? `${m.program}${m.programStartedOn ? ` · started ${shortDate(m.programStartedOn)}` : ''}` : null],
                ['Sessions in package', m.totalSessions],
                ['Member since', m.joinedAt ? shortDate(String(m.joinedAt).slice(0, 10)) : null],
                ['Last opened the app', m.lastLogin ? agoLabel(String(m.lastLogin).slice(0, 10)) : null]
              ].filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt style={{ color: 'var(--text-muted)' }}>{k}</dt>
                  <dd style={{ margin: 0, color: 'var(--text-main)', fontWeight: 600 }}>{v}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>

          <div style={card}>
            <SectionTitle sub="Their latest workouts">Recent sessions</SectionTitle>
            {data.sessions.length === 0 ? (
              <div style={muted}>No workouts logged in the last 90 days.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {data.sessions.map((s, i) => (
                  <div key={`${s.date}-${i}`} style={{ display: 'flex', gap: '12px', padding: '9px 0', borderTop: i ? '1px solid rgba(var(--fg-rgb), 0.06)' : 'none' }}>
                    <div style={{ width: '54px', flexShrink: 0, fontSize: '0.74rem', fontWeight: 800, color: 'var(--accent-text)' }}>{shortDate(s.date)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-main)' }}>{s.plan || 'Workout'}</div>
                      <div style={muted}>
                        {s.exercises} exercise{s.exercises === 1 ? '' : 's'} · {s.sets} set{s.sets === 1 ? '' : 's'}{s.volumeKg > 0 ? ` · ${fmtNumber(s.volumeKg)} kg lifted` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={card}>
            <SectionTitle sub="Who has coached them, and how they came to be with them">Coaching history</SectionTitle>
            {data.history.length === 0 ? (
              <div style={muted}>No coaching history yet.</div>
            ) : (
              <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {data.history.map((h, i) => (
                  <li key={i} style={{ display: 'flex', gap: '10px' }}>
                    <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: h.endedAt ? 'rgba(var(--fg-rgb), 0.25)' : '#10b981' }} />
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        {h.trainerName}{!h.endedAt && <span style={{ ...muted, fontWeight: 700, marginLeft: 6 }}>Current</span>}
                      </div>
                      <div style={muted}>
                        {shortDate(String(h.startedAt).slice(0, 10))} – {h.endedAt ? shortDate(String(h.endedAt).slice(0, 10)) : 'now'} · {h.how}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </Overlay>
  );
}

// ─── One trainer ───
export function TrainerProfile({ trainer, clients, today, onClose, onOpenMember, onShowClients }) {
  const mine = clients.filter((c) => c.coachId === trainer.id);
  const st = trainer.stats || {};
  const order = { slipping: 0, quiet: 1, inactive: 2, new: 3, steady: 4, thriving: 5 };
  const sorted = [...mine].sort((a, b) => (order[a.engagement?.status] - order[b.engagement?.status]) || a.name.localeCompare(b.name));

  return (
    <Overlay title="Trainer" onClose={onClose}>
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Initial name={trainer.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)' }}>
            {trainer.name}{trainer.isOwner ? ' (you)' : ''}
          </div>
          <div style={{ ...muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trainer.email}</div>
          <div style={muted}>{trainer.lastLogin ? `Last opened the app ${agoLabel(String(trainer.lastLogin).slice(0, 10)).toLowerCase()}` : 'Hasn’t opened the app yet'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <Stat label="Clients" value={mine.length} />
        <Stat label="Still training" value={st.activePct === null || st.activePct === undefined ? '–' : `${st.activePct}%`} sub={mine.length ? `${st.active14} of ${mine.length} in 2 weeks` : null} />
        <Stat label="Per client / week" value={st.perClientWeek ?? '–'} sub="workouts" />
      </div>

      <div style={card}>
        <SectionTitle sub="Workouts logged by their clients, week by week">Their clients’ activity</SectionTitle>
        <WeeklyBars
          values={st.weekly || new Array(8).fill(0)}
          labels={weekLabels(today, 8)}
          ranges={weekRanges(today, 8)}
          unit="workouts"
          title={`${trainer.name}: clients’ workouts per week`}
        />
      </div>

      <div style={card}>
        <SectionTitle sub="Members who need attention are listed first">Clients ({mine.length})</SectionTitle>
        {mine.length === 0 ? (
          <div style={muted}>No clients yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sorted.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onOpenMember(c)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderTop: i ? '1px solid rgba(var(--fg-rgb), 0.06)' : 'none', padding: '10px 0', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}
              >
                <Initial name={c.name} size={32} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)' }}>{c.name}</span>
                  <span style={{ display: 'block', ...muted }}>{c.lastWorkout ? `Last workout ${agoLabel(c.lastWorkout).toLowerCase()}` : 'No recent workouts'}</span>
                </span>
                <StatusChip status={c.engagement?.status} />
                <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>›</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button type="button" onClick={() => onShowClients(trainer)} style={{ ...smallButton, alignSelf: 'flex-start' }}>
        Manage these clients
      </button>
    </Overlay>
  );
}
