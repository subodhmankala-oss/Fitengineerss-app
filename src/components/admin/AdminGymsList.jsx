import React, { useCallback, useEffect, useState } from 'react';
import databaseService from '../../services/databaseService';
import AdminSearchBox from './AdminSearchBox';
import { matchesSearch } from '../../utils/matchesSearch';
import { formatJoined } from '../../utils/activityStatus';

// Super-admin Gyms tab: create gyms, link an owner, suspend / reactivate.
// No approval step anywhere — gyms are active as soon as they exist.
// Self-loading (unlike the coaches/clients lists) so TrainerDashboard only
// has to render it. `service` is injectable for tests.

const STATUS_STYLE = {
  active: { label: 'Active', color: 'var(--accent-text)', bg: 'rgba(var(--accent-rgb), 0.08)', border: 'rgba(var(--accent-rgb), 0.2)' },
  suspended: { label: 'Suspended', color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.2)' }
};

// The one status change each state offers.
const NEXT_ACTION = {
  active: { status: 'suspended', label: 'Suspend' },
  suspended: { status: 'active', label: 'Reactivate' }
};

const inputStyle = {
  background: 'rgba(var(--fg-rgb), 0.03)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  padding: '8px 10px',
  color: 'var(--text-main)',
  fontSize: '0.82rem',
  fontFamily: 'inherit',
  minWidth: 0
};

const smallButton = (tone = 'neutral') => ({
  background: tone === 'danger' ? 'rgba(239, 68, 68, 0.08)' : tone === 'accent' ? 'rgba(var(--accent-rgb), 0.08)' : 'rgba(var(--fg-rgb), 0.04)',
  border: `1px solid ${tone === 'danger' ? 'rgba(239, 68, 68, 0.2)' : tone === 'accent' ? 'rgba(var(--accent-rgb), 0.2)' : 'var(--border-color)'}`,
  color: tone === 'danger' ? 'var(--danger)' : tone === 'accent' ? 'var(--accent-text)' : 'var(--text-main)',
  padding: '4px 10px',
  borderRadius: '6px',
  fontSize: '0.72rem',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap'
});

const headCell = { padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 };

export default function AdminGymsList({ service = databaseService }) {
  const [gyms, setGyms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [newName, setNewName] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState({});
  const [editingOwnerId, setEditingOwnerId] = useState(null);
  const [ownerDraft, setOwnerDraft] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const applyLoad = useCallback((result) => {
    if (result.success) {
      setGyms(result.gyms);
      setLoadError('');
    } else {
      setLoadError(result.error);
    }
    setLoading(false);
  }, []);

  const load = async () => applyLoad(await service.getAdminGyms());

  useEffect(() => {
    let cancelled = false;
    service.getAdminGyms().then((result) => { if (!cancelled) applyLoad(result); });
    return () => { cancelled = true; };
  }, [service, applyLoad]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateError('');
    const result = await service.createGym({ name: newName, ownerEmail: newOwnerEmail });
    setCreating(false);
    if (!result.success) {
      setCreateError(result.error);
      return;
    }
    setNewName('');
    setNewOwnerEmail('');
    await load();
  };

  const runUpdate = async (gym, patch) => {
    setBusyId(gym.id);
    setRowError((prev) => ({ ...prev, [gym.id]: '' }));
    const result = await service.updateGym(gym.id, patch);
    setBusyId(null);
    if (!result.success) {
      setRowError((prev) => ({ ...prev, [gym.id]: result.error }));
      return false;
    }
    await load();
    return true;
  };

  const handleStatus = (gym) => {
    const next = NEXT_ACTION[gym.status];
    if (!next) return;
    if (next.status === 'suspended' &&
        !window.confirm(`Suspend ${gym.name}? New clients joining its trainers won't be added to the gym until you reactivate it.`)) {
      return;
    }
    runUpdate(gym, { status: next.status });
  };

  const handleSaveOwner = async (gym) => {
    if (await runUpdate(gym, { ownerEmail: ownerDraft })) setEditingOwnerId(null);
  };

  const handleCopy = async (gym) => {
    try {
      await navigator.clipboard.writeText(gym.join_code);
      setCopiedId(gym.id);
      setTimeout(() => setCopiedId((id) => (id === gym.id ? null : id)), 1500);
    } catch { /* clipboard blocked — the code is visible to copy by hand */ }
  };

  if (loading) {
    return (
      <div className="trainer-loading-container" style={{ padding: '40px 0' }}>
        <div className="trainer-spinner"></div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading gyms...</p>
      </div>
    );
  }

  const filteredGyms = gyms.filter((g) =>
    matchesSearch(searchQuery, [g.name, g.join_code, g.owner?.full_name, g.owner?.email])
  );
  const suspendedCount = gyms.filter((g) => g.status === 'suspended').length;

  return (
    <div className="glass-panel" style={{
      background: 'var(--bg-card)',
      borderTop: '1px solid var(--border-color)',
      borderBottom: '1px solid var(--border-color)',
      padding: '16px',
      overflowX: 'auto'
    }}>
      <h5 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 700 }}>
        Gyms ({gyms.length})
        {suspendedCount > 0 && (
          <span style={{ marginLeft: '8px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--danger)' }}>
            · {suspendedCount} suspended
          </span>
        )}
      </h5>

      <form onSubmit={handleCreate} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
        <input
          aria-label="Gym name"
          placeholder="Gym name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ ...inputStyle, flex: '1 1 160px' }}
        />
        <input
          aria-label="Owner email"
          type="email"
          placeholder="Owner email (optional)"
          value={newOwnerEmail}
          onChange={(e) => setNewOwnerEmail(e.target.value)}
          style={{ ...inputStyle, flex: '1 1 200px' }}
        />
        <button type="submit" disabled={creating || newName.trim().length < 2} style={{ ...smallButton('accent'), padding: '8px 14px', opacity: creating || newName.trim().length < 2 ? 0.5 : 1 }}>
          {creating ? 'Creating…' : '+ Create gym'}
        </button>
      </form>
      <p style={{ margin: '0 0 14px 0', fontSize: '0.72rem', color: createError ? 'var(--danger)' : 'var(--text-muted)' }}>
        {createError || 'Optional — gyms also appear here on their own when an owner signs up. The owner must already have an account.'}
      </p>

      {loadError && (
        <p role="alert" style={{ fontSize: '0.8rem', color: 'var(--danger)', margin: '0 0 12px 0' }}>
          {loadError} <button type="button" onClick={load} style={smallButton()}>Retry</button>
        </p>
      )}

      {gyms.length > 0 && (
        <AdminSearchBox value={searchQuery} onChange={setSearchQuery} placeholder="🔍 Search gym, code or owner..." />
      )}

      {gyms.length === 0 && !loadError ? (
        <div className="trainer-empty-state">
          <h5>No Gyms Yet</h5>
          <p>Create the first gym above.</p>
        </div>
      ) : filteredGyms.length === 0 && searchQuery.trim() ? (
        <div className="trainer-empty-state">
          <h5>No Gyms Found</h5>
          <p>No gyms match "{searchQuery.trim()}".</p>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text-main)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
              <th style={headCell}>Gym</th>
              <th style={{ ...headCell, textAlign: 'center' }}>Members</th>
              <th style={{ ...headCell, textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredGyms.map((gym) => {
              const status = STATUS_STYLE[gym.status] || STATUS_STYLE.active;
              const next = NEXT_ACTION[gym.status];
              const busy = busyId === gym.id;
              return (
                <tr key={gym.id} style={{ borderBottom: '1px solid rgba(var(--fg-rgb), 0.03)' }}>
                  <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {gym.name}
                        <span style={{ background: status.bg, border: `1px solid ${status.border}`, color: status.color, padding: '1px 6px', borderRadius: '4px', fontSize: '0.62rem', fontWeight: 700 }}>
                          {status.label}
                        </span>
                      </div>

                      {editingOwnerId === gym.id ? (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <input
                            aria-label={`New owner email for ${gym.name}`}
                            type="email"
                            placeholder="Owner email (blank = none)"
                            value={ownerDraft}
                            onChange={(e) => setOwnerDraft(e.target.value)}
                            style={{ ...inputStyle, padding: '4px 8px', fontSize: '0.74rem', flex: '1 1 160px' }}
                          />
                          <button type="button" disabled={busy} onClick={() => handleSaveOwner(gym)} style={smallButton('accent')}>Save</button>
                          <button type="button" onClick={() => setEditingOwnerId(null)} style={smallButton()}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          👤 {gym.owner ? (gym.owner.full_name ? `${gym.owner.full_name} · ${gym.owner.email}` : gym.owner.email) : 'No owner yet'}
                          {' '}
                          <button
                            type="button"
                            onClick={() => { setEditingOwnerId(gym.id); setOwnerDraft(gym.owner?.email || ''); }}
                            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--tint-blue)', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit' }}
                          >
                            {gym.owner ? 'change' : 'add'}
                          </button>
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        <code style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '0.04em' }}>{gym.join_code}</code>
                        <button type="button" onClick={() => handleCopy(gym)} style={{ ...smallButton(), padding: '1px 7px', fontSize: '0.66rem' }}>
                          {copiedId === gym.id ? 'Copied' : 'Copy'}
                        </button>
                        {gym.created_at && <span>· 🗓️ {formatJoined(gym.created_at)}</span>}
                      </div>

                      {rowError[gym.id] && (
                        <div role="alert" style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>{rowError[gym.id]}</div>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', verticalAlign: 'top', fontSize: '0.74rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    <div>🏅 {gym.coaches} trainer{gym.coaches === 1 ? '' : 's'}</div>
                    <div>👥 {gym.clients} client{gym.clients === 1 ? '' : 's'}</div>
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', verticalAlign: 'top' }}>
                    {next && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleStatus(gym)}
                        style={{ ...smallButton(next.status === 'suspended' ? 'danger' : 'accent'), opacity: busy ? 0.5 : 1 }}
                      >
                        {busy ? '…' : next.label}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
