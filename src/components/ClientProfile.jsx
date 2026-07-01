import { useState } from 'react';
import databaseService from '../services/databaseService';
import './ClientProfile.css';

const GOALS = ['Fat Loss', 'Muscle Building', 'Gut Fix', 'General Fitness'];
const ACTIVITY_LEVELS = ['Sedentary', 'Lightly Active', 'Moderately Active', 'Very Active', 'Extremely Active'];
const DIETS = ['Non-Vegetarian', 'Vegetarian', 'Vegan', 'Keto', 'Other'];

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

export default function ClientProfile({ handleLogout }) {
  const [activeSection, setActiveSection] = useState(null);

  const readProfile = () => ({
    userName: localStorage.getItem('userName') || '',
    userAge: localStorage.getItem('userAge') || '',
    userHeight: localStorage.getItem('userHeight') || '',
    userWeight: localStorage.getItem('userWeight') || '',
    userGoal: localStorage.getItem('userGoal') || '',
    userActivity: localStorage.getItem('userActivity') || '',
    userDiet: localStorage.getItem('userDiet') || '',
    userCalorieTarget: localStorage.getItem('userCalorieTarget') || '',
    userProteinTarget: localStorage.getItem('userProteinTarget') || '',
    userCarbsTarget: localStorage.getItem('userCarbsTarget') || '',
    userFatsTarget: localStorage.getItem('userFatsTarget') || '',
  });

  const [form, setForm] = useState(readProfile);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [weightUnit, setWeightUnit] = useState(localStorage.getItem('weightUnit') || 'kg');
  const [restTimer, setRestTimer] = useState(() => localStorage.getItem('prefRestTimer') || '60');
  const [measurements, setMeasurements] = useState(() => {
    try { return JSON.parse(localStorage.getItem('userMeasurements') || '{}'); } catch { return {}; }
  });
  const [measSaving, setMeasSaving] = useState(false);
  const [measSaveMsg, setMeasSaveMsg] = useState('');

  const userEmail = localStorage.getItem('userEmail') || '';
  const notifState = 'Notification' in window ? Notification.permission : 'unsupported';

  const initial = form.userName?.charAt(0)?.toUpperCase() || '?';

  const handleField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const saveProfile = async () => {
    setSaving(true);
    setSaveMsg('');
    Object.entries(form).forEach(([k, v]) => localStorage.setItem(k, v));
    try {
      await databaseService.saveUserProfile({
        ...form,
        email: userEmail,
        role: localStorage.getItem('userRole') || 'client',
        coach_id: localStorage.getItem('userCoachId') || null,
      });
      setSaveMsg('saved');
    } catch {
      setSaveMsg('error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 2500);
    }
  };

  const requestNotifications = async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    window.dispatchEvent(new Event('notificationPermissionChanged'));
    return result;
  };

  const toggleUnit = (unit) => {
    setWeightUnit(unit);
    localStorage.setItem('weightUnit', unit);
  };

  // ── Sub-section: Profile Edit ──────────────────────────────────────────────
  if (activeSection === 'profile') {
    return (
      <div className="cp-container animate-slide-up">
        <div className="cp-sub-header">
          <button className="cp-back-btn" onClick={() => setActiveSection(null)}><BackArrow /></button>
          <h2 className="cp-sub-title">Profile</h2>
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
            <div className="cp-field cp-field--border">
              <label className="cp-field-label">Age</label>
              <input className="cp-field-input cp-field-input--right" type="number" value={form.userAge} onChange={e => handleField('userAge', e.target.value)} placeholder="yrs" />
            </div>
            <div className="cp-field cp-field--border">
              <label className="cp-field-label">Height <span className="cp-field-unit">(cm)</span></label>
              <input className="cp-field-input cp-field-input--right" type="number" value={form.userHeight} onChange={e => handleField('userHeight', e.target.value)} placeholder="cm" />
            </div>
            <div className="cp-field cp-field--border cp-field--last">
              <label className="cp-field-label">Weight <span className="cp-field-unit">({weightUnit})</span></label>
              <input className="cp-field-input cp-field-input--right" type="number" step="0.1" value={form.userWeight} onChange={e => handleField('userWeight', e.target.value)} placeholder={weightUnit} />
            </div>
          </div>

          <div className="cp-form-section-label">Goals & Lifestyle</div>
          <div className="cp-form-card">
            <div className="cp-field">
              <label className="cp-field-label">Goal</label>
              <select className="cp-field-select" value={form.userGoal} onChange={e => handleField('userGoal', e.target.value)}>
                {GOALS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="cp-field cp-field--border">
              <label className="cp-field-label">Activity</label>
              <select className="cp-field-select" value={form.userActivity} onChange={e => handleField('userActivity', e.target.value)}>
                {ACTIVITY_LEVELS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="cp-field cp-field--border cp-field--last">
              <label className="cp-field-label">Diet</label>
              <select className="cp-field-select" value={form.userDiet} onChange={e => handleField('userDiet', e.target.value)}>
                {DIETS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div className="cp-form-section-label">Daily Targets</div>
          <div className="cp-form-card">
            <div className="cp-field">
              <label className="cp-field-label">Calories <span className="cp-field-unit">(kcal)</span></label>
              <input className="cp-field-input cp-field-input--right" type="number" value={form.userCalorieTarget} onChange={e => handleField('userCalorieTarget', e.target.value)} placeholder="kcal" />
            </div>
            <div className="cp-field cp-field--border">
              <label className="cp-field-label">Protein <span className="cp-field-unit">(g)</span></label>
              <input className="cp-field-input cp-field-input--right" type="number" value={form.userProteinTarget} onChange={e => handleField('userProteinTarget', e.target.value)} placeholder="g" />
            </div>
            <div className="cp-field cp-field--border">
              <label className="cp-field-label">Carbs <span className="cp-field-unit">(g)</span></label>
              <input className="cp-field-input cp-field-input--right" type="number" value={form.userCarbsTarget} onChange={e => handleField('userCarbsTarget', e.target.value)} placeholder="g" />
            </div>
            <div className="cp-field cp-field--border cp-field--last">
              <label className="cp-field-label">Fats <span className="cp-field-unit">(g)</span></label>
              <input className="cp-field-input cp-field-input--right" type="number" value={form.userFatsTarget} onChange={e => handleField('userFatsTarget', e.target.value)} placeholder="g" />
            </div>
          </div>

          {saveMsg === 'error' && (
            <p className="cp-save-error">Failed to save. Check your connection and try again.</p>
          )}
        </div>
      </div>
    );
  }

  // ── Sub-section: Account ───────────────────────────────────────────────────
  if (activeSection === 'account') {
    return (
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
    );
  }

  // ── Sub-section: Notifications ─────────────────────────────────────────────
  if (activeSection === 'notifications') {
    const granted = notifState === 'granted';
    const denied = notifState === 'denied';
    return (
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
                <div className="cp-field-label" style={{ marginBottom: 4 }}>Coach Nudges & Reminders</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {denied ? 'Blocked in browser settings — enable in your device settings.' : granted ? 'Active — you\'ll receive daily reminders.' : 'Tap to enable push notifications.'}
                </div>
              </div>
              {!denied && (
                <button
                  className={`cp-notif-toggle${granted ? ' cp-notif-toggle--on' : ''}`}
                  onClick={requestNotifications}
                >
                  {granted ? 'ON' : 'OFF'}
                </button>
              )}
            </div>
          </div>
          {denied && (
            <p className="cp-notif-hint">
              To re-enable, go to your browser / OS notification settings and allow Fitengineers, then reload the app.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Sub-section: Workouts ──────────────────────────────────────────────────
  if (activeSection === 'workouts') {
    return (
      <div className="cp-container animate-slide-up">
        <div className="cp-sub-header">
          <button className="cp-back-btn" onClick={() => setActiveSection(null)}><BackArrow /></button>
          <h2 className="cp-sub-title">Workouts</h2>
          <span style={{ width: 60 }} />
        </div>
        <div className="cp-form-scroll">
          <div className="cp-form-section-label">Rest Timer</div>
          <div className="cp-form-card">
            <div className="cp-field cp-field--last" style={{ paddingTop: 18, paddingBottom: 18 }}>
              <label className="cp-field-label">Default Rest (seconds)</label>
              <select
                className="cp-field-select"
                value={restTimer}
                onChange={e => {
                  setRestTimer(e.target.value);
                  localStorage.setItem('prefRestTimer', e.target.value);
                }}
              >
                {['30','45','60','90','120','180'].map(s => (
                  <option key={s} value={s}>{s}s</option>
                ))}
              </select>
            </div>
          </div>
          <div className="cp-form-section-label">Tracking</div>
          <div className="cp-form-card">
            <div className="cp-field cp-field--last" style={{ paddingTop: 18, paddingBottom: 18 }}>
              <div>
                <div className="cp-field-label" style={{ marginBottom: 4 }}>Log by workout name</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sessions are saved with the workout name you enter when finishing.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Sub-section: Measurements ─────────────────────────────────────────────
  if (activeSection === 'measurements') {
    const measFields = [
      { key: 'chest',     label: 'Chest' },
      { key: 'waist',     label: 'Waist' },
      { key: 'hips',      label: 'Hips' },
      { key: 'thighs',    label: 'Thighs' },
      { key: 'calves',    label: 'Calves' },
      { key: 'shoulders', label: 'Shoulders' },
      { key: 'upperArm',  label: 'Upper Arm' },
      { key: 'forearm',   label: 'Forearm' },
      { key: 'neck',      label: 'Neck' },
    ];
    const saveMeasurements = async () => {
      setMeasSaving(true);
      localStorage.setItem('userMeasurements', JSON.stringify(measurements));
      try {
        await databaseService.saveUserProfile({
          email: userEmail,
          userName: form.userName,
          role: localStorage.getItem('userRole') || 'client',
          measurements: JSON.stringify(measurements),
        });
        setMeasSaveMsg('saved');
      } catch {
        setMeasSaveMsg('error');
      } finally {
        setMeasSaving(false);
        setTimeout(() => setMeasSaveMsg(''), 2500);
      }
    };
    return (
      <div className="cp-container animate-slide-up">
        <div className="cp-sub-header">
          <button className="cp-back-btn" onClick={() => setActiveSection(null)}><BackArrow /></button>
          <h2 className="cp-sub-title">Measurements</h2>
          <button
            className={`cp-save-btn${measSaving ? ' cp-save-btn--loading' : ''}`}
            onClick={saveMeasurements}
            disabled={measSaving}
          >
            {measSaving ? 'Saving…' : measSaveMsg === 'saved' ? '✓ Saved' : 'Save'}
          </button>
        </div>
        <div className="cp-form-scroll">
          <div className="cp-form-section-label">Body Measurements (cm)</div>
          <div className="cp-form-card">
            {measFields.map(({ key, label }, i) => (
              <div
                key={key}
                className={`cp-field${i > 0 ? ' cp-field--border' : ''}${i === measFields.length - 1 ? ' cp-field--last' : ''}`}
              >
                <label className="cp-field-label">{label}</label>
                <input
                  className="cp-field-input cp-field-input--right"
                  type="number"
                  step="0.1"
                  placeholder="cm"
                  value={measurements[key] || ''}
                  onChange={e => setMeasurements(m => ({ ...m, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          {measSaveMsg === 'error' && (
            <p className="cp-save-error">Failed to save. Check your connection and try again.</p>
          )}
        </div>
      </div>
    );
  }

  // ── Sub-section: Units ─────────────────────────────────────────────────────
  if (activeSection === 'units') {
    return (
      <div className="cp-container animate-slide-up">
        <div className="cp-sub-header">
          <button className="cp-back-btn" onClick={() => setActiveSection(null)}><BackArrow /></button>
          <h2 className="cp-sub-title">Units</h2>
          <span style={{ width: 60 }} />
        </div>
        <div className="cp-form-scroll">
          <div className="cp-form-section-label">Weight</div>
          <div className="cp-form-card">
            {[['kg', 'Kilograms (kg)'], ['lbs', 'Pounds (lbs)']].map(([val, label], i, arr) => (
              <button
                key={val}
                className={`cp-row${i === arr.length - 1 ? ' cp-row--last' : ''}`}
                onClick={() => toggleUnit(val)}
              >
                <span className="cp-row-label">{label}</span>
                <span className="cp-row-right">
                  {weightUnit === val && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Main Settings Page ─────────────────────────────────────────────────────
  return (
    <div className="cp-container animate-slide-up">
      {/* User card at top */}
      <div className="cp-user-card">
        <div className="cp-avatar">{initial}</div>
        <div className="cp-user-info">
          <div className="cp-user-name">{form.userName || 'Warrior'}</div>
          <div className="cp-user-email">{userEmail}</div>
        </div>
      </div>

      {/* Account section */}
      <div className="cp-section-label">Account</div>
      <div className="cp-section-card">
        <SettingsRow icon="👤" label="Profile" onTap={() => { setForm(readProfile()); setActiveSection('profile'); }} />
        <SettingsRow icon="🔒" label="Account" onTap={() => setActiveSection('account')} />
        <SettingsRow icon="🔔" label="Notifications" value={notifState === 'granted' ? 'On' : 'Off'} onTap={() => setActiveSection('notifications')} last />
      </div>

      {/* Preferences section */}
      <div className="cp-section-label">Preferences</div>
      <div className="cp-section-card">
        <SettingsRow icon="🏋️" label="Workouts" onTap={() => setActiveSection('workouts')} />
        <SettingsRow icon="📏" label="Measurements" onTap={() => setActiveSection('measurements')} />
        <SettingsRow icon="📐" label="Units" value={weightUnit === 'kg' ? 'Metric' : 'Imperial'} onTap={() => setActiveSection('units')} last />
      </div>

      {/* Log out */}
      <button className="cp-logout-btn" onClick={handleLogout}>Log Out</button>

      <div className="cp-app-version">Fitengineers · v3</div>
    </div>
  );
}
