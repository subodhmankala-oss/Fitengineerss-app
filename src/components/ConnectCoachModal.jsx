import React, { useState, useRef, useEffect } from 'react';
import databaseService from '../services/databaseService';
import './ConnectCoachModal.css';

// Takes either a coach's invite code or a gym's GYM-XXXX code — the gym code
// joins the gym with no trainer yet, and the gym owner assigns one
// (databaseService.connectClientToGym). onSuccess(coachId, result).
const ConnectCoachModal = ({ onClose, onSuccess }) => {
  const [rawInput, setRawInput] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [joinedGym, setJoinedGym] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const extractCode = (val) => {
    const trimmed = val.trim();
    if (trimmed.startsWith('http')) {
      const parts = trimmed.split('/').filter(Boolean);
      return parts[parts.length - 1] || '';
    }
    return trimmed;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const code = extractCode(rawInput);
    if (!code) {
      setErrorMsg('Please enter an invitation code.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setErrorMsg('');
    try {
      const result = await databaseService.connectClientToCoach(code);
      if (result.success) {
        setJoinedGym(result.gymName ? { name: result.gymName, hasTrainer: result.hasTrainer } : null);
        setStatus('success');
        // A bit longer for the gym message — there's more to read.
        setTimeout(() => { onSuccess(result.coachId, result); }, result.gymName ? 2600 : 1400);
      } else {
        setStatus('error');
        setErrorMsg(result.error || 'Connection failed.');
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'An unexpected error occurred.');
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="ccm-backdrop" onClick={handleBackdropClick}>
      <div className="ccm-modal" role="dialog" aria-modal="true" aria-label="Connect to Coach">
        <div className="ccm-header">
          <div className="ccm-header-icon">🔗</div>
          <div>
            <h2 className="ccm-title">Connect to Coach</h2>
            <p className="ccm-subtitle">Enter the code your coach or gym gave you</p>
          </div>
          <button className="ccm-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {status === 'success' ? (
          <div className="ccm-success-body">
            <div className="ccm-success-icon">{joinedGym ? '🏢' : '✅'}</div>
            {joinedGym ? (
              <>
                <h3>You joined {joinedGym.name}!</h3>
                <p>
                  {joinedGym.hasTrainer
                    ? 'Your coach is part of this gym, so nothing else changes.'
                    : 'Your gym will assign you a trainer soon. Until then, you can keep logging workouts as usual.'}
                </p>
              </>
            ) : (
              <>
                <h3>Connected!</h3>
                <p>You are now linked to your coach. Your personalised plan will appear shortly.</p>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="ccm-form">
            <label className="ccm-label" htmlFor="ccm-code-input">
              Coach or Gym Code
            </label>
            <input
              ref={inputRef}
              id="ccm-code-input"
              className={`ccm-input ${status === 'error' ? 'ccm-input-error' : ''}`}
              type="text"
              placeholder="e.g. ABC123, GYM-7X6P or an invite link"
              value={rawInput}
              onChange={(e) => {
                setRawInput(e.target.value);
                if (status === 'error') { setStatus('idle'); setErrorMsg(''); }
              }}
              autoComplete="off"
              spellCheck="false"
              disabled={status === 'loading'}
            />
            {status === 'error' && errorMsg && (
              <div className="ccm-error-msg">
                <span>⚠️</span> {errorMsg}
              </div>
            )}
            <p className="ccm-info">
              A coach's code is one-time and expires after 24 hours. A gym code (GYM-…) adds you to the gym, and the gym assigns your trainer.
            </p>
            <div className="ccm-actions">
              <button type="button" className="ccm-btn-secondary" onClick={onClose} disabled={status === 'loading'}>
                Cancel
              </button>
              <button
                id="ccm-connect-btn"
                type="submit"
                className={`ccm-btn-primary ${status === 'loading' ? 'loading' : ''}`}
                disabled={status === 'loading' || !rawInput.trim()}
              >
                {status === 'loading' ? (
                  <><span className="ccm-spinner" />Connecting...</>
                ) : 'Connect'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ConnectCoachModal;