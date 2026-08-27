import React, { useState } from 'react';
import ExercisePickerModal from './ExercisePickerModal';
import databaseService from '../services/databaseService';

// Shared "Create Workout" flow for the Workout Library — used by both the
// coach (TrainerDashboard, building a plan for whichever client is
// currently selected) and the client (WorkoutTracker, building their own
// plan). Deliberately separate from TrainerDashboard's existing plan-editor
// UI (editorExercises/showPlanEditor), which builds the detailed per-set
// logging shape saveWorkoutPlan expects — this one saves the lighter
// {name, sets, reps, rest, order} template shape via
// databaseService.createWorkoutPlan (see that function's own comment for
// why the two shapes can't share a save path).
//
// No image/video fields here on purpose — those get attached later by the
// super-admin from the Review Queue (AdminWorkoutReviewQueue.jsx) once a
// plan lands with media_status = 'pending'.
const CATEGORIES = ['Push', 'Pull', 'Legs', 'Full Body', 'Upper', 'Lower', 'Core'];
const WORKOUT_TYPES = ['Strength', 'Cardio', 'HIIT', 'Mobility', 'Recovery'];

const modalOverlayStyle = { padding: '10px' };
const cardStyle = {
  maxWidth: '520px',
  width: '100%',
  maxHeight: '88vh',
  overflowY: 'auto',
  padding: '20px',
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-md)'
};
const labelStyle = { fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' };
const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-sm)',
  color: '#fff',
  fontSize: '16px',
  outline: 'none',
  boxSizing: 'border-box'
};

export default function CreateWorkoutModal({ open, onClose, mode, targetUserId, targetUserName, coachId, onSaved }) {
  const [planName, setPlanName] = useState('');
  const [category, setCategory] = useState('');
  const [workoutType, setWorkoutType] = useState('');
  const [exercises, setExercises] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const resetAndClose = () => {
    setPlanName('');
    setCategory('');
    setWorkoutType('');
    setExercises([]);
    setError('');
    onClose();
  };

  const updateExercise = (idx, field, value) => {
    setExercises(prev => prev.map((ex, i) => (i === idx ? { ...ex, [field]: value } : ex)));
  };

  const removeExercise = (idx) => {
    setExercises(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setError('');
    if (!planName.trim()) { setError('Give this workout a name.'); return; }
    if (exercises.length === 0) { setError('Add at least one exercise.'); return; }
    if (mode === 'coach' && !targetUserId) { setError('No client selected — open this from a client\'s profile.'); return; }

    setSaving(true);
    try {
      const saved = await databaseService.createWorkoutPlan({
        userId: targetUserId,
        coachId: mode === 'coach' ? coachId : null,
        planName: planName.trim(),
        category: category || null,
        workoutType: workoutType || null,
        exercises,
        createdBy: mode === 'coach' ? 'coach' : 'client'
      });
      if (onSaved) onSaved(saved);
      resetAndClose();
    } catch (e) {
      setError(e.message || 'Could not save this workout.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="payment-gateway-backdrop" style={modalOverlayStyle} onClick={resetAndClose}>
        <div className="payment-gateway-modal animate-scale-in" style={cardStyle} onClick={(e) => e.stopPropagation()}>
          <h3 style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800, marginBottom: '4px' }}>📋 Create Workout</h3>
          {mode === 'coach' && targetUserName && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '16px' }}>For {targetUserName}</p>
          )}
          {mode === 'client' && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '16px' }}>Build your own workout — add it to your library.</p>
          )}

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Workout Name</label>
            <input
              type="text"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="e.g. Push Day A"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                <option value="">Select…</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Workout Type</label>
              <select value={workoutType} onChange={(e) => setWorkoutType(e.target.value)} style={inputStyle}>
                <option value="">Select…</option>
                {WORKOUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Exercises</label>
            {exercises.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', fontStyle: 'italic', marginBottom: '8px' }}>
                No exercises yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                {exercises.map((ex, idx) => (
                  <div key={`${ex.name}-${idx}`} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>{ex.name}</span>
                      <button
                        type="button"
                        onClick={() => removeExercise(idx)}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.85rem' }}
                      >Remove</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                      <div>
                        <label style={{ ...labelStyle, fontSize: '0.7rem', marginBottom: '3px' }}>Sets</label>
                        <input type="number" min="1" value={ex.sets} onChange={(e) => updateExercise(idx, 'sets', e.target.value)} style={{ ...inputStyle, padding: '8px 10px' }} />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: '0.7rem', marginBottom: '3px' }}>Reps</label>
                        <input type="text" placeholder="8-12" value={ex.reps} onChange={(e) => updateExercise(idx, 'reps', e.target.value)} style={{ ...inputStyle, padding: '8px 10px' }} />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: '0.7rem', marginBottom: '3px' }}>Rest (s)</label>
                        <input type="number" min="0" placeholder="60" value={ex.rest} onChange={(e) => updateExercise(idx, 'rest', e.target.value)} style={{ ...inputStyle, padding: '8px 10px' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              style={{ width: '100%', padding: '10px', background: 'rgba(16,185,129,0.08)', border: '1px dashed rgba(16,185,129,0.35)', color: 'var(--primary-accent-light)', borderRadius: 'var(--radius-sm)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
            >
              + Add Exercise
            </button>
          </div>

          {error && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '10px' }}>{error}</p>}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={resetAndClose}
              style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: 'var(--radius-sm)', fontWeight: 700, cursor: 'pointer' }}
            >Cancel</button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{ flex: 1, padding: '12px', background: 'var(--primary-accent)', border: 'none', color: '#0a0a0a', borderRadius: 'var(--radius-sm)', fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
            >{saving ? 'Saving…' : 'Save Workout'}</button>
          </div>
        </div>
      </div>

      <ExercisePickerModal
        open={showPicker}
        onClose={() => setShowPicker(false)}
        addedNames={exercises.map(ex => ex.name)}
        onAdd={(name) => {
          setExercises(prev => [...prev, { name, sets: 3, reps: '8-12', rest: 60 }]);
        }}
        onRemove={(name) => {
          setExercises(prev => prev.filter(ex => ex.name.toLowerCase() !== name.toLowerCase()));
        }}
      />
    </>
  );
}
