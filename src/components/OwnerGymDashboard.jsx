import React, { useCallback, useEffect, useMemo, useState } from 'react';
import databaseService from '../services/databaseService';
import AdminSearchBox from './admin/AdminSearchBox';
import { matchesSearch } from '../utils/matchesSearch';
import { getActivityStatus } from '../utils/activityStatus';

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

export default function OwnerGymDashboard({ service = databaseService, coachingOption = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('trainers');
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
    .filter((c) => !trainerFilter
      || (trainerFilter === UNASSIGNED ? !c.trainerName : c.coachId === trainerFilter))
    .filter((c) => matchesSearch(searchQuery, [c.name, c.email, c.trainerName]))
    .sort((a, b) => a.name.localeCompare(b.name)),
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
  const unassignedCount = clients.filter((c) => !c.trainerName).length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(gym.joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — the code is on screen */ }
  };

  const handleAssign = async (client, coachId) => {
    if (!coachId || coachId === client.coachId) return;
    setSavingId(client.id);
    setRowMsg((m) => ({ ...m, [client.id]: null }));
    const result = await service.ownerAssignClient(client.id, coachId);
    setSavingId(null);
    if (!result.success) {
      setRowMsg((m) => ({ ...m, [client.id]: { error: true, text: result.error } }));
      return;
    }
    const to = trainers.find((t) => t.id === coachId);
    setRowMsg((m) => ({ ...m, [client.id]: { error: false, text: `Moved to ${to?.name || 'trainer'}` } }));
    await load();
  };

  const statTile = (label, value, tone) => (
    <div style={{ ...card, flex: 1, padding: '12px', textAlign: 'center' }}>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: tone || 'var(--text-main)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ ...muted, marginTop: 4 }}>{label}</div>
    </div>
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
        <div style={muted}>Your gym code — share it with your trainers.</div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        {statTile('Trainers', trainers.length)}
        {statTile('Clients', clients.length)}
        {statTile('Active this week', activeThisWeek, 'var(--accent-text)')}
      </div>

      <div role="tablist" aria-label="Gym view" style={{ display: 'flex', gap: '4px', padding: '4px', background: 'rgba(var(--fg-rgb), 0.04)', border: '1px solid rgba(var(--fg-rgb), 0.08)', borderRadius: '12px' }}>
        {[
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

      {tab === 'trainers' ? (
        trainers.length === 0 ? (
          <div className="trainer-empty-state"><h5>No trainers yet</h5><p>Share your gym code with your trainers.</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {trainers.map((t) => {
              const activity = getActivityStatus(t.lastLogin);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTrainerFilter(t.id); setSearchQuery(''); setTab('clients'); }}
                  style={{ ...card, display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', width: '100%' }}
                  title={`Show ${t.name}'s clients`}
                >
                  <Initial name={t.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {t.name}
                      {t.isOwner && <span style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--tint-violet)', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '4px', padding: '1px 5px' }}>You</span>}
                    </div>
                    <div style={{ ...muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.email}</div>
                    <div style={{ ...muted, marginTop: 3 }}>
                      👥 {t.clientCount} client{t.clientCount === 1 ? '' : 's'} · {t.activeClients7d} active this week
                    </div>
                  </div>
                  <span style={{ background: activity.bg, border: `1px solid ${activity.border}`, color: activity.color, padding: '2px 6px', borderRadius: '4px', fontSize: '0.62rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    ⏱ {activity.label}
                  </span>
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
              <option value="">All trainers</option>
              {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              {unassignedCount > 0 && <option value={UNASSIGNED}>No trainer ({unassignedCount})</option>}
            </select>
          </div>

          {filteredClients.length === 0 ? (
            <div className="trainer-empty-state">
              <h5>No clients {clients.length ? 'match' : 'yet'}</h5>
              <p>{clients.length ? 'Try a different search or trainer.' : 'Clients appear here when they join one of your trainers.'}</p>
            </div>
          ) : filteredClients.map((c) => {
            const msg = rowMsg[c.id];
            return (
              <div key={c.id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Initial name={c.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>{c.name}</div>
                    <div style={{ ...muted, color: c.workouts7d > 0 ? 'var(--accent-text)' : 'var(--text-muted)' }}>
                      {daysAgoLabel(c.lastWorkout)}{c.workouts7d > 0 ? ` · ${c.workouts7d} this week` : ''}
                    </div>
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', ...muted }}>
                  <span style={{ whiteSpace: 'nowrap' }}>Trainer</span>
                  <select
                    aria-label={`Trainer for ${c.name}`}
                    value={c.trainerName ? c.coachId : ''}
                    disabled={savingId === c.id || gym.status !== 'active' || trainers.length === 0}
                    onChange={(e) => handleAssign(c, e.target.value)}
                    style={{ flex: 1, minWidth: 0, background: 'rgba(var(--fg-rgb), 0.03)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '7px 8px', fontFamily: 'inherit', fontSize: '0.8rem' }}
                  >
                    {!c.trainerName && <option value="">— Choose a trainer —</option>}
                    {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isOwner ? ' (you)' : ''}</option>)}
                  </select>
                  {savingId === c.id && <span>Saving…</span>}
                </label>
                {msg && (
                  <div role={msg.error ? 'alert' : 'status'} style={{ fontSize: '0.72rem', color: msg.error ? 'var(--danger)' : 'var(--accent-text)' }}>
                    {msg.text}
                  </div>
                )}
              </div>
            );
          })}
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
    </div>
  );
}
