import React from 'react';

export default function AdminClientsList({
  clients = [],
  goalFilter = 'All',
  setGoalFilter,
  loadingClients,
  coachesList = [],
  onSelectCoachDetails
}) {
  if (loadingClients) {
    return (
      <div className="trainer-loading-container" style={{ padding: '40px 0' }}>
        <div className="trainer-spinner"></div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading clients list...</p>
      </div>
    );
  }

  const filteredClients = clients.filter(c => goalFilter === 'All' || c.userGoal === goalFilter);

  return (
    <div className="glass-panel" style={{
      background: 'var(--bg-card)',
      borderTop: '1px solid var(--border-color)',
      borderBottom: '1px solid var(--border-color)',
      padding: '16px',
      overflowX: 'auto'
    }}>
      <h5 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#fff', fontWeight: 700 }}>
        All Clients ({clients.length})
      </h5>

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
          <p>No client profiles match the current filter.</p>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Client Profile</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map(client => {
              const coach = coachesList.find(c => c.id === client.coach_id);
              const coachName = coach ? coach.name : (client.coach_id ? 'Attached' : 'Self-Guided');
              return (
                <tr key={client.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', height: '64px' }}>
                  <td style={{ padding: '8px 8px', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>{client.userName}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{client.email}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                        {client.userGoal && (
                          <span style={{
                            background: 'rgba(16, 185, 129, 0.08)',
                            border: '1px solid rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            fontSize: '0.62rem',
                            fontWeight: 700
                          }}>
                            🎯 {client.userGoal}
                          </span>
                        )}
                        <span
                          onClick={() => client.coach_id && coach && onSelectCoachDetails(coach)}
                          style={{
                            background: client.coach_id ? 'rgba(59, 130, 246, 0.08)' : 'rgba(148, 163, 184, 0.08)',
                            border: `1px solid ${client.coach_id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(148, 163, 184, 0.15)'}`,
                            color: client.coach_id ? '#60a5fa' : 'var(--text-muted)',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            cursor: client.coach_id ? 'pointer' : 'default'
                          }}
                        >
                          👤 {client.coach_id ? `Coach: ${coachName}` : 'Self-Guided'}
                        </span>
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
