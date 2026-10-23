import { useState } from 'react';
import { APP_LINK, openWhatsapp } from '../utils/whatsappNudge';

// The gym code owners hand out. Trainers enter it at Coach Sign Up or in
// Profile → My Gym; members enter it in "Connect to coach". The owner then
// assigns each new member a trainer from Members.
export default function GymInvite({ gym, compact = false }) {
  const [copied, setCopied] = useState(false);
  const code = gym.joinCode;
  if (!code) return null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked — the code is on screen */ }
  };
  const share = (who) => {
    const how = who === 'trainer'
      ? `open ${APP_LINK}, sign up as a coach and enter our gym code ${code} (or Profile → My Gym if you already have an account).`
      : `open ${APP_LINK}, tap "Connect to coach" and enter our gym code ${code}.`;
    openWhatsapp('', `Join ${gym.name} on Fitengineers: ${how}`);
  };

  if (compact) {
    return (
      <div className="gx-code-mini">
        <span className="gx-code-label">Gym code</span>
        <b>{code}</b>
        <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
    );
  }

  return (
    <section className="gx-card gx-invite">
      <div>
        <h2 className="gx-h2">Your gym code</h2>
        <p className="gx-sub">Share it so trainers and members join {gym.name}. Nothing needs approving — they join straight away.</p>
        <div className="gx-code-row">
          <span className="gx-code">{code}</span>
          <button type="button" className="gx-btn gx-btn-dark" onClick={copy}>{copied ? 'Copied' : 'Copy code'}</button>
        </div>
      </div>
      <div className="gx-invite-ways">
        <div>
          <b>Trainers</b>
          <p className="gx-sub">Enter it at Coach Sign Up (“Gym Code”), or in Profile → My Gym.</p>
          <button type="button" className="gx-btn gx-btn-soft" onClick={() => share('trainer')}>Send to a trainer on WhatsApp</button>
        </div>
        <div>
          <b>Members</b>
          <p className="gx-sub">Enter it in “Connect to coach”. They wait for you to assign a trainer.</p>
          <button type="button" className="gx-btn gx-btn-soft" onClick={() => share('member')}>Send to a member on WhatsApp</button>
        </div>
      </div>
    </section>
  );
}
