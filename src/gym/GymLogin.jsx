import { useState } from 'react';

// Gym owner sign-in: email + password only. No sign-up here (owners create a
// gym through Coach Sign Up or the admin) and no Google button, so this page
// can never create an account or send anyone into the coach/client flow.
export default function GymLogin({ service, onSignedIn, initialError = '' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await service.signIn(email, password);
      await onSignedIn();
    } catch (err) {
      setError(err.message || 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gym-shell gym-center">
      <form className="gym-card" onSubmit={submit}>
        <span className="gym-brand">Fitengineers <b>Gym</b></span>
        <h1 className="gym-title">Gym owner login</h1>
        <p className="gym-muted">See your trainers, members and how your gym is doing.</p>
        <label className="gym-label" htmlFor="gym-email">Email</label>
        <input
          id="gym-email" className="gym-input" type="email" autoComplete="username"
          value={email} onChange={(e) => setEmail(e.target.value)} required
        />
        <label className="gym-label" htmlFor="gym-password">Password</label>
        <input
          id="gym-password" className="gym-input" type="password" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} required
        />
        {error && <p className="gym-error" role="alert">{error}</p>}
        <button type="submit" className="gym-btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="gym-muted gym-switch">
          Trainer or member? <a href="/">Sign in on the main app</a> instead.
        </p>
      </form>
    </div>
  );
}
