import { useState, useEffect } from 'react';
import databaseService from '../services/databaseService';
import { notifyEvent } from '../utils/pushNotify';
import { subscribeToPush, unsubscribeFromPush, hasActivePushSubscription } from '../utils/pushSubscription';
import Avatar from './Avatar';
import WhatsNewList from './WhatsNewList';
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

export default function ClientProfile({ handleLogout, onReplayDemoTour, initialSection = null }) {
  // Lets App.jsx jump straight to a sub-section (e.g. Measurements, from the
  // measurement-reminder push notification's deep link) instead of landing
  // on the plain settings list and leaving the user to find it themselves.
  const [activeSection, setActiveSection] = useState(initialSection);

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
  // Full DB history (newest first) so the client can compare against their
  // last entry, and so the 15-day save cadence can be enforced from the real
  // last-saved date (not a spoofable local value).
  const [measHistory, setMeasHistory] = useState([]);

  const MEAS_INTERVAL_DAYS = 15;
  // Days until the next allowed save, based on the newest history entry.
  // 0 = allowed now (or no prior entry). Rounded up so "14.2 days left"
  // reads as 15 remaining, never a misleading 0 while still locked.
  const measDaysUntilNextSave = (() => {
    if (!measHistory.length) return 0;
    const last = new Date(measHistory[0].measuredAt).getTime();
    const elapsedDays = (Date.now() - last) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.ceil(MEAS_INTERVAL_DAYS - elapsedDays));
  })();
  const measCanSave = measDaysUntilNextSave === 0;

  const userEmail = localStorage.getItem('userEmail') || '';
  // Real React state (not a plain const re-read from the live Notification
  // API) — otherwise this screen never reflects a permission change made via
  // its own toggle, since granting/denying the native prompt doesn't itself
  // trigger a re-render. The toggle would look stuck on "OFF" even after the
  // client actually granted permission.
  const [notifState, setNotifState] = useState('Notification' in window ? Notification.permission : 'unsupported');
  // Whether THIS device currently has an active push subscription. Tracked
  // separately from notifState: browser permission can never be revoked
  // from JS once granted, so "on"/"off" here has to mean "is this device
  // actually subscribed", which we CAN create/remove on demand.
  const [pushSubscribed, setPushSubscribed] = useState(false);

  useEffect(() => {
    const syncNotifState = () => {
      if ('Notification' in window) setNotifState(Notification.permission);
    };
    window.addEventListener('notificationPermissionChanged', syncNotifState);
    hasActivePushSubscription().then(setPushSubscribed);
    return () => window.removeEventListener('notificationPermissionChanged', syncNotifState);
  }, []);

  // The fields above are seeded from localStorage for an instant paint, but
  // that cache is never refreshed on its own — it can go stale relative to
  // the actual clients row (e.g. after a coach recalculates targets), which
  // showed up as this screen displaying different calorie/protein numbers
  // than the coach's dashboard for the same person. Reconcile once on mount
  // from the same source of truth the coach dashboard reads, same
  // cache-then-reconcile pattern used elsewhere in this app. Only overwrites
  // fields the DB actually has a value for, so it can't blank out something
  // the cache had that the fetch (e.g. a transient failure) didn't return.
  useEffect(() => {
    if (!userEmail) return;
    let cancelled = false;
    databaseService.getUserProfileByEmail(userEmail).then(profile => {
      if (cancelled || !profile) return;
      const fresh = {};
      ['userName', 'userAge', 'userHeight', 'userWeight', 'userGoal', 'userActivity', 'userDiet',
        'userCalorieTarget', 'userProteinTarget', 'userCarbsTarget', 'userFatsTarget'].forEach(key => {
        if (profile[key]) fresh[key] = String(profile[key]);
      });
      if (Object.keys(fresh).length === 0) return;
      setForm(f => ({ ...f, ...fresh }));
      Object.entries(fresh).forEach(([k, v]) => localStorage.setItem(k, v));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userEmail]);

  // Load the client's own body-measurement history — drives both the
  // comparison view and the 15-day save lock.
  const loadMeasHistory = async () => {
    const userId = await databaseService.resolveUserId();
    if (!userId) return;
    const history = await databaseService.getBodyMeasurements(userId);
    setMeasHistory(history);
    // Seed the form from the newest entry so the client edits from their
    // latest numbers, and keep the localStorage cache in sync.
    if (history.length > 0) {
      setMeasurements(history[0].measurements || {});
      localStorage.setItem('userMeasurements', JSON.stringify(history[0].measurements || {}));
    }
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = await databaseService.resolveUserId();
      if (cancelled || !userId) return;
      const history = await databaseService.getBodyMeasurements(userId);
      if (cancelled) return;
      setMeasHistory(history);
      if (history.length > 0) {
        setMeasurements(history[0].measurements || {});
        localStorage.setItem('userMeasurements', JSON.stringify(history[0].measurements || {}));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const userAvatarUrl = localStorage.getItem('userAvatarUrl') || null;

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
    if (notifState === 'granted' && pushSubscribed) {
      // Already on — this tap means turn it off.
      await unsubscribeFromPush();
      setPushSubscribed(false);
      return;
    }
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setNotifState(result);
    window.dispatchEvent(new Event('notificationPermissionChanged'));
    if (result === 'granted') {
      await subscribeToPush(localStorage.getItem('userName'));
      setPushSubscribed(true);
    }
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
    // "On" means this device is actually subscribed, not just that browser
    // permission was granted at some point (permission can be granted with
    // no active subscription right after turning notifications off).
    const notifOn = granted && pushSubscribed;
    // 'Notification' in window is false on iOS Safari unless the app was
    // installed via Share → Add to Home Screen (and opened from that icon,
    // not the browser tab) — a very common way clients first open a shared
    // link. Previously the toggle rendered as a normal, tappable "OFF"
    // button in this case, but requestNotifications() silently no-ops, so
    // it looked broken with zero feedback. Surface the real reason instead.
    const unsupported = notifState === 'unsupported';
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
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
                  {denied
                    ? 'Blocked in browser settings — enable in your device settings.'
                    : notifOn
                    ? 'Active — you\'ll receive daily reminders.'
                    : unsupported
                    ? (isIOS ? 'Not available in Safari — add this app to your Home Screen first.' : 'Push notifications aren\'t supported in this browser.')
                    : 'Tap to enable push notifications.'}
                </div>
              </div>
              {!denied && !unsupported && (
                <button
                  className={`cp-notif-toggle${notifOn ? ' cp-notif-toggle--on' : ''}`}
                  onClick={requestNotifications}
                >
                  {notifOn ? 'ON' : 'OFF'}
                </button>
              )}
            </div>
          </div>
          {denied && (
            <p className="cp-notif-hint">
              To re-enable, go to your browser / OS notification settings and allow Fitengineers, then reload the app.
            </p>
          )}
          {unsupported && isIOS && (
            <p className="cp-notif-hint">
              On iPhone/iPad: open this app in Safari, tap the Share icon, choose "Add to Home Screen", then launch it from that new icon instead of Safari. Notifications only work from the installed app.
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
      { key: 'weight',    label: 'Body Weight', unit: 'kg' },
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
    // Newest = the previous saved entry to compare the current edits against.
    const previousEntry = measHistory[0] || null;
    const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

    const saveMeasurements = async () => {
      if (!measCanSave) return; // 15-day lock — button is disabled, guard anyway
      // Persist a new history row (shared with the coach). Keep the numeric
      // values as strings-in / numbers-out consistent with the form.
      const cleaned = {};
      Object.entries(measurements).forEach(([k, v]) => {
        if (v !== '' && v != null) cleaned[k] = v;
      });
      // This is an insert-only history table, so a save with nothing filled
      // in (e.g. the form reset to a stale/empty cache after a reload) would
      // still create a row and burn the 15-day window on a blank entry, with
      // no way to fix it until the lock clears. Refuse instead of locking
      // the client out over nothing.
      if (Object.keys(cleaned).length === 0) {
        setMeasSaveMsg('error');
        setTimeout(() => setMeasSaveMsg(''), 2500);
        return;
      }
      setMeasSaving(true);
      const userId = await databaseService.resolveUserId();
      try {
        const res = await databaseService.saveBodyMeasurement(userId, cleaned);
        if (!res.success) throw new Error(res.error);
        localStorage.setItem('userMeasurements', JSON.stringify(cleaned));
        await loadMeasHistory();
        // Let the client's coach know new measurements are in.
        if (userId) notifyEvent('measurements_saved', { clientUserId: userId });
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
            disabled={measSaving || !measCanSave}
            style={!measCanSave ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
          >
            {measSaving ? 'Saving…' : measSaveMsg === 'saved' ? '✓ Saved' : 'Save'}
          </button>
        </div>
        <div className="cp-form-scroll">
          {/* 15-day cadence notice */}
          {!measCanSave ? (
            <div style={{
              background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: '12px', padding: '12px 14px', marginBottom: '14px'
            }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fbbf24' }}>
                ⏳ Next update in {measDaysUntilNextSave} day{measDaysUntilNextSave === 1 ? '' : 's'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                Measurements can be updated once every {MEAS_INTERVAL_DAYS} days. Last saved {previousEntry ? fmtDate(previousEntry.measuredAt) : ''}.
              </div>
            </div>
          ) : previousEntry ? (
            <div style={{
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
              borderRadius: '12px', padding: '12px 14px', marginBottom: '14px'
            }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary-accent-light)' }}>
                ✅ Ready for your next update
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                Enter today's numbers below — changes vs your last entry ({fmtDate(previousEntry.measuredAt)}) are shown live.
              </div>
            </div>
          ) : null}

          <div className="cp-form-section-label">Body Measurements (cm)</div>
          <div className="cp-form-card">
            {measFields.map(({ key, label, unit }, i) => {
              const prevVal = previousEntry?.measurements?.[key];
              const curVal = measurements[key];
              const delta = (prevVal != null && prevVal !== '' && curVal != null && curVal !== '')
                ? (parseFloat(curVal) - parseFloat(prevVal))
                : null;
              return (
                <div
                  key={key}
                  className={`cp-field${i > 0 ? ' cp-field--border' : ''}${i === measFields.length - 1 ? ' cp-field--last' : ''}`}
                >
                  <label className="cp-field-label">
                    {label}
                    {delta != null && Math.abs(delta) > 0.001 && (
                      <span style={{
                        marginLeft: '7px', fontSize: '0.68rem', fontWeight: 700,
                        color: delta > 0 ? '#34d399' : '#f87171'
                      }}>
                        {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}{unit || 'cm'}
                      </span>
                    )}
                  </label>
                  <input
                    className="cp-field-input cp-field-input--right"
                    type="number"
                    step="0.1"
                    placeholder={unit || 'cm'}
                    value={measurements[key] || ''}
                    disabled={!measCanSave}
                    onChange={e => setMeasurements(m => ({ ...m, [key]: e.target.value }))}
                  />
                </div>
              );
            })}
          </div>

          {/* History timeline for at-a-glance comparison */}
          {measHistory.length > 0 && (
            <>
              <div className="cp-form-section-label" style={{ marginTop: '18px' }}>History</div>
              <div className="cp-form-card" style={{ padding: '4px 0' }}>
                {measHistory.map((entry, idx) => {
                  const filled = measFields.filter(f => entry.measurements?.[f.key] != null && entry.measurements[f.key] !== '');
                  return (
                    <div key={entry.id} style={{
                      padding: '10px 14px',
                      borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none'
                    }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fff' }}>
                        {fmtDate(entry.measuredAt)}{idx === 0 && <span style={{ color: 'var(--primary-accent-light)', fontWeight: 700, marginLeft: '6px', fontSize: '0.66rem' }}>LATEST</span>}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.6 }}>
                        {filled.length > 0
                          ? filled.map(f => `${f.label}: ${entry.measurements[f.key]}${f.unit || 'cm'}`).join(' · ')
                          : 'No values recorded'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

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

  // ── Sub-section: What's New ────────────────────────────────────────────────
  if (activeSection === 'whatsnew') {
    return (
      <div className="cp-container animate-slide-up">
        <div className="cp-sub-header">
          <button className="cp-back-btn" onClick={() => setActiveSection(null)}><BackArrow /></button>
          <h2 className="cp-sub-title">What's New</h2>
          <span style={{ width: 60 }} />
        </div>
        <div className="cp-form-scroll">
          <WhatsNewList audience="client" />
        </div>
      </div>
    );
  }

  // ── Main Settings Page ─────────────────────────────────────────────────────
  return (
    <div className="cp-container animate-slide-up">
      {/* User card at top */}
      <div className="cp-user-card">
        <Avatar className="cp-avatar" email={userEmail} name={form.userName} avatarUrl={userAvatarUrl} size={56} style={{ fontSize: '1.4rem' }} />
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

      {/* Updates section */}
      <div className="cp-section-label">Updates</div>
      <div className="cp-section-card">
        <SettingsRow icon="✨" label="What's New" onTap={() => setActiveSection('whatsnew')} last />
      </div>

      {/* Help section */}
      {onReplayDemoTour && (
        <>
          <div className="cp-section-label">Help</div>
          <div className="cp-section-card">
            <SettingsRow icon="🎬" label="App Tutorial" onTap={onReplayDemoTour} last />
          </div>
        </>
      )}

      {/* Log out */}
      <button className="cp-logout-btn" onClick={handleLogout}>Log Out</button>

      <div className="cp-app-version">Fitengineers · v3</div>
    </div>
  );
}
