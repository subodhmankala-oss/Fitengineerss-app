import React, { useState } from 'react';
import './AIWorkoutBuilderModal.css';

const WORKOUT_LENGTH_OPTIONS = [30, 45, 60, 75];
const TRAINING_DAYS_OPTIONS = [2, 3, 4, 5, 6];
const SPLIT_OPTIONS = ['Full Body', 'Upper Lower', 'Push Pull Legs', 'Bro Split', 'Custom'];
const DIFFICULTY_OPTIONS = ['Beginner', 'Intermediate', 'Advanced'];

const PLACEHOLDER = `Create a 5-day hypertrophy workout.
Prioritize upper chest and shoulders.
Avoid heavy squats due to knee pain.
Keep workouts under 60 minutes.
Progressive overload.
Use dumbbells and cables.`;

/**
 * AI Workout Draft Builder — entry point for the "Create Draft with AI"
 * choice on the coach's Create Workout Plan flow (see TrainerDashboard.jsx).
 * This component only GENERATES a draft (calls /api/generate-workout-draft)
 * and hands the result to onGenerated — it never saves or assigns anything
 * itself. The coach reviews/edits the result in the existing plan editor,
 * and only "Assign Workout Plan" there actually persists it.
 *
 * client fields (gender, experienceLevel, injuries, equipment) beyond the
 * core profile aren't tracked anywhere in this app's client schema today —
 * those three are collected here as one-off generation inputs only; they
 * are NOT saved back to the client's profile.
 */
const AIWorkoutBuilderModal = ({ client, onClose, onGenerated }) => {
  const [instructions, setInstructions] = useState('');
  const [workoutLengthMinutes, setWorkoutLengthMinutes] = useState(null);
  const [trainingDays, setTrainingDays] = useState(null);
  const [split, setSplit] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
  const [experienceLevel, setExperienceLevel] = useState('');
  const [injuries, setInjuries] = useState('');
  const [equipment, setEquipment] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const summaryItems = [
    ['Name', client.name],
    ['Age', client.age ? `${client.age} yrs` : null],
    ['Height', client.height ? `${client.height} cm` : null],
    ['Weight', client.weight ? `${client.weight} kg` : null],
    ['Goal', client.goal],
    ['Calories', client.calories ? `${client.calories} kcal` : null],
    ['Protein', client.protein ? `${client.protein} g` : null]
  ].filter(([, v]) => v);

  const handleGenerate = async () => {
    if (generating) return;
    if (!instructions.trim() && !split && !trainingDays) {
      setError('Add a quick instruction, or pick at least one advanced option, so the AI has something to work from.');
      return;
    }
    setError('');
    setGenerating(true);
    try {
      const resp = await fetch('/api/generate-workout-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: {
            name: client.name,
            age: client.age,
            height: client.height,
            weight: client.weight,
            goal: client.goal,
            calories: client.calories,
            protein: client.protein,
            experienceLevel: experienceLevel || null,
            injuries: injuries.trim() || null,
            equipment: equipment.trim() || null
          },
          instructions,
          options: {
            workoutLengthMinutes,
            trainingDays,
            split,
            difficulty
          }
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Failed to generate workout draft.');
      onGenerated(data.draft);
    } catch (err) {
      setError(err.message || 'Something went wrong generating the draft. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="payment-gateway-backdrop ai-builder-backdrop">
      <div className="payment-gateway-modal ai-builder-modal-card animate-scale-in">
        <div className="payment-modal-header">
          <div className="modal-title-box">
            <span className="secure-badge">✨ AI DRAFT BUILDER</span>
            <h3>Create Draft with AI</h3>
          </div>
          <button type="button" className="btn-close-modal" onClick={onClose} disabled={generating}>✕</button>
        </div>

        <div className="ai-builder-body">
          <div className="ai-builder-section">
            <span className="ai-builder-section-label">Client profile</span>
            <div className="ai-client-summary-grid">
              {summaryItems.map(([label, value]) => (
                <div key={label} className="ai-client-summary-item">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <p className="ai-builder-hint">
              Experience level, injuries, and equipment aren't tracked in this client's profile yet — add them below if relevant, just for this draft.
            </p>
            <div className="ai-optional-fields-row">
              <select
                value={experienceLevel}
                onChange={e => setExperienceLevel(e.target.value)}
                className="ai-select"
                disabled={generating}
              >
                <option value="">Experience level (optional)</option>
                {DIFFICULTY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <input
                type="text"
                placeholder="Injuries (optional)"
                value={injuries}
                onChange={e => setInjuries(e.target.value)}
                className="ai-text-input"
                disabled={generating}
              />
              <input
                type="text"
                placeholder="Equipment available (optional)"
                value={equipment}
                onChange={e => setEquipment(e.target.value)}
                className="ai-text-input"
                disabled={generating}
              />
            </div>
          </div>

          <div className="ai-builder-section">
            <span className="ai-builder-section-label">Coach instructions</span>
            <textarea
              className="ai-instructions-textarea"
              placeholder={PLACEHOLDER}
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              rows={7}
              disabled={generating}
            />
          </div>

          <div className="ai-builder-section">
            <span className="ai-builder-section-label">Advanced options (all optional)</span>

            <div className="ai-option-group">
              <span className="ai-option-group-label">Workout length</span>
              <div className="ai-chip-row">
                {WORKOUT_LENGTH_OPTIONS.map(min => (
                  <button
                    key={min}
                    type="button"
                    className={`ai-option-chip ${workoutLengthMinutes === min ? 'active' : ''}`}
                    onClick={() => setWorkoutLengthMinutes(workoutLengthMinutes === min ? null : min)}
                    disabled={generating}
                  >
                    {min} min
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-option-group">
              <span className="ai-option-group-label">Training days</span>
              <div className="ai-chip-row">
                {TRAINING_DAYS_OPTIONS.map(d => (
                  <button
                    key={d}
                    type="button"
                    className={`ai-option-chip ${trainingDays === d ? 'active' : ''}`}
                    onClick={() => setTrainingDays(trainingDays === d ? null : d)}
                    disabled={generating}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-option-group">
              <span className="ai-option-group-label">Split</span>
              <div className="ai-chip-row">
                {SPLIT_OPTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`ai-option-chip ${split === s ? 'active' : ''}`}
                    onClick={() => setSplit(split === s ? null : s)}
                    disabled={generating}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-option-group">
              <span className="ai-option-group-label">Difficulty</span>
              <div className="ai-chip-row">
                {DIFFICULTY_OPTIONS.map(d => (
                  <button
                    key={d}
                    type="button"
                    className={`ai-option-chip ${difficulty === d ? 'active' : ''}`}
                    onClick={() => setDifficulty(difficulty === d ? null : d)}
                    disabled={generating}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && <div className="ai-builder-error">{error}</div>}
        </div>

        <div className="ai-builder-footer">
          <button type="button" className="ai-builder-cancel-btn" onClick={onClose} disabled={generating}>
            Cancel
          </button>
          <button type="button" className={`ai-builder-generate-btn ${generating ? 'loading' : ''}`} onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating…' : '✨ Generate Draft'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIWorkoutBuilderModal;
