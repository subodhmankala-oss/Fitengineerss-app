import React, { useState, useRef, useEffect } from 'react';
import databaseService from '../services/databaseService';
import './ConnectCoachModal.css';

const ConnectCoachModal = ({ onClose, onSuccess }) => {
  const [rawInput, setRawInput] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const extractCode = (val) => {
    // 1. Remove all spaces in case they typed/pasted spaced-out letters like "B P M Y T T"
    const noSpaces = val.replace(/\s+/g, '');
    if (noSpaces.length === 6 && /^[a-zA-Z0-9]{6}$/.test(noSpaces)) {
      return noSpaces.toUpperCase();
    }

    const trimmed = val.trim();
    // 2. If it's a URL, extract the last path segment (and strip query params)
    if (trimmed.startsWith('http')) {
      const parts = trimmed.split('/').filter(Boolean);
      const lastPart = parts[parts.length - 1] || '';
      return lastPart.split('?')[0].trim().toUpperCase();
    }

    // 3. If it's the full message text, find a 6-character alphanumeric pattern
    const codeMatch = trimmed.match(/(?:code:\s*|code\s+|program:\s*)([a-zA-Z0-9]{6})\b/i) || 
                      trimmed.match(/\b([a-zA-Z0-9]{6})\b/);
                      
    if (codeMatch) {
      return codeMatch[1].toUpperCase();
    }

    return trimmed.toUpperCase();
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
        setStatus('success');
        setTimeout(() => { onSuccess(result.coachId); }, 1400);
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
            <p className="ccm-subtitle">Enter the invitation code your coach shared with you</p>
          </div>
          <button className="ccm-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {status === 'success' ? (
          <div className="ccm-success-body">
            <div className="ccm-success-icon">✅</div>
            <h3>Connected!</h3>
            <p>You are now linked to your coach. Your personalised plan will appear shortly.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="ccm-form">
            <label className="ccm-label" htmlFor="ccm-code-input">
              Invitation Code or Link
            </label>
            <input
              ref={inputRef}
              id="ccm-code-input"
              className={`ccm-input ${status === 'error' ? 'ccm-input-error' : ''}`}
              type="text"
              placeholder="e.g. ABC123 or paste the full invite link"
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
              Your coach generates this code from their dashboard. It expires after 24 hours and can only be used once.
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