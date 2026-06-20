import React, { useState, useEffect } from 'react';
import databaseService, { isSupabaseConfigured } from '../services/databaseService';
import './CoachLogin.css';

const CoachLogin = ({ onLoginSuccess, onApplyNow, onBack }) => {
  const [email, setEmail] = useState(() => localStorage.getItem('last_logged_in_email') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Safety net: Reset loading state after 30 seconds if it's still stuck
  useEffect(() => {
    if (!loading) return;
    
    const timeout = setTimeout(() => {
      setLoading(false);
      setError('Request timed out. Please try again.');
    }, 30000);

    return () => clearTimeout(timeout);
  }, [loading]);

  // Real-time listener for approval status
  useEffect(() => {
    if (!email) return;

    const checkFreshStatus = async () => {
      try {
        let profile = null;
        if (isSupabaseConfigured && databaseService.supabase) {
          profile = await databaseService.getUserProfileByEmail(email);
        } else {
          const cachedCoaches = localStorage.getItem('coaches_list');
          const coaches = cachedCoaches ? JSON.parse(cachedCoaches) : [];
          const localCoach = coaches.find(c => c.email.toLowerCase() === email.toLowerCase());
          if (localCoach && localCoach.status !== 'pending') {
            profile = {
              userName: localCoach.name,
              role: 'coach',
              brand: localCoach.brand || 'Fit Engineers',
              payment_status: localCoach.payment_status || 'active',
              verified: true
            };
          }
        }

        if (profile && (profile.role === 'coach' || profile.role === 'super-admin') && profile.verified === true) {
          setError('');
          setLoading(true);
          await databaseService.loadProfileIntoLocalStorage(profile, email);
          localStorage.setItem('onboardingComplete', 'true');
          onLoginSuccess();
        }
      } catch (e) {
        console.error('Error in status check:', e);
      } finally {
        setLoading(false);
      }
    };

    let channel = null;
    if (isSupabaseConfigured && databaseService.supabase) {
      channel = databaseService.supabase
        .channel(`user-approval-${email}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'users',
            filter: `email=eq.${email}`
          },
          () => {
            checkFreshStatus();
          }
        )
        .subscribe();
    }

    const handleStorageChange = (e) => {
      if (e.key === 'coach_applications' || e.key === 'coaches_list') {
        checkFreshStatus();
      }
    };
    const handleCoachesUpdated = () => {
      checkFreshStatus();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('coaches_updated', handleCoachesUpdated);

    return () => {
      if (channel && databaseService.supabase) {
        databaseService.supabase.removeChannel(channel);
      }
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('coaches_updated', handleCoachesUpdated);
    };
  }, [email, onLoginSuccess]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let profile = null;
      const isSuperAdminEmail = email.toLowerCase() === 'subodhmankala@gmail.com';
      
      if (isSupabaseConfigured && databaseService.supabase) {
        // Query profile from database
        profile = await databaseService.getUserProfileByEmail(email);
      } else {
        // Offline/local development fallback
        const isHardcodedCoach = ['subodhmankala@gmail.com', 'trainer@fitengineers.com', 'coach@fitengineers.com'].includes(email.toLowerCase());
        if (isHardcodedCoach) {
          profile = {
            userName: email.split('@')[0].toUpperCase(),
            role: isSuperAdminEmail ? 'super-admin' : 'coach',
            brand: email.split('@')[0].toUpperCase() + ' Fitness',
            payment_status: 'active',
            verified: true
          };
        } else {
          // Check if the user is in local coach list
          const cachedCoaches = localStorage.getItem('coaches_list');
          const coaches = cachedCoaches ? JSON.parse(cachedCoaches) : [];
          const localCoach = coaches.find(c => c.email.toLowerCase() === email.toLowerCase());
          if (localCoach) {
            profile = {
              userName: localCoach.name,
              role: localCoach.status === 'pending' ? 'coach_pending' : 'coach',
              brand: localCoach.brand || 'Fit Engineers',
              payment_status: localCoach.payment_status || 'active',
              verified: localCoach.status !== 'pending'
            };
          }
        }
      }
      
      if (!profile) {
        throw new Error('Account not found. Please submit a coach application first.');
      }

      // Check verification/approval status
      const isCoachRole = profile.role === 'coach' || profile.role === 'super-admin';
      const isPending = profile.role === 'coach_pending';
      
      // Super Admin is always approved automatically
      const isApproved = isSuperAdminEmail || (isCoachRole && profile.verified === true);
      
      if (isPending || !isApproved) {
        throw new Error('Your coach application is still pending review. Access is blocked until approved by Fitengineers Team.');
      }

      if (!isCoachRole && !isSuperAdminEmail) {
        throw new Error('Access denied. This email is registered as a client, not a coach.');
      }

      // Save user session to local storage
      await databaseService.loadProfileIntoLocalStorage({
        ...profile,
        role: isSuperAdminEmail ? 'super-admin' : 'coach'
      }, email);
      
      localStorage.setItem('onboardingComplete', 'true');
      onLoginSuccess();
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyNow = () => {
    setError('');
    onApplyNow();
  };

  return (
    <div className="coach-login-container">
      {/* Background gradient accent */}
      <div className="coach-login-background">
        <div className="coach-login-gradient-1"></div>
        <div className="coach-login-gradient-2"></div>
      </div>

      {/* Main content card */}
      <div className="coach-login-card">
        {/* Back button */}
        {onBack && (
          <button
            className="coach-login-back-button"
            onClick={onBack}
            title="Back to login options"
          >
            ← Back
          </button>
        )}

        {/* Header section */}
        <div className="coach-login-header">
          <div className="coach-login-logo-section">
            <div className="coach-login-logo">🏋️</div>
            <h1 className="coach-login-title">Fitengineers Coach</h1>
          </div>
          <p className="coach-login-subtitle">
            Manage your clients, track progress, and grow your coaching business
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="coach-login-error">
            <span className="coach-login-error-icon">⚠️</span>
            <span className="coach-login-error-text">{error}</span>
          </div>
        )}

        {/* Main content */}
        <div className="coach-login-content">
          <form onSubmit={handleSubmit} className="coach-login-form">
            <div className="coach-login-input-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="email">Email Address</label>
                {localStorage.getItem('last_logged_in_email') && (
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem('last_logged_in_email');
                      setEmail('');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#60a5fa',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0,
                      marginBottom: '2px'
                    }}
                  >
                    Switch Account
                  </button>
                )}
              </div>
              <input
                id="email"
                type="email"
                placeholder="coach@fitengineers.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              className="coach-login-submit-btn"
              disabled={loading}
              style={{ marginTop: '20px' }}
            >
              {loading ? 'Verifying...' : 'Log In with Email'}
            </button>
          </form>
        </div>

        {/* Footer with apply link */}
        <div className="coach-login-footer">
          <p className="coach-login-footer-text">
            Not a Coach Yet?{' '}
            <button
              className="coach-login-apply-link"
              onClick={handleApplyNow}
              disabled={loading}
            >
              Apply Now
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default CoachLogin;
