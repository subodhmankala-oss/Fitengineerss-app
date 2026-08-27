import React, { useEffect, useState } from 'react';
import { EXERCISE_CATEGORIES } from '../data/exerciseLibrary';
import { MUSCLE_GROUPS } from '../utils/muscleGroups';
import databaseService from '../services/databaseService';

// Full-screen "Create Exercise" form, opened from ExercisePickerModal's
// "Create '{query}'" row. Saves to public.custom_exercises (RLS-scoped —
// see sql/supabase_custom_exercises.sql), NOT the shared admin-curated
// public.exercises catalog. mode/coachId/clientUserId mirror the ownership
// stamping createCustomExercise needs: coach mode scopes the exercise to
// coachId + clientUserId (the client the coach is currently working with);
// client mode scopes it to clientUserId only (their own private library).
const EQUIPMENT_OPTIONS = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell', 'Resistance Band', 'Other'];

const rowStyle = {
  display: 'flex', flexDirection: 'column', gap: '6px',
  padding: '14px 0', borderBottom: '1px solid var(--border-color)'
};
const labelStyle = { fontSize: '0.85rem', color: '#fff', fontWeight: 600 };
const selectStyle = {
  background: 'transparent', border: 'none', color: 'var(--primary-accent-light)',
  fontSize: '0.85rem', fontWeight: 600, padding: 0, outline: 'none', cursor: 'pointer'
};

export default function CreateCustomExerciseModal({ open, onClose, initialName, mode, coachId, clientUserId, clientName, onCreated }) {
  const [name, setName] = useState('');
  const [equipment, setEquipment] = useState('');
  const [primaryMuscle, setPrimaryMuscle] = useState('');
  const [otherMuscles, setOtherMuscles] = useState([]);
  const [category, setCategory] = useState('');
  const [assetFile, setAssetFile] = useState(null);
  const [assetPreview, setAssetPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(initialName || '');
      setEquipment('');
      setPrimaryMuscle('');
      setOtherMuscles([]);
      setCategory('');
      setAssetFile(null);
      setAssetPreview('');
      setError('');
    }
  }, [open, initialName]);

  if (!open) return null;

  const handleAssetChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAssetFile(file);
    setAssetPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setError('');
    if (!name.trim()) { setError('Give this exercise a name.'); return; }
    if (mode === 'coach' && !clientUserId) { setError('No client selected — open this from a client\'s profile.'); return; }

    setSaving(true);
    try {
      let mediaUrl = null;
      if (assetFile) {
        mediaUrl = await databaseService.uploadCustomExerciseMedia(assetFile);
      }
      const saved = await databaseService.createCustomExercise({
        name: name.trim(),
        equipment: equipment || null,
        category: category || null,
        primaryMuscle: primaryMuscle || null,
        secondaryMuscles: otherMuscles,
        mediaUrl,
        mode,
        coachId,
        clientUserId
      });
      if (onCreated) onCreated({ ...saved, name: name.trim() });
    } catch (e) {
      setError(e.message || 'Could not save this exercise.');
    } finally {
      setSaving(false);
    }
  };

  const toggleOtherMuscle = (muscle) => {
    setOtherMuscles(prev => prev.includes(muscle) ? prev.filter(m => m !== muscle) : [...prev, muscle]);
  };

  return (
    <div className="payment-gateway-backdrop" style={{ padding: 0 }} onClick={onClose}>
      <div
        className="payment-gateway-modal animate-scale-in"
        style={{ maxWidth: '420px', width: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 0, background: 'var(--bg-card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--border-color)' }}>
          <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', color: '#fff', fontSize: '1rem', cursor: 'pointer' }}>←</button>
          <h3 style={{ color: '#fff', fontSize: '1rem', fontWeight: 800, margin: 0 }}>Create Exercise</h3>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{ background: 'var(--primary-accent)', border: 'none', color: '#0a0a0a', fontWeight: 800, fontSize: '0.85rem', padding: '8px 16px', borderRadius: '20px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>

        {mode === 'coach' && clientName && (
          <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', padding: '10px 18px 0' }}>For {clientName} — only you and {clientName} will see this.</p>
        )}
        {mode === 'client' && (
          <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', padding: '10px 18px 0' }}>Saved to your own exercise library — private to you.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 18px 4px' }}>
          <label style={{ cursor: 'pointer' }}>
            <div style={{
              width: '84px', height: '84px', borderRadius: '50%', border: '1px solid var(--border-color)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'rgba(255,255,255,0.03)'
            }}>
              {assetPreview ? (
                <img src={assetPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '1.6rem' }}>📷</span>
              )}
            </div>
            <input type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleAssetChange} />
          </label>
          <span style={{ fontSize: '0.78rem', color: 'var(--primary-accent-light)', marginTop: '8px', fontWeight: 600 }}>Add Asset</span>
        </div>

        <div style={{ padding: '10px 18px 0' }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Exercise Name"
            style={{
              width: '100%', padding: '10px 0', background: 'transparent', border: 'none',
              borderBottom: '1px solid var(--border-color)', color: '#fff', fontSize: '16px', outline: 'none', boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ padding: '0 18px' }}>
          <div style={rowStyle}>
            <span style={labelStyle}>Equipment</span>
            <select value={equipment} onChange={(e) => setEquipment(e.target.value)} style={selectStyle}>
              <option value="">Select</option>
              {EQUIPMENT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          <div style={rowStyle}>
            <span style={labelStyle}>Primary Muscle Group</span>
            <select value={primaryMuscle} onChange={(e) => setPrimaryMuscle(e.target.value)} style={selectStyle}>
              <option value="">Select</option>
              {MUSCLE_GROUPS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div style={rowStyle}>
            <span style={labelStyle}>Other Muscles <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}>(optional)</span></span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {MUSCLE_GROUPS.filter(m => m !== primaryMuscle).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleOtherMuscle(m)}
                  style={{
                    fontSize: '0.72rem', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', cursor: 'pointer',
                    border: otherMuscles.includes(m) ? '1px solid rgba(16,185,129,0.5)' : '1px solid var(--border-color)',
                    background: otherMuscles.includes(m) ? 'rgba(16,185,129,0.14)' : 'rgba(255,255,255,0.03)',
                    color: otherMuscles.includes(m) ? 'var(--primary-accent-light)' : 'var(--text-muted)'
                  }}
                >{m}</button>
              ))}
            </div>
          </div>

          <div style={{ ...rowStyle, borderBottom: 'none' }}>
            <span style={labelStyle}>Exercise Type</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
              <option value="">Select</option>
              {EXERCISE_CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', padding: '0 18px 16px' }}>{error}</p>}
        <div style={{ height: '16px' }} />
      </div>
    </div>
  );
}
