import React, { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';

// Super-admin-only screen: every workout_plans row created through the new
// "Create Workout" flow lands here with media_status = 'pending' until an
// admin either uploads media (-> 'completed') or schedules a later pass
// (-> 'scheduled'). See CreateWorkoutModal.jsx (creation side) and
// sql/supabase_create_workout_admin_review.sql (schema/RLS).
export default function AdminWorkoutReviewQueue() {
  const [plans, setPlans] = useState([]);
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(false);
  const [scheduleDrafts, setScheduleDrafts] = useState({}); // planId -> datetime-local string
  const [uploadTargets, setUploadTargets] = useState({}); // planId -> exerciseIndex or 'plan'
  const [busyPlanId, setBusyPlanId] = useState(null);
  const [toast, setToast] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await databaseService.getPendingMediaWorkoutPlans();
      setPlans(data);
      const ids = data.flatMap(p => [p.userId, p.coachId]);
      setUsers(await databaseService.getUsersByIds(ids));
    } catch (e) {
      console.error('Failed to load workout review queue:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleSchedule = async (plan) => {
    const draft = scheduleDrafts[plan.id];
    if (!draft) { showToast('Pick a date/time first.'); return; }
    setBusyPlanId(plan.id);
    try {
      await databaseService.scheduleWorkoutMediaReview(plan.id, new Date(draft).toISOString());
      showToast(`Scheduled "${plan.planName}" for review.`);
      await load();
    } catch (e) {
      showToast(e.message || 'Could not schedule.');
    } finally {
      setBusyPlanId(null);
    }
  };

  const handleMarkComplete = async (plan) => {
    setBusyPlanId(plan.id);
    try {
      await databaseService.markWorkoutMediaCompleted(plan.id);
      showToast(`Marked "${plan.planName}" complete.`);
      await load();
    } catch (e) {
      showToast(e.message || 'Could not update status.');
    } finally {
      setBusyPlanId(null);
    }
  };

  const handleUpload = async (plan, exerciseIndex, file) => {
    if (!file) return;
    setBusyPlanId(plan.id);
    try {
      const isVideo = (file.type || '').startsWith('video/');
      const url = await databaseService.uploadWorkoutMedia(file);
      await databaseService.attachWorkoutMedia(plan.id, plan, { exerciseIndex, mediaUrl: url, mediaType: isVideo ? 'video' : 'image' });
      showToast('Media attached.');
      await load();
    } catch (e) {
      showToast(e.message || 'Upload failed.');
    } finally {
      setBusyPlanId(null);
    }
  };

  const statusBadge = (status) => {
    const styles = {
      pending: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)', color: '#fbbf24' },
      scheduled: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.4)', color: '#60a5fa' },
      completed: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.4)', color: '#34d399' }
    };
    const s = styles[status] || styles.pending;
    return (
      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: s.bg, border: `1px solid ${s.border}`, color: s.color, textTransform: 'capitalize' }}>
        {status}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ color: '#fff', fontSize: '1rem', fontWeight: 800, margin: 0 }}>🎬 Workout Media Review Queue</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>Plans awaiting images/video, newest first.</p>
        </div>
        <button
          type="button"
          onClick={load}
          style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}
        >↻ Refresh</button>
      </div>

      {toast && (
        <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.35)', color: 'var(--primary-accent-light)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem' }}>
          {toast}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</p>
      ) : plans.length === 0 ? (
        <p style={{ color: 'var(--text-subtle)', fontSize: '0.85rem', fontStyle: 'italic' }}>Nothing pending — every plan has its media.</p>
      ) : (
        plans.map(plan => {
          const client = users[plan.userId];
          const coach = users[plan.coachId];
          const uploadTarget = uploadTargets[plan.id] ?? 'plan';
          return (
            <div key={plan.id} className="glass-panel" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                <div>
                  <h4 style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 800, margin: 0 }}>{plan.planName}</h4>
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    {plan.createdBy === 'coach'
                      ? <>Coach: <strong>{coach?.full_name || 'Unknown'}</strong> · Client: <strong>{client?.full_name || 'Unknown'}</strong></>
                      : <>Client-authored · <strong>{client?.full_name || 'Unknown'}</strong></>}
                  </p>
                  {(plan.category || plan.workoutType) && (
                    <p style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', margin: '4px 0 0' }}>
                      {[plan.category, plan.workoutType].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  {statusBadge(plan.mediaStatus)}
                  {plan.media.length > 0 && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--primary-accent-light)' }}>📎 {plan.media.length} plan-level</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {plan.exercises.map((ex, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-sm)' }}>
                    <span>{ex.name} — {ex.sets ?? '–'} × {ex.reps ?? '–'} (rest {ex.rest ?? '–'}s)</span>
                    {Array.isArray(ex.media) && ex.media.length > 0 && <span style={{ color: 'var(--primary-accent-light)' }}>📎 {ex.media.length}</span>}
                  </div>
                ))}
              </div>

              {plan.mediaStatus !== 'completed' && (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                    <select
                      value={uploadTarget}
                      onChange={(e) => setUploadTargets(prev => ({ ...prev, [plan.id]: e.target.value === 'plan' ? 'plan' : Number(e.target.value) }))}
                      style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: '0.78rem' }}
                    >
                      <option value="plan">Whole plan</option>
                      {plan.exercises.map((ex, idx) => (
                        <option key={idx} value={idx}>{ex.name}</option>
                      ))}
                    </select>
                    <label style={{ padding: '8px 14px', background: 'rgba(16,185,129,0.08)', border: '1px dashed rgba(16,185,129,0.35)', color: 'var(--primary-accent-light)', borderRadius: 'var(--radius-sm)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                      📤 Upload image/video
                      <input
                        type="file"
                        accept="image/*,video/*"
                        style={{ display: 'none' }}
                        disabled={busyPlanId === plan.id}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          const target = uploadTargets[plan.id];
                          handleUpload(plan, typeof target === 'number' ? target : -1, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="datetime-local"
                      value={scheduleDrafts[plan.id] || ''}
                      onChange={(e) => setScheduleDrafts(prev => ({ ...prev, [plan.id]: e.target.value }))}
                      style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: '0.78rem' }}
                    />
                    <button
                      type="button"
                      disabled={busyPlanId === plan.id}
                      onClick={() => handleSchedule(plan)}
                      style={{ padding: '8px 14px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.35)', color: '#60a5fa', borderRadius: 'var(--radius-sm)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                    >📅 Schedule</button>
                    <button
                      type="button"
                      disabled={busyPlanId === plan.id}
                      onClick={() => handleMarkComplete(plan)}
                      style={{ padding: '8px 14px', background: 'var(--primary-accent)', border: 'none', color: '#0a0a0a', borderRadius: 'var(--radius-sm)', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer' }}
                    >✓ Mark Complete</button>
                  </div>
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
