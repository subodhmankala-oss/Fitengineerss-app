import React, { useState, useEffect } from 'react';
import databaseService, { isSupabaseConfigured } from '../services/databaseService';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [isValidating, setIsValidating] = useState(true);
  const [validationError, setValidationError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Extract token from URL
    const searchParams = new URLSearchParams(window.location.search);
    const tokenVal = searchParams.get('token');
    setToken(tokenVal || '');

    if (!tokenVal) {
      setValidationError('No reset token was found in the URL. Please request a new link.');
      setIsValidating(false);
      return;
    }

    const validate = async () => {
      try {
        if (isSupabaseConfigured && databaseService.supabase) {
          const res = await fetch(`/api/reset-password?token=${encodeURIComponent(tokenVal)}`);
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'This link is invalid or has expired.');
          }
        } else {
          // Local Storage Fallback
          const mockCheck = await databaseService.validateMockToken(tokenVal);
          if (!mockCheck.isValid) {
            throw new Error(mockCheck.error);
          }
        }
        setIsValidating(false);
      } catch (err) {
        setValidationError(err.message || 'This reset link is invalid or has expired. Please request a new one.');
        setIsValidating(false);
      }
    };

    validate();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      setSubmitError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      if (isSupabaseConfigured && databaseService.supabase) {
        const res = await fetch('/api/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, newPassword: password })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to update password.');
        }
      } else {
        // Local Storage Fallback
        await databaseService.resetMockPasswordWithToken(token, password);
      }

      setSuccess(true);
      localStorage.setItem('resetSuccessMsg', 'Password updated. Log in with your new password.');
      
      // Redirect after 2.5s
      setTimeout(() => {
        window.location.href = '/';
      }, 2500);
    } catch (err) {
      setSubmitError(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <div style={styles.card}>
        <div style={styles.spinnerContainer}>
          <div style={styles.spinner}></div>
          <p style={styles.loadingText}>Validating secure token...</p>
        </div>
      </div>
    );
  }

  if (validationError) {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.errorIconContainer}>⚠️</div>
          <h2 style={styles.title}>Expired or Invalid Link</h2>
          <p style={styles.subtitle}>{validationError}</p>
        </div>
        <button 
          onClick={() => { window.location.href = '/'; }} 
          style={styles.primaryButton}
        >
          Return to Login
        </button>
      </div>
    );
  }

  if (success) {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.successIconContainer}>✓</div>
          <h2 style={styles.title}>Password Reset Success</h2>
          <p style={styles.subtitle}>Your password has been securely updated. Redirecting you to the login screen...</p>
        </div>
        <div style={styles.progressBarContainer}>
          <div style={styles.progressBar}></div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h2 style={styles.title}>Set New Password</h2>
        <p style={styles.subtitle}>Please enter a secure password for your Fitengineers account.</p>
      </div>

      {submitError && (
        <div style={styles.errorBanner}>
          ❌ {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.inputGroup}>
          <div style={styles.labelRow}>
            <label style={styles.label}>New Password</label>
            <button 
              type="button" 
              onClick={() => setShowPassword(!showPassword)}
              style={styles.toggleTextButton}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <input 
            type={showPassword ? 'text' : 'password'} 
            placeholder="Min 6 characters" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            required
            disabled={isSubmitting}
            autoFocus
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Confirm Password</label>
          <input 
            type={showPassword ? 'text' : 'password'} 
            placeholder="Re-enter password" 
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={styles.input}
            required
            disabled={isSubmitting}
          />
        </div>

        <button 
          type="submit" 
          disabled={isSubmitting}
          style={{
            ...styles.primaryButton,
            opacity: isSubmitting ? 0.6 : 1,
            cursor: isSubmitting ? 'not-allowed' : 'pointer'
          }}
        >
          {isSubmitting ? 'Resetting Password...' : 'Reset Password'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  card: {
    background: 'rgba(15, 23, 42, 0.45)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '24px',
    padding: '40px 32px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    boxSizing: 'border-box',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#fff',
    animation: 'fadeIn 0.4s ease-out'
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '10px'
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: 800,
    background: 'linear-gradient(to right, #f3e8ff, #c084fc)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    letterSpacing: '-0.025em'
  },
  subtitle: {
    margin: 0,
    fontSize: '0.88rem',
    color: 'rgba(226, 232, 240, 0.65)',
    lineHeight: '1.5'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  label: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'rgba(226, 232, 240, 0.8)',
    letterSpacing: '0.05em',
    textTransform: 'uppercase'
  },
  toggleTextButton: {
    background: 'none',
    border: 'none',
    color: '#a78bfa',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    outline: 'none'
  },
  input: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    padding: '12px 14px',
    color: '#fff',
    fontSize: '0.9rem',
    outline: 'none',
    transition: 'all 0.2s ease',
    boxSizing: 'border-box',
    width: '100%'
  },
  primaryButton: {
    background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    border: 'none',
    borderRadius: '10px',
    padding: '14px',
    color: '#fff',
    fontSize: '0.9rem',
    fontWeight: 700,
    boxShadow: '0 4px 14px rgba(139, 92, 246, 0.3)',
    transition: 'transform 0.1s, opacity 0.2s',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
  },
  errorBanner: {
    padding: '10px 12px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '8px',
    color: '#fecaca',
    fontSize: '0.8rem',
    textAlign: 'center',
    lineHeight: '1.4'
  },
  spinnerContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 0',
    gap: '16px'
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid rgba(139, 92, 246, 0.2)',
    borderTop: '3px solid #8b5cf6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  loadingText: {
    margin: 0,
    fontSize: '0.85rem',
    color: 'rgba(226, 232, 240, 0.6)'
  },
  errorIconContainer: {
    fontSize: '2.5rem',
    marginBottom: '8px'
  },
  successIconContainer: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: 'rgba(16, 185, 129, 0.15)',
    border: '2px solid #10b981',
    color: '#10b981',
    fontSize: '1.8rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '8px',
    animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
  },
  progressBarContainer: {
    width: '100%',
    height: '4px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '2px',
    overflow: 'hidden'
  },
  progressBar: {
    height: '100%',
    width: '100%',
    background: 'linear-gradient(to right, #10b981, #34d399)',
    animation: 'progressFill 2.5s linear forwards'
  }
};
