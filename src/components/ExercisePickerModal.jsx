import React, { useState, useEffect } from 'react';
import { EXERCISE_LIBRARY, EXERCISE_CATEGORIES } from '../data/exerciseLibrary';
import databaseService from '../services/databaseService';

// Shared Hevy-style "Add Exercise" modal used by both the client (WorkoutTracker)
// and the coach (TrainerDashboard). Stays open after each add so several
// exercises can be added in a row; tapping an added item removes it. Styling
// comes from WorkoutTracker.css, which both parents import.
export default function ExercisePickerModal({ open, onClose, addedNames = [], onAdd, onRemove }) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('All');
  const [exercises, setExercises] = useState([]);

  useEffect(() => {
    if (open) {
      databaseService.getExerciseLibrary()
        .then(setExercises)
        .catch(err => console.error('Failed to fetch exercises in picker modal:', err));
    }
  }, [open]);

  if (!open) return null;

  const activeLibrary = exercises.length > 0 ? exercises : EXERCISE_LIBRARY;
  const addedSet = new Set(addedNames.map(n => (n || '').toLowerCase()));
  const trimmed = query.trim();
  const filtered = activeLibrary.filter(ex => {
    const matchesSearch = ex.name.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = tag === 'All' || ex.category === tag;
    return matchesSearch && matchesCategory;
  });
  const exactExists = activeLibrary.some(e => e.name.toLowerCase() === trimmed.toLowerCase());

  return (
    <div className="payment-gateway-backdrop exercise-modal-backdrop">
      <div className="payment-gateway-modal exercise-modal-card animate-scale-in">
        <div className="payment-modal-header">
          <div className="modal-title-box">
            <span className="secure-badge">🏋️‍♂️ EXERCISE PRESETS</span>
            <h3>Add Exercise</h3>
          </div>
          <button type="button" className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        <div className="payment-input-group exercise-search-box">
          <input
            type="text"
            placeholder="Search exercise database..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="exercise-search-input"
          />
        </div>

        <div className="exercise-filter-tags">
          {EXERCISE_CATEGORIES.map(t => (
            <button
              key={t}
              type="button"
              className={`filter-tag-btn ${tag === t ? 'active' : ''}`}
              onClick={() => setTag(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="exercise-presets-list">
          {trimmed && !exactExists && (
            <div
              className="exercise-preset-item custom-exercise-add-row"
              style={{
                border: '1px dashed rgba(16, 185, 129, 0.4)',
                background: 'rgba(16, 185, 129, 0.03)',
                marginBottom: '8px',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px'
              }}
            >
              <div className="preset-info">
                <strong style={{ color: 'var(--primary-accent-light)' }}>Create "{trimmed}"</strong>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Custom Exercise</span>
              </div>
              <button
                type="button"
                className="btn-add-preset-action"
                onClick={() => { onAdd(trimmed); setQuery(''); }}
              >
                ➕ Create
              </button>
            </div>
          )}

          {filtered.length === 0 && !trimmed ? (
            <div className="no-presets-found" style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '0.9rem' }}>No exercises in this category.</p>
            </div>
          ) : (
            filtered.map(ex => {
              const already = addedSet.has(ex.name.toLowerCase());
              return (
                <div key={ex.name} className="exercise-preset-item">
                  <div className="preset-icon-monogram" aria-hidden="true">
                    {ex.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="preset-info">
                    <strong>{ex.name}</strong>
                    <span>{ex.primary_muscle || ex.primary || ex.category}</span>
                  </div>
                  <button
                    type="button"
                    className={`btn-add-preset-action ${already ? 'added' : ''}`}
                    onClick={() => (already ? onRemove(ex.name) : onAdd(ex.name))}
                  >
                    {already ? '✓ Added' : '➕ Add'}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="exercise-modal-footer">
          <span className="exercise-modal-count">
            {addedNames.length} exercise{addedNames.length !== 1 ? 's' : ''} added
          </span>
          <button type="button" className="btn-exercise-modal-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
