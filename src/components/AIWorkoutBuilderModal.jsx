import React, { useEffect, useMemo, useState } from 'react';
import databaseService from '../services/databaseService';
import { catalogForPrompt } from '../utils/aiWorkoutCatalog';
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

// One-tap starting points. Picking one fills the advanced options and a
// short brief, so a coach can press Generate straight away and only type
// when the client needs something specific. `goal` decides which ones are
// listed first for this client (see orderQuickStarts).
const QUICK_STARTS = [
  { id: 'fl3', goal: 'fat', label: 'Fat loss · 3 days · Full body', days: 3, split: 'Full Body', length: 45,
    brief: 'Fat loss focus. Full-body strength sessions with a short conditioning finisher at the end of each day. Keep rest short.' },
  { id: 'fl4', goal: 'fat', label: 'Fat loss · 4 days · Upper/Lower', days: 4, split: 'Upper Lower', length: 45,
    brief: 'Fat loss focus. Upper/lower strength split, compound lifts first, finish each day with 10 min of cardio.' },
  { id: 'mg4', goal: 'muscle', label: 'Muscle gain · 4 days · Upper/Lower', days: 4, split: 'Upper Lower', length: 60,
    brief: 'Hypertrophy focus. Upper/lower split, 8-12 reps on most lifts, progressive overload on the main compound lifts.' },
  { id: 'mg5', goal: 'muscle', label: 'Muscle gain · 5 days · PPL', days: 5, split: 'Push Pull Legs', length: 60,
    brief: 'Hypertrophy focus. Push/pull/legs, then upper and lower. 8-12 reps on most lifts, balanced weekly volume.' },
  { id: 'st3', goal: 'strength', label: 'Strength · 3 days · Full body', days: 3, split: 'Full Body', length: 60,
    brief: 'Strength focus. One main compound lift per day for 4-5 sets of 5, then 3-4 accessories.' },
  { id: 'gf2', goal: 'general', label: 'Beginner · 2 days · Full body', days: 2, split: 'Full Body', length: 30, difficulty: 'Beginner',
    brief: 'General fitness for a beginner. Simple, safe full-body sessions with machines and dumbbells; learn the movements first.' }
];

const goalKind = (goal) => {
  const g = String(goal || '').toLowerCase();
  if (/fat|loss|lean|cut|weight/.test(g)) return 'fat';
  if (/muscle|gain|build|bulk|hypertroph/.test(g)) return 'muscle';
  if (/strength|power/.test(g)) return 'strength';
  return 'general';
};

const orderQuickStarts = (goal) => {
  const kind = goalKind(goal);
  return [...QUICK_STARTS.filter(q => q.goal === kind), ...QUICK_STARTS.filter(q => q.goal !== kind)];
};

/**
 * AI Workout Draft Builder — entry point for the "Create Draft with AI"
 * choice on the coach's Create Workout Plan flow (see TrainerDashboard.jsx).
 * This component only GENERATES a draft (calls /api/generate-workout-draft)
 * and hands the result to onGenerated — it never saves or assigns a plan
 * itself. The coach reviews/edits the result in the existing plan editor,
 * and only "Assign Workout Plan" there actually persists it.
 *
 * Experience level, injuries and equipment are remembered per client
 * (databaseService.get/saveClientTrainingProfile) — loaded when the modal
 * opens and saved when a draft is generated, so they're typed once.
 *
 * `catalog` is the coach's exercise library (utils/loadAiCatalog); the model
 * may only pick from it. null while it's still loading.
 */
const AIWorkoutBuilderModal = ({ client, coachId, catalog, onClose, onGenerated }) => {
  const [instructions, setInstructions] = useState('');
  const [workoutLengthMinutes, setWorkoutLengthMinutes] = useState(null);
  const [trainingDays, setTrainingDays] = useState(null);
  const [split, setSplit] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
  const [experienceLevel, setExperienceLevel] = useState('');
  const [injuries, setInjuries] = useState('');
  const [equipment, setEquipment] = useState('');
  const [savedProfile, setSavedProfile] = useState(null);
  const [quickStartId, setQuickStartId] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const quickStarts = useMemo(() => orderQuickStarts(client.goal), [client.goal]);

  useEffect(() => {
    let cancelled = false;
    if (!client.id) return undefined;
    databaseService.getClientTrainingProfile(client.id).then(p => {
      if (cancelled || !p) return;
      setSavedProfile(p);
      setExperienceLevel(prev => prev || p.experienceLevel || '');
      setInjuries(prev => prev || p.injuries || '');
      setEquipment(prev => prev || p.equipment || '');
    });
    return () => { cancelled = true; };
  }, [client.id]);

  const summaryItems = [
    ['Name', client.name],
    ['Age', client.age ? `${client.age} yrs` : null],
    ['Height', client.height ? `${client.height} cm` : null],
    ['Weight', client.weight ? `${client.weight} kg` : null],
    ['Goal', client.goal],
    ['Calories', client.calories ? `${client.calories} kcal` : null],
    ['Protein', client.protein ? `${client.protein} g` : null]
  ].filter(([, v]) => v);

  const applyQuickStart = (q) => {
    if (quickStartId === q.id) {
      setQuickStartId(null);
      return;
    }
    setQuickStartId(q.id);
    setTrainingDays(q.days);
    setSplit(q.split);
    setWorkoutLengthMinutes(q.length);
    setDifficulty(q.difficulty || experienceLevel || null);
    // Only fill the brief when the coach hasn't written their own, or it's
    // still another quick start's brief.
    setInstructions(prev => (!prev.trim() || QUICK_STARTS.some(x => x.brief === prev) ? q.brief : prev));
  };

  const handleGenerate = async () => {
    if (generating) return;
    if (!instructions.trim() && !split && !trainingDays) {
      setError('Pick a starting point, or write a quick instruction, so the AI has something to work from.');
      return;
    }
    setError('');
    setGenerating(true);
    const profile = { experienceLevel, injuries: injuries.trim(), equipment: equipment.trim() };
    const changed = !savedProfile
      ? (profile.experienceLevel || profile.injuries || profile.equipment)
      : (profile.experienceLevel !== savedProfile.experienceLevel || profile.injuries !== savedProfile.injuries || profile.equipment !== savedProfile.equipment);
    if (client.id && changed) {
      databaseService.saveClientTrainingProfile(client.id, profile, coachId).then(() => setSavedProfile(profile));
    }
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
            injuries: profile.injuries || null,
            equipment: profile.equipment || null
          },
          instructions,
          options: {
            workoutLengthMinutes,
            trainingDays,
            split,
            difficulty
          },
          catalog: catalogForPrompt(catalog)
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Failed to generate workout draft.');
      // Hands back the request too, so "Regenerate this day" in the editor
      // can ask again with the same brief.
      onGenerated(data.draft, {
        client: {
          name: client.name, age: client.age, height: client.height, weight: client.weight,
          goal: client.goal, calories: client.calories, protein: client.protein,
          experienceLevel: experienceLevel || null, injuries: profile.injuries || null, equipment: profile.equipment || null
        },
        instructions,
        options: { workoutLengthMinutes, trainingDays, split, difficulty }
      });
    } catch (err) {
      setError(err.message || 'Something went wrong generating the draft. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const optionsSummary = [
    trainingDays ? `${trainingDays} days` : null,
    split,
    workoutLengthMinutes ? `${workoutLengthMinutes} min` : null,
    difficulty
  ].filter(Boolean).join(' · ');

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
            <span className="ai-builder-section-label">Start from</span>
            <div className="ai-chip-row">
              {quickStarts.map(q => (
                <button
                  key={q.id}
                  type="button"
                  className={`ai-option-chip ${quickStartId === q.id ? 'active' : ''}`}
                  onClick={() => applyQuickStart(q)}
                  disabled={generating}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

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
              {savedProfile
                ? `Remembered from last time for ${client.name || 'this client'} — change anything that's different now.`
                : `Experience, injuries and equipment are saved for ${client.name || 'this client'}, so you only fill them in once.`}
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
              rows={5}
              disabled={generating}
            />
          </div>

          <div className="ai-builder-section">
            <button
              type="button"
              className="ai-advanced-toggle"
              onClick={() => setShowAdvanced(s => !s)}
              aria-expanded={showAdvanced}
            >
              <span className="ai-builder-section-label">Advanced options</span>
              <span className="ai-advanced-summary">{optionsSummary || 'all optional'}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {showAdvanced && (
              <>
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
              </>
            )}
          </div>

          {error && <div className="ai-builder-error">{error}</div>}
        </div>

        <div className="ai-builder-footer">
          <button type="button" className="ai-builder-cancel-btn" onClick={onClose} disabled={generating}>
            Cancel
          </button>
          <button
            type="button"
            className={`ai-builder-generate-btn ${generating ? 'loading' : ''}`}
            onClick={handleGenerate}
            disabled={generating || !catalog}
          >
            {generating ? 'Generating…' : !catalog ? 'Loading library…' : '✨ Generate Draft'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIWorkoutBuilderModal;
