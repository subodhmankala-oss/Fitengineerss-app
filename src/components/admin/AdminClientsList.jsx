import React, { useState } from 'react';
import { getActivityStatus, isNewSignup, compareNewestJoinFirst, formatJoined } from '../../utils/activityStatus';
import AdminSearchBox from './AdminSearchBox';
import AdminWhatsappNudge from './AdminWhatsappNudge';
import { matchesSearch } from '../../utils/matchesSearch';

export default function AdminClientsList({
  clients = [],
  goalFilter = 'All',
  setGoalFilter,
  activityFilter = null,
  setActivityFilter,
  loadingClients,
  coachesList = [],
  onSelectCoachDetails,
  // Clients with an unread notification (e.g. "new client signed up") —
  // blue dot next to their name. See clientNotifications in TrainerDashboard.
  unreadClientIds = new Set(),
  // Latest reply per client to a founder message: { [clientId]: { reply, at } }.
  founderReplies = {},
  // Client ids whose latest reply hasn't been seen yet, and the handler that
  // marks one seen (TrainerDashboard keeps this per device).
  unreadReplyIds = new Set(),
  onMarkReplyRead,
  // Opens the founder-message composer for this client (TrainerDashboard).
  onMessageClient
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyNewReplies, setOnlyNewReplies] = useState(false);

  if (loadingClients) {
    return (
      <div className="trainer-loading-container" style={{ padding: '40px 0' }}>
        <div className="trainer-spinner"></div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading clients list...</p>
      </div>
    );
  }

  // 'new' is a sign-up-date filter sharing the activity tile row, not an
  // activity bucket — getActivityStatus never returns it.
  const matchesActivityFilter = (c) => {
    if (!activityFilter) return true;
    if (activityFilter === 'new') return isNewSignup(c.joined_at);
    return getActivityStatus(c.last_login).key === activityFilter;
  };

  // Newest sign-ups first, so a new client is always at the top.
  const filteredClients = clients.filter(c => {
    const matchesGoal = goalFilter === 'All' || c.userGoal === goalFilter;
    const matchesActivity = matchesActivityFilter(c);
    const coachName = coachesList.find(co => co.id === c.coach_id)?.name;
    // Only while there are unread replies — once the last one is marked read
    // the toggle button disappears, and a still-on filter would hide everyone.
    if (onlyNewReplies && unreadReplyIds.size > 0 && !unreadReplyIds.has(c.id)) return false;
    return matchesGoal && matchesActivity &&
      matchesSearch(searchQuery, [c.userName, c.email, c.phone, coachName]);
  }).sort(compareNewestJoinFirst(c => c.joined_at));

  // Activity summary across ALL clients (not just the goal-filtered subset)
  // so the counts don't shift when someone flips the filter pills.
  const activityCounts = clients.reduce((acc, c) => {
    const key = getActivityStatus(c.last_login).key;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const newSignupCount = clients.filter(c => isNewSignup(c.joined_at)).length;
  const summaryTiles = [
    { key: 'new', label: 'New this week', count: newSignupCount, color: 'var(--tint-blue)', bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.2)' },
    { key: 'active', label: 'Active today', count: activityCounts.active || 0, color: 'var(--accent-text)', bg: 'rgba(var(--accent-rgb), 0.08)', border: 'rgba(var(--accent-rgb), 0.2)' },
    { key: 'inactive-mid', label: '1–5 days inactive', count: activityCounts['inactive-mid'] || 0, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.2)' },
    { key: 'inactive-long', label: '6+ days inactive', count: activityCounts['inactive-long'] || 0, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.2)' },
    { key: 'never', label: 'Never logged in', count: activityCounts.never || 0, color: 'var(--text-muted)', bg: 'rgba(148, 163, 184, 0.08)', border: 'rgba(148, 163, 184, 0.2)' }
  ];

  return (
    <div className="glass-panel" style={{
      background: 'var(--bg-card)',
      borderTop: '1px solid var(--border-color)',
      borderBottom: '1px solid var(--border-color)',
      padding: '16px',
      overflowX: 'auto'
    }}>
      <h5 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 700 }}>
        All Clients ({clients.length})
      </h5>

      {/* Activity summary — who's logged in today vs. gone quiet. Click a tile to filter the list below. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
        {summaryTiles.map(tile => {
          const isActive = activityFilter === tile.key;
          return (
            <div
              key={tile.key}
              onClick={() => setActivityFilter && setActivityFilter(isActive ? null : tile.key)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActivityFilter && setActivityFilter(isActive ? null : tile.key);
                }
              }}
              style={{
                flex: '1 1 120px',
                padding: '8px 10px',
                borderRadius: '8px',
                background: tile.bg,
                border: `1px solid ${isActive ? tile.color : tile.border}`,
                boxShadow: isActive ? `0 0 0 1px ${tile.color}` : 'none',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: tile.color }}>{tile.count}</div>
              <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 600 }}>{tile.label}</div>
            </div>
          );
        })}
      </div>

      {/* Everyone in the selected tile (not narrowed by search/goal/replies);
          key resets the panel when switching tiles. */}
      {(activityFilter === 'inactive-long' || activityFilter === 'never') && (
        <AdminWhatsappNudge
          key={activityFilter}
          clients={clients.filter(matchesActivityFilter)}
          coachesList={coachesList}
          tileLabel={summaryTiles.find(t => t.key === activityFilter)?.label}
        />
      )}

      {unreadReplyIds.size > 0 && (
        <button
          type="button"
          onClick={() => setOnlyNewReplies(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left',
            margin: '0 0 10px 0', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.82rem', fontWeight: 700, color: 'var(--tint-violet)',
            background: onlyNewReplies ? 'rgba(139, 92, 246, 0.18)' : 'rgba(139, 92, 246, 0.08)',
            border: '1px solid rgba(139, 92, 246, 0.3)'
          }}
        >
          <span className="unread-dot" aria-hidden="true" />
          {unreadReplyIds.size} new {unreadReplyIds.size === 1 ? 'reply' : 'replies'} from clients
          <span style={{ marginLeft: 'auto', fontWeight: 600, fontSize: '0.74rem' }}>
            {onlyNewReplies ? 'Show everyone' : 'Show only these'}
          </span>
        </button>
      )}
      <AdminSearchBox
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="🔍 Search client by name, email, phone or coach..."
      />

      {/* Goal filter pills */}
      <div className="filter-tags" style={{ marginBottom: '14px' }}>
        {['All', 'Fat Loss', 'Muscle Building', 'Gut Fix'].map(goal => (
          <button
            key={goal}
            className={`filter-tag ${goalFilter === goal ? 'active' : ''}`}
            onClick={() => setGoalFilter(goal)}
          >
            {goal}
          </button>
        ))}
      </div>

      {filteredClients.length === 0 ? (
        <div className="trainer-empty-state">
          <h5>No Clients Found</h5>
          <p>{searchQuery.trim() ? `No clients match "${searchQuery.trim()}".` : 'No client profiles match the current filter.'}</p>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text-main)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Client Profile</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map(client => {
              const coach = coachesList.find(c => c.id === client.coach_id);
              const coachName = coach ? coach.name : (client.coach_id ? 'Attached' : 'Self-Guided');
              const activity = getActivityStatus(client.last_login);
              return (
                <tr key={client.id} style={{ borderBottom: '1px solid rgba(var(--fg-rgb), 0.03)', height: '64px' }}>
                  <td style={{ padding: '8px 8px', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {client.userName || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 600 }}>No name yet</span>}
                        {isNewSignup(client.joined_at) && <NewBadge />}
                        {unreadClientIds.has(client.id) && <span className="unread-dot" aria-label="New update" />}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{client.email}</div>
                      {client.phone && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>📞 {client.phone}</div>
                      )}
                      {client.joined_at && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          🗓️ Joined {formatJoined(client.joined_at)}
                        </div>
                      )}
                      {founderReplies[client.id] && (() => {
                        const r = founderReplies[client.id];
                        const unread = unreadReplyIds.has(client.id);
                        return (
                          <div
                            style={{
                              marginTop: '2px', padding: '8px 10px', borderRadius: '10px', fontSize: '0.78rem',
                              background: unread ? 'rgba(139, 92, 246, 0.14)' : 'rgba(var(--fg-rgb), 0.04)',
                              border: `1px solid ${unread ? 'rgba(139, 92, 246, 0.45)' : 'var(--border-color)'}`,
                              color: 'var(--text-main)', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '6px'
                            }}
                          >
                            <div>
                              <span style={{ fontWeight: 700, color: 'var(--tint-violet)' }}>
                                {unread && <span className="unread-dot" style={{ marginRight: '6px' }} aria-label="New reply" />}
                                💬 {unread ? 'New reply' : 'Replied'}:{' '}
                              </span>
                              {r.reply}
                              {r.at && <span style={{ color: 'var(--text-muted)' }}> · {new Date(r.at).toLocaleDateString()}</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {onMessageClient && (
                                <button
                                  type="button"
                                  onClick={() => onMessageClient(client)}
                                  style={{ background: 'var(--tint-violet, #8b5cf6)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                                >
                                  Reply
                                </button>
                              )}
                              {unread && onMarkReplyRead && (
                                <button
                                  type="button"
                                  onClick={() => onMarkReplyRead(client.id)}
                                  style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                                >
                                  Mark read
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                        {client.userGoal && (
                          <span style={{
                            background: 'rgba(var(--accent-rgb), 0.08)',
                            border: '1px solid rgba(var(--accent-rgb), 0.15)',
                            color: 'var(--accent-text)',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            fontSize: '0.62rem',
                            fontWeight: 700
                          }}>
                            🎯 {client.userGoal}{client.userSecondaryGoal ? ` + ${client.userSecondaryGoal}` : ''}
                          </span>
                        )}
                        <span
                          onClick={() => client.coach_id && coach && onSelectCoachDetails(coach)}
                          style={{
                            background: client.coach_id ? 'rgba(59, 130, 246, 0.08)' : 'rgba(148, 163, 184, 0.08)',
                            border: `1px solid ${client.coach_id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(148, 163, 184, 0.15)'}`,
                            color: client.coach_id ? 'var(--tint-blue)' : 'var(--text-muted)',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            cursor: client.coach_id ? 'pointer' : 'default'
                          }}
                        >
                          👤 {client.coach_id ? `Coach: ${coachName}` : 'Self-Guided'}
                        </span>
                        <span
                          title={client.last_login ? new Date(client.last_login).toLocaleString() : 'No login recorded yet'}
                          style={{
                            background: activity.bg,
                            border: `1px solid ${activity.border}`,
                            color: activity.color,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            fontSize: '0.62rem',
                            fontWeight: 700
                          }}
                        >
                          ⏱ {activity.label}
                        </span>
                        {onMessageClient && (
                          <button
                            type="button"
                            onClick={() => onMessageClient(client)}
                            style={{
                              background: 'rgba(139, 92, 246, 0.08)',
                              border: '1px solid rgba(139, 92, 246, 0.2)',
                              color: 'var(--tint-violet)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              fontFamily: 'inherit'
                            }}
                          >
                            ✉️ Message
                          </button>
                        )}
                      </div>
                    </div>
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

export function NewBadge() {
  return (
    <span style={{
      background: 'rgba(59, 130, 246, 0.12)',
      border: '1px solid rgba(59, 130, 246, 0.3)',
      color: 'var(--tint-blue)',
      padding: '0 5px',
      borderRadius: '4px',
      fontSize: '0.6rem',
      fontWeight: 800,
      letterSpacing: '0.04em'
    }}>
      NEW
    </span>
  );
}
