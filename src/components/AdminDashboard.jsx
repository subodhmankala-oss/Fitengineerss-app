import React, { useState, useEffect } from 'react';
import { isSuperAdmin } from '../services/accessControl';
import databaseService, { isSupabaseConfigured, supabase } from '../services/databaseService';
import './AdminDashboard.css';

console.log('AdminDashboard mounted - Supabase configured:', isSupabaseConfigured);

// Days since last_login, rounded down. Null when the user has never logged
// in (last_login is null) so callers can distinguish "never" from "0 days".
function daysSinceLogin(lastLogin) {
  if (!lastLogin) return null;
  const diffMs = Date.now() - new Date(lastLogin).getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

// Buckets a user into an activity status for the badge + summary counts.
// Thresholds: active today (<1 day), then a badge per day out to 3+.
function getActivityStatus(lastLogin) {
  const days = daysSinceLogin(lastLogin);
  if (days === null) return { key: 'never', label: 'Never logged in', className: 'activity-never' };
  if (days <= 0) return { key: 'active', label: 'Active today', className: 'activity-active' };
  if (days === 1) return { key: 'inactive-1', label: '1 day inactive', className: 'activity-warn' };
  if (days === 2) return { key: 'inactive-2', label: '2 days inactive', className: 'activity-warn' };
  return { key: 'inactive-3plus', label: `${days} days inactive`, className: 'activity-critical' };
}

const AdminDashboard = ({ user, onLogout }) => {
  const [tab, setTab] = useState('applications');
  const [pendingCoaches, setPendingCoaches] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [coachSummary, setCoachSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [approvalNotes, setApprovalNotes] = useState('');

  // Security check
  if (!user || !isSuperAdmin(user.email)) {
    return (
      <div className="admin-dashboard-denied">
        <h1>Access Denied</h1>
        <p>Only subodhmankala@gmail.com can access this dashboard.</p>
        <button onClick={onLogout}>Logout</button>
      </div>
    );
  }

  const fetchPendingCoaches = async () => {
    setLoading(true);
    setError('');
    try {
      const allPending = await databaseService.getPendingCoachApplications();
      console.log('Total pending coaches to display:', allPending);
      setPendingCoaches(allPending || []);
    } catch (err) {
      console.error('Error fetching pending coaches:', err);
      setError(err.message || 'Failed to fetch pending coaches');
      setPendingCoaches([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const usersList = await databaseService.getAllUsersWithRoles();
      setAllUsers(usersList || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchCoachSummary = async () => {
    setLoading(true);
    setError('');
    try {
      const summary = await databaseService.getCoachesWithClientCounts();
      setCoachSummary(summary || []);
    } catch (err) {
      console.error('Error fetching coach summary:', err);
      setError(err.message || 'Failed to fetch coach summary');
    } finally {
      setLoading(false);
    }
  };

  // Fetch pending coaches on component mount and setup real-time listeners
  useEffect(() => {
    fetchPendingCoaches();

    let channel = null;
    if (isSupabaseConfigured && supabase) {
      console.log('[DEBUG] Admin Dashboard: Subscribing to real-time changes...');
      channel = supabase
        .channel('admin-dashboard-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
          console.log('[DEBUG] Admin Dashboard: Real-time user change detected:', payload);
          fetchAllUsers();
          fetchPendingCoaches();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_applications' }, (payload) => {
          console.log('[DEBUG] Admin Dashboard: Real-time coach applications change detected:', payload);
          fetchPendingCoaches();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
          // Refresh coach summary whenever a client connects to a coach
          fetchCoachSummary();
        })
        .subscribe();
    }

    return () => {
      if (channel) {
        console.log('[DEBUG] Admin Dashboard: Unsubscribing real-time channel.');
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const handleApproveCoach = async (coach) => {
    if (!window.confirm(`Approve ${coach.full_name || coach.email} as a coach?`)) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      await databaseService.approveCoach(coach.email);
      await fetchPendingCoaches();
      setSelectedCoach(null);
      setApprovalNotes('');
      alert('Coach approved successfully!');
    } catch (err) {
      console.error('Error approving coach:', err);
      setError(err.message || 'Failed to approve coach');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectCoach = async (coach) => {
    const reason = window.prompt('Enter rejection reason:');
    if (!reason) return;

    setLoading(true);
    setError('');
    try {
      await databaseService.rejectCoach(coach.email);
      await fetchPendingCoaches();
      setSelectedCoach(null);
      alert('Coach application rejected');
    } catch (err) {
      console.error('Error rejecting coach:', err);
      setError(err.message || 'Failed to reject coach');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-dashboard">
      {/* Header */}
      <div className="admin-header">
        <div className="admin-header-content">
          <h1>Admin Dashboard</h1>
          <p>Logged in as: {user.email}</p>
        </div>
        <button onClick={onLogout} className="logout-btn">
          Logout
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="admin-tabs">
        <button
          className={`tab-btn ${tab === 'applications' ? 'active' : ''}`}
          onClick={() => {
            setTab('applications');
            fetchPendingCoaches();
          }}
        >
          📋 Pending Coaches ({pendingCoaches.length})
        </button>
        <button
          className={`tab-btn ${tab === 'coaches' ? 'active' : ''}`}
          onClick={() => {
            setTab('coaches');
            fetchCoachSummary();
          }}
        >
          🏅 Coach Summary
        </button>
        <button
          className={`tab-btn ${tab === 'users' ? 'active' : ''}`}
          onClick={() => {
            setTab('users');
            fetchAllUsers();
          }}
        >
          👥 All Users
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="admin-error">
          <p>{error}</p>
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      {/* Loading State */}
      {loading && <div className="admin-loading">Loading...</div>}

      {/* Pending Coaches Tab */}
      {tab === 'applications' && !loading && (
        <div className="admin-content">
          {pendingCoaches.length === 0 ? (
            <div className="admin-empty">
              <p>✅ No pending coach applications</p>
            </div>
          ) : (
            <div className="coaches-grid">
              {pendingCoaches.map((coach) => (
                <div
                  key={coach.id}
                  className={`coach-card ${selectedCoach?.id === coach.id ? 'selected' : ''}`}
                  onClick={() => setSelectedCoach(coach)}
                >
                  <div className="coach-card-header">
                    <h3>{coach.full_name || coach.name || 'Unknown Coach'}</h3>
                    <span className="pending-badge">PENDING</span>
                  </div>
                  <div className="coach-card-body">
                    <p>
                      <strong>Email:</strong> {coach.email}
                    </p>
                    <p>
                      <strong>Role:</strong> {coach.role || 'unknown'}
                    </p>
                    <p>
                      <strong>Status:</strong> {coach.status || 'pending'}
                    </p>
                    <p>
                      <strong>Applied:</strong>{' '}
                      {coach.created_at
                        ? new Date(coach.created_at).toLocaleDateString()
                        : coach.submission_date
                        ? new Date(coach.submission_date).toLocaleDateString()
                        : 'Unknown'}
                    </p>
                  </div>

                  {selectedCoach?.id === coach.id && (
                    <div className="coach-card-actions">
                      <button
                        className="approve-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApproveCoach(coach);
                        }}
                        disabled={loading}
                      >
                        ✅ Approve Coach
                      </button>
                      <button
                        className="reject-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRejectCoach(coach);
                        }}
                        disabled={loading}
                      >
                        ❌ Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Coach Summary Tab */}
      {tab === 'coaches' && !loading && (
        <div className="admin-content">
          <div className="coach-summary-header">
            <h2 className="coach-summary-title">Coach Overview</h2>
            <span className="coach-summary-sub">
              Live client counts from the <code>clients</code> table — refreshes on page load
            </span>
            <button
              className="admin-refresh-btn"
              onClick={fetchCoachSummary}
              title="Refresh counts"
            >
              🔄 Refresh
            </button>
          </div>

          {coachSummary.length === 0 ? (
            <div className="admin-empty">
              <p>No approved coaches found. Approve coach applications first.</p>
            </div>
          ) : (
            <div className="coach-summary-grid">
              {coachSummary.map((coach) => (
                <div key={coach.id} className="coach-summary-card">
                  <div className="csc-avatar">
                    {(coach.name || 'C')[0].toUpperCase()}
                  </div>
                  <div className="csc-details">
                    <div className="csc-name">{coach.name}</div>
                    {coach.brand && coach.brand !== coach.name && (
                      <div className="csc-brand">{coach.brand}</div>
                    )}
                    <div className="csc-email">{coach.email}</div>
                    <div className="csc-joined">
                      Joined {coach.joined ? new Date(coach.joined).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </div>
                  </div>
                  <div className="csc-count-block">
                    <span className="csc-count-num">{coach.clientCount}</span>
                    <span className="csc-count-lbl">client{coach.clientCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Total summary row */}
          {coachSummary.length > 0 && (
            <div className="coach-summary-total">
              <span>Total across all coaches:</span>
              <strong>{coachSummary.reduce((s, c) => s + c.clientCount, 0)} clients</strong>
              <span className="cst-divider">•</span>
              <strong>{coachSummary.length} coaches</strong>
            </div>
          )}
        </div>
      )}

      {/* All Users Tab */}
      {tab === 'users' && !loading && (
        <div className="admin-content">
          {/* Activity summary — coaches + clients combined; excludes the
              super-admin row itself since it's not a coach/client account. */}
          {(() => {
            const trackable = allUsers.filter((u) => u.role !== 'super-admin');
            const counts = trackable.reduce(
              (acc, u) => {
                acc[getActivityStatus(u.last_login).key] = (acc[getActivityStatus(u.last_login).key] || 0) + 1;
                return acc;
              },
              {}
            );
            return (
              <div className="activity-summary">
                <div className="activity-stat activity-stat-active">
                  <span className="activity-stat-num">{counts.active || 0}</span>
                  <span className="activity-stat-lbl">Active today</span>
                </div>
                <div className="activity-stat activity-stat-warn">
                  <span className="activity-stat-num">{(counts['inactive-1'] || 0) + (counts['inactive-2'] || 0)}</span>
                  <span className="activity-stat-lbl">1–2 days inactive</span>
                </div>
                <div className="activity-stat activity-stat-critical">
                  <span className="activity-stat-num">{counts['inactive-3plus'] || 0}</span>
                  <span className="activity-stat-lbl">3+ days inactive</span>
                </div>
                <div className="activity-stat activity-stat-never">
                  <span className="activity-stat-num">{counts.never || 0}</span>
                  <span className="activity-stat-lbl">Never logged in</span>
                </div>
              </div>
            );
          })()}

          <div className="users-table-wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Verified</th>
                  <th>Joined</th>
                  <th>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map((u) => {
                  const activity = getActivityStatus(u.last_login);
                  return (
                    <tr key={u.id}>
                      <td>
                        <div>{u.email}</div>
                        {u.phone && <div className="user-phone">{u.phone}</div>}
                      </td>
                      <td>{u.full_name || '-'}</td>
                      <td>
                        <span className={`role-badge role-${u.role}`}>{u.role}</span>
                      </td>
                      <td>{u.verified ? '✅' : '❌'}</td>
                      <td>
                        {u.created_at
                          ? new Date(u.created_at).toLocaleDateString()
                          : '-'}
                      </td>
                      <td>
                        {u.role === 'super-admin' ? (
                          '-'
                        ) : (
                          <span className={`activity-badge ${activity.className}`} title={u.last_login ? new Date(u.last_login).toLocaleString() : 'No login recorded yet'}>
                            {activity.label}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
