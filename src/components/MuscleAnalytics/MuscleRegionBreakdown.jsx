import React, { useEffect, useRef, useState } from 'react';
import { RegionThumbnail } from './MuscleThumbnail';
import '../exerciseRecChips.css';

// One plain sentence telling the client where this part stands and what to do.
function actionText(r) {
  const { sets, band } = r;
  if (!band) return null;
  const range = `${band.min}–${band.max}`;
  if (sets === 0) return `Not trained this week. Do ${range} sets.`;
  if (sets < band.min) {
    const more = band.min - sets;
    return `Only ${sets} set${sets === 1 ? '' : 's'} so far. Do ${more} more to reach ${band.min}.`;
  }
  if (sets <= band.max) return `${sets} sets — right in the ${range} range. Nice work.`;
  return `${sets} sets — more than needed (aim for ${range}). Ease off here and let it recover.`;
}

/**
 * "Inside Back" (or Chest/Shoulders) on the muscle detail screen: each region
 * of the muscle — Lats, Trapezius, Mid Back, Rotator Cuff, Lower Back — with
 * its own heat-map status for the week. Tap a row for a plain explanation,
 * what to do, what was logged there and suggested exercises. `focusRegion`
 * (the part of the body diagram that was tapped) starts expanded,
 * highlighted and scrolled into view.
 *
 * onAddExercise (client's own view only): suggestions get a "+ Add" button
 * that queues the exercise for their workout; onGoToWorkout then offers a
 * shortcut to the logger.
 */
const MuscleRegionBreakdown = ({ muscle, regions, focusRegion = null, onAddExercise = null, onGoToWorkout = null }) => {
  const [open, setOpen] = useState(focusRegion);
  const [added, setAdded] = useState(() => new Set());
  const focusRef = useRef(null);

  useEffect(() => {
    if (!focusRegion) return undefined;
    // Wait for the sheet's slide-up so the scroll measures final layout.
    const t = setTimeout(() => focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 320);
    return () => clearTimeout(t);
  }, [focusRegion]);

  if (!regions.length) return null;

  const add = (name) => {
    onAddExercise(name);
    setAdded(prev => new Set(prev).add(name));
  };

  return (
    <div className="detail-section">
      <span className="detail-section-title">Inside {muscle}</span>
      <div className="detail-region-list">
        {regions.map(r => {
          const isOpen = open === r.id;
          const color = r.tier?.color ?? '#64748b';
          const action = actionText(r);
          const showSuggestions = r.suggestions.length > 0 && r.band && r.sets < r.band.min;
          return (
            <div
              key={r.id}
              ref={r.id === focusRegion ? focusRef : undefined}
              className={`detail-region-row${isOpen ? ' open' : ''}${r.id === focusRegion ? ' focused' : ''}`}
              style={{ '--status-color': color }}
            >
              <button type="button" className="detail-region-head" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}>
                {r.id !== 'Other' && (
                  <span className="detail-region-icon"><RegionThumbnail region={r.id} color={color} size={36} /></span>
                )}
                <span className="detail-region-name">{r.id}</span>
                {r.tier && <span className="detail-region-pill">{r.tier.label}</span>}
                <span className="detail-region-sets">
                  {r.sets}{r.band ? ` / ${r.band.min}–${r.band.max}` : ''} sets
                </span>
              </button>
              {isOpen && (
                <div className="detail-region-body">
                  <p className="detail-region-explain">{r.hint}</p>
                  {action && <p className="detail-region-action">{action}</p>}
                  <p className="detail-region-line">
                    <strong>This week:</strong>{' '}
                    {r.exercises.length > 0 ? r.exercises.map(e => `${e.name} (${e.sets} set${e.sets === 1 ? '' : 's'})`).join(', ') : 'nothing logged yet'}
                  </p>
                  {/* Same chips as the logger's exercise history sheet
                      (ExerciseHistoryModal's "Same muscle, try these"). */}
                  {showSuggestions && (
                    <div className="detail-region-recs">
                      <div className="detail-region-recs-title">
                        💡 Try these{onAddExercise ? ' — tap to add to your workout' : ''}
                      </div>
                      <div className="detail-region-chips">
                        {r.suggestions.map(name => {
                          if (!onAddExercise) return <span key={name} className="ex-history-rec-chip">{name}</span>;
                          const isAdded = added.has(name);
                          return (
                            <button
                              key={name}
                              type="button"
                              className={`ex-history-rec-chip ex-history-rec-chip--tap ${isAdded ? 'ex-history-rec-chip--added' : ''}`}
                              disabled={isAdded}
                              onClick={() => add(name)}
                            >
                              {isAdded ? '✓' : '+'} {name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {added.size > 0 && onGoToWorkout && (
        <button type="button" className="detail-region-go" onClick={onGoToWorkout}>
          {added.size} added — go to my workout →
        </button>
      )}
    </div>
  );
};

export default MuscleRegionBreakdown;
