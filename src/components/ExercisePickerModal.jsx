import React, { useState, useEffect, useRef } from 'react';
import { EXERCISE_LIBRARY, EXERCISE_CATEGORIES } from '../data/exerciseLibrary';
import { getMuscleGroupsForExercise } from '../utils/muscleGroups';
import MuscleThumbnail from './MuscleAnalytics/MuscleThumbnail';
import databaseService from '../services/databaseService';

// MuscleThumbnail mounts a real anatomical body SVG (vendored, quite
// detailed) plus a muscle-overlay SVG via dangerouslySetInnerHTML. That's
// cheap for one icon, but the picker lists ~200 exercises, and rendering
// ~200 of them synchronously on every modal open was the actual cause of
// the multi-second freeze when "Add Exercise" opened (not the network
// fetch — that's cached separately, see databaseService.getExerciseLibrary).
// This wrapper defers the expensive SVG mount until the row has actually
// scrolled near the visible area, so the initial paint only pays for the
// dozen or so rows on screen instead of the whole list.
function LazyMuscleIcon({ rootRef, muscle, color, size }) {
  const wrapperRef = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return undefined;
    const el = wrapperRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some(e => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { root: rootRef?.current || null, rootMargin: '300px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootRef]);

  return (
    <div ref={wrapperRef} style={{ width: size, height: size }}>
      {inView && <MuscleThumbnail muscle={muscle} color={color} size={size} />}
    </div>
  );
}

// Shared Hevy-style "Add Exercise" modal used by both the client (WorkoutTracker)
// and the coach (TrainerDashboard). Stays open after each add so several
// exercises can be added in a row; tapping an added item removes it. Styling
// comes from WorkoutTracker.css, which both parents import.

// How long the slide-down-out animation runs (must match
// .exercise-modal-slide-out's animation-duration in WorkoutTracker.css) —
// the modal stays mounted for this long after `open` goes false so the
// close animation actually gets to play instead of the card just vanishing.
const CLOSE_ANIM_MS = 240;

export default function ExercisePickerModal({ open, onClose, addedNames = [], onAdd, onRemove, onShowFormGuide }) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('All');
  const [exercises, setExercises] = useState([]);
  // Mirrors `open` but lags behind on close, so the slide-down animation has
  // something to animate before the modal actually leaves the DOM. `closing`
  // drives which animation class is applied.
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const listRef = useRef(null);
  const closeTimerRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (open) {
      clearTimeout(closeTimerRef.current);
      setClosing(false);
      setMounted(true);
      // The modal never fully unmounts between closes while `open` is
      // false-but-still-animating, so query/tag would otherwise carry over
      // from the last time it was open — reset them fresh on every open.
      setQuery('');
      setTag('All');
      databaseService.getExerciseLibrary()
        .then(setExercises)
        .catch(err => console.error('Failed to fetch exercises in picker modal:', err));
    } else {
      setClosing(true);
      closeTimerRef.current = setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, CLOSE_ANIM_MS);
    }
    return () => clearTimeout(closeTimerRef.current);
  }, [open]);

  if (!mounted) return null;

  // Merge, don't choose one-or-the-other: the DB-backed `exercises` table
  // used to fully replace EXERCISE_LIBRARY whenever it had any rows (which
  // is effectively always), so any exercise added only to the static
  // library — like a brand new one just shipped in code — silently never
  // appeared here, even though it existed and the client could search for
  // it by exact name and only get a "Create custom exercise" prompt. DB
  // entries win on a name collision (richer video/guide data), but a
  // static-only entry now always still shows up.
  const dbNames = new Set(exercises.map(e => (e.name || '').toLowerCase()));
  const activeLibrary = [...exercises, ...EXERCISE_LIBRARY.filter(e => !dbNames.has(e.name.toLowerCase()))];
  const addedSet = new Set(addedNames.map(n => (n || '').toLowerCase()));
  const trimmed = query.trim();
  const q = trimmed.toLowerCase();

  // Rank each exercise against the query rather than just filtering, so an
  // exact/prefix match on the name (e.g. "Bench Press" for "bench") always
  // beats a mid-string hit, and a mid-string hit on the name always beats a
  // match that only came from category/primary_muscle (e.g. "chest" or
  // "biceps" pulling in every exercise in that muscle group). Rank 3 keeps
  // that muscle/category search working without letting it drown out actual
  // name matches.
  const rankExercise = (ex) => {
    if (!q) return 0;
    const nameLower = ex.name.toLowerCase();
    if (nameLower === q) return 0;
    if (nameLower.startsWith(q)) return 1;
    if (nameLower.includes(q)) return 2;
    const category = (ex.category || '').toLowerCase();
    const muscle = (ex.primary_muscle || ex.primary || '').toLowerCase();
    if (category.includes(q) || muscle.includes(q)) return 3;
    return -1;
  };

  const filtered = activeLibrary
    .map(ex => ({ ex, rank: rankExercise(ex) }))
    .filter(({ ex, rank }) => {
      const matchesSearch = rank !== -1;
      const matchesCategory = tag === 'All' || ex.category === tag;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => a.rank - b.rank || a.ex.name.localeCompare(b.ex.name))
    .map(({ ex }) => ex);
  const exactExists = activeLibrary.some(e => e.name.toLowerCase() === trimmed.toLowerCase());

  return (
    <div className={`payment-gateway-backdrop exercise-modal-backdrop ${closing ? 'closing' : ''}`}>
      <div className={`payment-gateway-modal exercise-modal-card ${closing ? 'exercise-modal-slide-out' : 'exercise-modal-slide-in'}`}>
        <div className="exercise-modal-header">
          <button type="button" className="btn-close-modal" onClick={onClose}>✕</button>
          <div className="exercise-modal-title-group">
            <h3 className="exercise-modal-title">Add Exercise</h3>
            <span className="exercise-modal-count">
              {addedNames.length} exercise{addedNames.length !== 1 ? 's' : ''} added
            </span>
          </div>
          <button type="button" className="btn-exercise-modal-done" onClick={onClose}>Done</button>
        </div>

        <div className="payment-input-group exercise-search-box exercise-search-box-wrap">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search by name, muscle, or category..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="exercise-search-input"
          />
          {query && (
            <button
              type="button"
              className="exercise-search-clear-btn"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                searchInputRef.current?.focus();
              }}
            >
              ✕
            </button>
          )}
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

        <div className="exercise-presets-list" ref={listRef}>
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
              const primaryMuscle = getMuscleGroupsForExercise(ex.name)[0];
              return (
                <div key={ex.name} className="exercise-preset-item">
                  <button
                    type="button"
                    className="preset-icon-btn"
                    title={`How to perform ${ex.name}`}
                    style={{ '--status-color': '#60a5fa' }}
                    onClick={(e) => { e.stopPropagation(); onShowFormGuide?.(ex.name); }}
                  >
                    {primaryMuscle ? (
                      <LazyMuscleIcon rootRef={listRef} muscle={primaryMuscle} color="#60a5fa" size={38} />
                    ) : (
                      <div className="preset-icon-monogram" aria-hidden="true">
                        {ex.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </button>
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
      </div>
    </div>
  );
}
