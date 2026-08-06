import React from 'react';
import { isSuperAdmin } from '../../services/accessControl';
import { getActivityStatus } from '../../utils/activityStatus';

export default function AdminCoachesList({ coachesList = [], loadingAdmin, onToggleBlock, onViewClients }) {
  if (loadingAdmin) {
    return (
      <div className="trainer-loading-container" style={{ padding: '40px 0' }}>
        <div className="trainer-spinner"></div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading coaches details...</p>
      </div>
    );
  }

  if (coachesList.length === 0) {
    return (
      <div className="trainer-empty-state">
        <h5>No Registered Coaches</h5>
        <p>No coach profiles exist on the platform.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{
      background: 'var(--bg-card)',
      borderTop: '1px solid var(--border-color)',
      borderBottom: '1px solid var(--border-color)',
      padding: '16px',
      overflowX: 'auto'
    }}>
      <h5 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: '#fff', fontWeight: 700 }}>Coaches ({coachesList.length})</h5>

      <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
            <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Coach</th>
            <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>Clients</th>
            <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {coachesList.map(coach => {
            const isSuper = coach.email && isSuperAdmin(coach.email);
            const activity = getActivityStatus(coach.last_login);
            return (
              <tr key={coach.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', height: '64px' }}>
                <td style={{ padding: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center' }}>
                      <span style={{ 
                        display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%',
                        background: coach.isBlocked ? 'var(--danger)' : '#10b981', marginRight: '6px' 
                      }} />
                      {coach.name}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{coach.email}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      <span style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        fontSize: '0.62rem',
                        color: 'var(--text-muted)'
                      }}>
                        {coach.brand}
                      </span>
                      {(coach.experienceYears ?? null) !== null && (
                        <span style={{
                          background: 'rgba(245, 158, 11, 0.08)',
                          border: '1px solid rgba(245, 158, 11, 0.15)',
                          color: '#f59e0b',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          fontSize: '0.62rem',
                          fontWeight: 700
                        }}>
                          {coach.experienceYears} yrs exp
                        </span>
                      )}
                      <span
                        title={coach.last_login ? new Date(coach.last_login).toLocaleString() : 'No login recorded yet'}
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
                    </div>
                  </div>
                </td>
                <td style={{ padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                  <button
                    type="button"
                    onClick={() => onViewClients(coach)}
                    title="View clients"
                    style={{
                      background: 'rgba(139, 92, 246, 0.08)',
                      border: '1px solid rgba(139, 92, 246, 0.15)',
                      color: '#a78bfa',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      margin: '0 auto'
                    }}
                  >
                    👥 {coach.clientsCount}
                  </button>
                </td>
                <td style={{ padding: '8px', textAlign: 'right', verticalAlign: 'middle' }}>
                  {isSuper ? (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', paddingRight: '8px' }}>Admin</span>
                  ) : (
                    <button
                      onClick={() => onToggleBlock(coach)}
                      style={{
                        background: coach.isBlocked ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                        border: `1px solid ${coach.isBlocked ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                        color: coach.isBlocked ? '#10b981' : 'var(--danger)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {coach.isBlocked ? 'Unblock' : 'Block'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
