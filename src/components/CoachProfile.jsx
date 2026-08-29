import { useState, useEffect } from 'react';
import databaseService from '../services/databaseService';
import Avatar from './Avatar';
import WhatsNewList from './WhatsNewList';
import './ClientProfile.css';

// Coach-side settings page — deliberately mirrors ClientProfile.jsx (same
// cp-* classes/layout, same list-then-drill-in-sub-page pattern) per the
// coach's 2026-08-29 request ("coach profile should be similar to client
// side"). Rendered as a full-page overlay on top of TrainerDashboard (the
// same slot the old flat hamburger menu used to occupy) rather than as a
// permanent tab, since the coach dashboard has no spare tab bar for it.
//
// notifOn/onToggleNotifications and onOpenPayments are passed in from
// TrainerDashboard rather than reimplemented here — that's where the coach's
// real push-subscription state and the Payments view already live, and
// duplicating either would just be a second source of truth to drift.

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SettingsRow({ icon, label, value, onTap, last }) {
  return (
    <button className={`cp-row${last ? ' cp-row--last' : ''}`} onClick={onTap}>
      <span className="cp-row-icon">{icon}</span>
      <span className="cp-row-label">{label}</span>
      <span className="cp-row-right">
        {value && <span className="cp-row-value">{value}</span>}
        <ChevronRight />
      </span>
    </button>
  );
}

// initialSection (2026-08-29: "all these things I want it in left bar, the
// way other menu exist" — the coach dashboard's desktop sidebar wants a
// direct one-click entry per settings row, not "open the menu, then tap
// again") jumps straight past the main list into that sub-page on open, so
// a sidebar button can be "Profile" -> profile edit form directly, same as
// every other sidebar icon is already a direct destination rather than a
// menu of menus. Back still returns to the main list (activeSection: null),
// same as reaching that sub-page by tapping its row there normally would.
export default function CoachProfile({ handleLogout, onReplayDemoTour, notifOn, onToggleNotifications, onOpenPayments, onClose, initialSection = null }) {
  const [activeSection, setActiveSection] = useState(initialSection);

  const readProfile = () => ({
    userName: localStorage.getItem('userName') || '',
    phone: localStorage.getItem('userPhone') || '',
    brand: localStorage.getItem('userBrand') || '',
    specialization: localStorage.getItem('userSpecialization') || '',
    certifications: localStorage.getItem('userCertifications') || '',
    experienceYears: localStorage.getItem('userExperienceYears') || '',
    locationCity: localStorage.getItem('userLocationCity') || '',
    socialHandle: localStorage.getItem('userSocialHandle') || '',
  });

  const [form, setForm] = useState(readProfile);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const userEmail = localStorage.getItem('userEmail') || '';
  const userAvatarUrl = localStorage.getItem('userAvatarUrl') || null;
  const userId = localStorage.getItem('userId') || '';

  // Cache-then-reconcile: paint instantly from localStorage above, then
  // refresh from the DB once in case another device changed something
  // since — same pattern ClientProfile.jsx uses for the same reason.
  useEffect(() => {
    if (!userEmail) return;
    let cancelled = false;
    databaseService.getUserProfileByEmail(userEmail).then(profile => {
      if (cancelled || !profile) return;
      const fresh = {};
      if (profile.userName) fresh.userName = profile.userName;
      if (profile.phone) fresh.phone = profile.phone;
      if (profile.brand) fresh.brand = profile.brand;
      if (profile.specialization) fresh.specialization = profile.specialization;
      if (profile.certifications) fresh.certifications = profile.certifications;
      if (profile.experienceYears) fresh.experienceYears = profile.experienceYears;
      if (profile.locationCity) fresh.locationCity = profile.locationCity;
      if (profile.socialHandle) fresh.socialHandle = profile.socialHandle;
      if (Object.keys(fresh).length === 0) return;
      setForm(f => ({ ...f, ...fresh }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userEmail]);

  const handleField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const saveProfile = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      await databaseService.saveCoachSelfProfile({ userId, ...form });
      setSaveMsg('saved');
    } catch {
      setSaveMsg('error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 2500);
    }
  };

  // ── Sub-section: Business Profile ──────────────────────────────────────────
  // Merged with the old standalone "Profile" section (2026-08-29: "Business
  // profile and profile. Merge it into one... keep the name Business
  // profile") — Personal Info (name/phone) and Business Info now live in
  // one page/sidebar entry instead of two, both still saved via the same
  // saveProfile() call since they were always one `form` object/one DB row.
  if (activeSection === 'business' || activeSection === 'profile') {
    return (
      <Overlay>
        <div className="cp-container animate-slide-up">
          <div className="cp-sub-header">
            <button className="cp-back-btn" onClick={() => setActiveSection(null)}><BackArrow /></button>
            <h2 className="cp-sub-title">Business Profile</h2>
            <button
              className={`cp-save-btn${saving ? ' cp-save-btn--loading' : ''}`}
              onClick={saveProfile}
              disabled={saving}
            >
              {saving ? 'Saving…' : saveMsg === 'saved' ? '✓ Saved' : 'Save'}
            </button>
          </div>
          <div className="cp-form-scroll">
            <div className="cp-form-section-label">Personal Info</div>
            <div className="cp-form-card">
              <div className="cp-field">
                <label className="cp-field-label">Name</label>
                <input className="cp-field-input" value={form.userName} onChange={e => handleField('userName', e.target.value)} placeholder="Your name" />
              </div>
              <div className="cp-field cp-field--border cp-field--last">
                <label className="cp-field-label">Phone</label>
                <input className="cp-field-input" type="tel" value={form.phone} onChange={e => handleField('phone', e.target.value)} placeholder="Phone number" />
              </div>
            </div>
            <div className="cp-form-section-label">Business Info</div>
            <div className="cp-form-card">
              <div className="cp-field">
                <label className="cp-field-label">Business / Brand Name</label>
                <input className="cp-field-input" value={form.brand} onChange={e => handleField('brand', e.target.value)} placeholder="e.g. Fit Engineers" />
              </div>
              <div className="cp-field cp-field--border">
                <label className="cp-field-label">Specialization</label>
                <input className="cp-field-input" value={form.specialization} onChange={e => handleField('specialization', e.target.value)} placeholder="Weight Loss, Muscle Gain, etc" />
              </div>
              <div className="cp-field cp-field--border">
                <label className="cp-field-label">Certifications</label>
                <input className="cp-field-input" value={form.certifications} onChange={e => handleField('certifications', e.target.value)} placeholder="NASM, ACE, etc" />
              </div>
              <div className="cp-field cp-field--border">
                <label className="cp-field-label">Years of Experience</label>
                <input className="cp-field-input cp-field-input--right" type="number" value={form.experienceYears} onChange={e => handleField('experienceYears', e.target.value)} placeholder="5" />
              </div>
              <div className="cp-field cp-field--border">
                <label className="cp-field-label">Location / City</label>
                <input className="cp-field-input" value={form.locationCity} onChange={e => handleField('locationCity', e.target.value)} placeholder="City, Country" />
              </div>
              <div className="cp-field cp-field--border cp-field--last">
                <label className="cp-field-label">Social Handle <span className="cp-field-unit">(optional)</span></label>
                <input className="cp-field-input" value={form.socialHandle} onChange={e => handleField('socialHandle', e.target.value)} placeholder="@yourhandle" />
              </div>
            </div>
            {saveMsg === 'error' && <p className="cp-save-error">Failed to save. Check your connection and try again.</p>}
          </div>
        </div>
      </Overlay>
    );
  }

  // ── Sub-section: Account ───────────────────────────────────────────────────
  if (activeSection === 'account') {
    return (
      <Overlay>
        <div className="cp-container animate-slide-up">
          <div className="cp-sub-header">
            <button className="cp-back-btn" onClick={() => setActiveSection(null)}><BackArrow /></button>
            <h2 className="cp-sub-title">Account</h2>
            <span style={{ width: 60 }} />
          </div>
          <div className="cp-form-scroll">
            <div className="cp-form-section-label">Sign-in Details</div>
            <div className="cp-form-card">
              <div className="cp-field cp-field--last">
                <label className="cp-field-label">Email</label>
                <span className="cp-field-static">{userEmail || '—'}</span>
              </div>
            </div>
            <div className="cp-form-section-label">Security</div>
            <div className="cp-form-card">
              <button className="cp-row cp-row--last cp-row--action" onClick={async () => {
                if (!userEmail) return;
                try {
                  const { supabase } = await import('../services/databaseService');
                  await supabase.auth.resetPasswordForEmail(userEmail, {
                    redirectTo: `${window.location.origin}/reset-password`,
                  });
                  alert('Password reset email sent. Check your inbox.');
                } catch {
                  alert('Could not send reset email. Try again.');
                }
              }}>
                <span className="cp-row-icon">🔑</span>
                <span className="cp-row-label">Change Password</span>
                <span className="cp-row-right"><ChevronRight /></span>
              </button>
            </div>
            <div className="cp-account-danger-zone">
              <button className="cp-danger-btn" onClick={handleLogout}>Log Out</button>
            </div>
          </div>
        </div>
      </Overlay>
    );
  }

  // ── Sub-section: Notifications ─────────────────────────────────────────────
  if (activeSection === 'notifications') {
    return (
      <Overlay>
        <div className="cp-container animate-slide-up">
          <div className="cp-sub-header">
            <button className="cp-back-btn" onClick={() => setActiveSection(null)}><BackArrow /></button>
            <h2 className="cp-sub-title">Notifications</h2>
            <span style={{ width: 60 }} />
          </div>
          <div className="cp-form-scroll">
            <div className="cp-form-section-label">Push Notifications</div>
            <div className="cp-form-card">
              <div className="cp-field cp-field--last" style={{ paddingTop: 18, paddingBottom: 18 }}>
                <div>
                  <div className="cp-field-label" style={{ marginBottom: 4 }}>Client Alerts & Reminders</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {notifOn ? 'Active — you\'ll get client activity alerts.' : 'Tap to enable push notifications.'}
                  </div>
                </div>
                <button
                  className={`cp-notif-toggle${notifOn ? ' cp-notif-toggle--on' : ''}`}
                  onClick={onToggleNotifications}
                >
                  {notifOn ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Overlay>
    );
  }

  // ── Sub-section: What's New ────────────────────────────────────────────────
  if (activeSection === 'whatsnew') {
    return (
      <Overlay>
        <div className="cp-container animate-slide-up">
          <div className="cp-sub-header">
            <button className="cp-back-btn" onClick={() => setActiveSection(null)}><BackArrow /></button>
            <h2 className="cp-sub-title">What's New</h2>
            <span style={{ width: 60 }} />
          </div>
          <div className="cp-form-scroll">
            <WhatsNewList audience="coach" />
          </div>
        </div>
      </Overlay>
    );
  }

  // ── Main Settings Page ─────────────────────────────────────────────────────
  return (
    <Overlay>
      <div className="cp-container animate-slide-up">
        <div className="cp-user-card" style={{ paddingRight: 12 }}>
          <Avatar className="cp-avatar" email={userEmail} name={form.userName} avatarUrl={userAvatarUrl} size={56} style={{ fontSize: '1.4rem' }} />
          <div className="cp-user-info" style={{ flex: 1, minWidth: 0 }}>
            <div className="cp-user-name">{form.userName || 'Coach'}</div>
            <div className="cp-user-email">{userEmail}</div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', borderRadius: '10px', padding: '9px', cursor: 'pointer'
              }}
            >
              <CloseIcon />
            </button>
          )}
        </div>

        <div className="cp-section-label">Account</div>
        <div className="cp-section-card">
          <SettingsRow icon="🔒" label="Account" onTap={() => setActiveSection('account')} />
          <SettingsRow icon="🔔" label="Notifications" value={notifOn ? 'On' : 'Off'} onTap={() => setActiveSection('notifications')} last />
        </div>

        <div className="cp-section-label">Business</div>
        <div className="cp-section-card">
          <SettingsRow icon="🏢" label="Business Profile" onTap={() => { setForm(readProfile()); setActiveSection('business'); }} last />
        </div>

        {onOpenPayments && (
          <>
            <div className="cp-section-label">Tools</div>
            <div className="cp-section-card">
              <SettingsRow icon="💰" label="Client Payments" onTap={onOpenPayments} last />
            </div>
          </>
        )}

        <div className="cp-section-label">Updates</div>
        <div className="cp-section-card">
          <SettingsRow icon="✨" label="What's New" onTap={() => setActiveSection('whatsnew')} last />
        </div>

        {onReplayDemoTour && (
          <>
            <div className="cp-section-label">Help</div>
            <div className="cp-section-card">
              <SettingsRow icon="🎬" label="App Tutorial" onTap={onReplayDemoTour} last />
            </div>
          </>
        )}

        <button className="cp-logout-btn" onClick={handleLogout}>Log Out</button>
        <div className="cp-app-version">Fitengineers · v3</div>
      </div>
    </Overlay>
  );
}

// Fixed full-page overlay shell — the slot this replaces (TrainerDashboard's
// old inline mobileHeaderMenuOpen block) used the same fixed/inset:0/z-index
// treatment, so every sub-page here (and the main list) gets wrapped in it
// rather than duplicating the positioning styles at each return above.
function Overlay({ children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--bg-app)', overflowY: 'auto' }}>
      {children}
    </div>
  );
}
