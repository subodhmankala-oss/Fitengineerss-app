import React, { useState, useEffect } from 'react';
import { isSuperAdmin } from '../services/accessControl';
import databaseService, { isSupabaseConfigured, supabase } from '../services/databaseService';
import './AdminDashboard.css';

console.log('AdminDashboard mounted - Supabase configured:', isSupabaseConfigured);

const AdminDashboard = ({ user, onLogout }) => {
  const [tab, setTab] = useState('applications');
  const [pendingCoaches, setPendingCoaches] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
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

  // Fetch pending coaches on component mount
  useEffect(() => {
    fetchPendingCoaches();
  }, []);

  const fetchPendingCoaches = async () => {
    setLoading(true);
    setError('');
    try {
      let allPending = [];

      // First try Supabase
      if (isSupabaseConfigured && supabase) {
        try {
          // Query for coach_pending role
          const { data: cloudPending, error: queryError } = await supabase
            .from('users')
            .select('*')
            .eq('role', 'coach_pending')
            .order('created_at', { ascending: false });

          if (!queryError && cloudPending) {
            console.log('Pending coaches from Supabase:', cloudPending);
            allPending = cloudPending;
          } else if (queryError) {
            console.warn('Supabase query error:', queryError);
          }
        } catch (err) {
          console.warn('Supabase fetch error:', err);
        }
      }

      // Also check localStorage as fallback
      try {
        const localPending = databaseService.getPendingCoachApplications?.();
        console.log('Pending coaches from localStorage:', localPending);
        
        if (localPending && localPending.length > 0) {
          // Merge with Supabase data, avoid duplicates
          const emails = new Set(allPending.map(p => p.email));
          const uniqueLocal = localPending.filter(l => !emails.has(l.email));
          allPending = [...allPending, ...uniqueLocal];
        }
      } catch (err) {
        console.warn('localStorage fetch error:', err);
      }

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
      if (isSupabaseConfigured && supabase) {
        const { data, error: queryError } = await supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: false });

        if (queryError) {
          throw queryError;
        }

        setAllUsers(data || []);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveCoach = async (coach) => {
    if (!window.confirm(`Approve ${coach.full_name || coach.email} as a coach?`)) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      if (isSupabaseConfigured && supabase) {
        // Update user role to 'coach'
        const { error: updateError } = await supabase
          .from('users')
          .update({
            role: 'coach',
            verified: true
          })
          .eq('id', coach.id);

        if (updateError) {
          throw updateError;
        }

        // Create coach profile if not exists
        const { data: existingProfile } = await supabase
          .from('coach_profiles')
          .select('*')
          .eq('user_id', coach.id)
          .single();

        if (!existingProfile) {
          await supabase
            .from('coach_profiles')
            .insert({
              user_id: coach.id,
              approved: true,
              approval_date: new Date().toISOString(),
              experience_years: 0,
              certifications: [],
              specialization: 'General'
            });
        }

        // Refresh list
        fetchPendingCoaches();
        setSelectedCoach(null);
        setApprovalNotes('');
        alert('Coach approved successfully!');
      } else {
        // Fallback to databaseService
        await databaseService.approveCoach(coach.email);
        fetchPendingCoaches();
        alert('Coach approved successfully!');
      }
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
      if (isSupabaseConfigured && supabase) {
        // Update user role back to 'client'
        const { error: updateError } = await supabase
          .from('users')
          .update({
            role: 'client'
          })
          .eq('id', coach.id);

        if (updateError) {
          throw updateError;
        }

        // Refresh list
        fetchPendingCoaches();
        setSelectedCoach(null);
        alert('Coach application rejected');
      }
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

      {/* All Users Tab */}
      {tab === 'users' && !loading && (
        <div className="admin-content">
          <div className="users-table-wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Verified</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
