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
// menu of menus.
//
// BUG FIX 2026-08-29: "when i click on any of left menu icon. It takes me
// there but when i click back. Its takes me to this page [the main
// settings list] in desktop. It should be back to dashboard" — every
// sub-page's back button unconditionally did setActiveSection(null),
// landing on the main list regardless of how the coach got there. That's
// correct when they reached a sub-page BY tapping its row in the main list
// (there's somewhere real to go back to) — but a sidebar shortcut skips the
// main list entirely, so backing out of it should close the whole overlay
// and reveal the dashboard underneath, not surface an intermediate menu
// they never opened. goBack() below is what every sub-page's back button
// calls now instead of setActiveSection(null) directly.
export default function CoachProfile({ handleLogout, onReplayDemoTour, notifOn, onToggleNotifications, onOpenPayments, onClose, initialSection = null }) {
  const [activeSection, setActiveSection] = useState(initialSection);
  const goBack = () => {
    if (initialSection) onClose?.();
    else setActiveSection(null);
  };

  const readProfile = () => ({
    userName: localStorage.getItem('userName') || '',
    phone: localStorage.getItem('userPhone') || '',
    brand: localStorage.getItem('userBrand') || '',
    specialization: localStorage.getItem('userSpecialization') || '',
    certifications: localStorage.getItem('userCertifications') || '',
    experienceYears: localStorage.getItem('userExperienceYears') || '',
    locationCity: localStorage.getItem('userLocationCity') || '',
    socialHandle: localStorage.getItem('userSocialHandle') || '',
    paymentQrUrl: localStorage.getItem('userPaymentQrUrl') || '',
    logoUrl: localStorage.getItem('userLogoUrl') || '',
  });

  const [form, setForm] = useState(readProfile);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [qrError, setQrError] = useState('');
  const [logoError, setLogoError] = useState('');

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
      if (profile.paymentQrUrl) fresh.paymentQrUrl = profile.paymentQrUrl;
      if (profile.logoUrl) fresh.logoUrl = profile.logoUrl;
      if (Object.keys(fresh).length === 0) return;
      setForm(f => ({ ...f, ...fresh }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userEmail]);

  const handleField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  // Shared image-upload path for both Payment QR (2026-09-11: "send them
  // reminder... along with payment QR code") and Business Logo (2026-09-11
  // follow-up: "I need a logo to attached logo also should be there") —
  // downscaled through a canvas before either ever becomes the data: URL
  // that gets stored, so a multi-MB phone-camera photo doesn't turn into a
  // multi-MB row in `coaches` (see supabase_coach_payment_qr.sql /
  // supabase_coach_logo.sql for why these are plain text columns and not a
  // Storage bucket upload — a small compressed image comfortably fits
  // either way, so keeping the simpler no-bucket path). maxDim is
  // comfortably more than either image needs to stay legible at typical
  // WhatsApp-preview size.
  const handleImageUpload = (field, file, setError, maxDim = 640) => {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        handleField(field, canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => setError('Could not read that image. Try a different file.');
      img.src = reader.result;
    };
    reader.onerror = () => setError('Could not read that image. Try a different file.');
    reader.readAsDataURL(file);
  };
  const handleQrFile = (file) => handleImageUpload('paymentQrUrl', file, setQrError);
  const handleLogoFile = (file) => handleImageUpload('logoUrl', file, setLogoError);

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
            <button className="cp-back-btn" onClick={goBack}><BackArrow /></button>
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

            {/* Business Logo (2026-09-11 follow-up to Payment QR below:
                "I need a logo to attached logo also should be there") —
                attached alongside every renewal reminder sent from Client
                Payments so the message doesn't just show a QR code with no
                indication of whose business it's from. */}
            <div className="cp-form-section-label">Business Logo</div>
            <div className="cp-form-card">
              <div className="cp-field cp-field--last" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
                <label className="cp-field-label">Logo <span className="cp-field-unit">(sent with renewal reminders)</span></label>
                {form.logoUrl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img
                      src={form.logoUrl}
                      alt="Business logo"
                      style={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 10, background: '#fff', border: '1px solid var(--border-color)' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleField('logoUrl', '')}
                      style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', font: 'inherit' }}
                    >
                      Remove
                    </button>
                  </div>
                )}
                <label
                  style={{
                    display: 'inline-block', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)',
                    borderRadius: '10px', padding: '9px 14px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', color: '#fff'
                  }}
                >
                  {form.logoUrl ? 'Replace logo' : 'Upload logo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => { handleLogoFile(e.target.files?.[0]); e.target.value = ''; }}
                    style={{ display: 'none' }}
                  />
                </label>
                {logoError && <p className="cp-save-error" style={{ margin: 0 }}>{logoError}</p>}
              </div>
            </div>

            {/* Payment QR (2026-09-11) — uploaded once here, then attached
                automatically to every renewal reminder sent from Client
                Payments so a client can pay without asking "where do I
                send it". */}
            <div className="cp-form-section-label">Payment QR Code</div>
            <div className="cp-form-card">
              <div className="cp-field cp-field--last" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
                <label className="cp-field-label">UPI / GPay / PhonePe QR <span className="cp-field-unit">(sent with renewal reminders)</span></label>
                {form.paymentQrUrl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img
                      src={form.paymentQrUrl}
                      alt="Payment QR code"
                      style={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 10, background: '#fff', border: '1px solid var(--border-color)' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleField('paymentQrUrl', '')}
                      style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', font: 'inherit' }}
                    >
                      Remove
                    </button>
                  </div>
                )}
                <label
                  style={{
                    display: 'inline-block', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)',
                    borderRadius: '10px', padding: '9px 14px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', color: '#fff'
                  }}
                >
                  {form.paymentQrUrl ? 'Replace QR image' : 'Upload QR image'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => { handleQrFile(e.target.files?.[0]); e.target.value = ''; }}
                    style={{ display: 'none' }}
                  />
                </label>
                {qrError && <p className="cp-save-error" style={{ margin: 0 }}>{qrError}</p>}
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
            <button className="cp-back-btn" onClick={goBack}><BackArrow /></button>
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
            <button className="cp-back-btn" onClick={goBack}><BackArrow /></button>
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
            <button className="cp-back-btn" onClick={goBack}><BackArrow /></button>
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
