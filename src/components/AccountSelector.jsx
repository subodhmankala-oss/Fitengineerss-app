import React from 'react';

/**
 * Premium Account Selector for multi-role users.
 */
const AccountSelector = ({ roles, onSelectRole }) => {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center',
      padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        background: 'rgba(30, 41, 59, 0.75)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '24px',
        padding: '40px 32px',
        width: '100%',
        maxWidth: '480px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
      }}>
        {/* Header */}
        <div>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔄</div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#fff', fontWeight: 800 }}>
            How would you like to log in?
          </h2>
          <p style={{ margin: '8px 0 0 0', fontSize: '0.88rem', color: '#94a3b8' }}>
            We detected multiple roles linked to your account.
          </p>
        </div>

        {/* Selection Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {roles.includes('client') && (
            <button
              onClick={() => onSelectRole('client')}
              style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1))',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: '16px',
                padding: '20px',
                color: '#fff',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.border = '1px solid rgba(59, 130, 246, 0.5)';
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.border = '1px solid rgba(59, 130, 246, 0.25)';
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1))';
              }}
            >
              <div style={{ fontSize: '2rem' }}>🥗</div>
              <div>
                <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '4px' }}>Client Dashboard</strong>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Track your metrics, check calories, and log workouts.</span>
              </div>
            </button>
          )}

          {(roles.includes('coach') || roles.includes('super-admin') || roles.includes('admin')) && (
            <button
              onClick={() => onSelectRole('coach')}
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.1))',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '16px',
                padding: '20px',
                color: '#fff',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.border = '1px solid rgba(16, 185, 129, 0.5)';
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.15))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.border = '1px solid rgba(16, 185, 129, 0.25)';
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.1))';
              }}
            >
              <div style={{ fontSize: '2rem' }}>🏋️</div>
              <div>
                <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '4px' }}>Coach Dashboard</strong>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Manage client plans, check metrics, and issue codes.</span>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountSelector;
