import React, { useEffect, useRef, useState } from 'react';
import { RegionThumbnail } from './MuscleThumbnail';
import '../exerciseRecChips.css';

// One plain sentence telling the client where this part stands and what to
// do, plus its tone: 'todo' (below range), 'good' (in range), 'over'.
function action(r) {
  const { sets, band } = r;
  if (!band) return null;
  const range = `${band.min}–${band.max}`;
  if (sets === 0) return { tone: 'todo', icon: '🎯', text: `Not trained this week. Do ${range} sets.` };
  if (sets < band.min) {
    const more = band.min - sets;
    return { tone: 'todo', icon: '🎯', text: `Only ${sets} set${sets === 1 ? '' : 's'} so far. Do ${more} more to reach ${band.min}.` };
  }
  if (sets <= band.max) return { tone: 'good', icon: '✅', text: `${sets} sets — right in the ${range} range. Nice work!` };
  return { tone: 'over', icon: '⚠️', text: `${sets} sets — more than needed (aim for ${range}). Ease off and let it recover.` };
}

// An untrained part is a to-do here, not a dead row: violet (matching the 🎯
// action box) instead of the heat map's grey, which also hid which part of
// the body the icon shows. Violet, not amber: amber washed over the dark card
// read as brown, and it's clear of every heat-map color.
const UNTRAINED_COLOR = '#a78bfa';

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
        {regions.map((r, idx) => {
          const isOpen = open === r.id;
          const color = r.sets === 0 && r.band ? UNTRAINED_COLOR : (r.tier?.color ?? '#64748b');
          const act = action(r);
          // Bar scale runs a bit past the band's top so "over" visibly overflows it.
          const scaleMax = r.band ? Math.max(r.band.max + 2, r.sets) : 1;
          const pct = v => `${Math.min(100, (v / scaleMax) * 100)}%`;
          const showSuggestions = r.suggestions.length > 0 && r.band && r.sets < r.band.min;
          return (
            <div
              key={r.id}
              ref={r.id === focusRegion ? focusRef : undefined}
              className={`detail-region-row${isOpen ? ' open' : ''}${r.id === focusRegion ? ' focused' : ''}`}
              style={{ '--status-color': color, '--row-delay': `${idx * 60}ms` }}
            >
              <button type="button" className="detail-region-head" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}>
                {r.id !== 'Other' && (
                  <span className="detail-region-icon">
                    <RegionThumbnail region={r.id} color={color} size={44} />
                  </span>
                )}
                <span className="detail-region-main">
                  <span className="detail-region-top">
                    <span className="detail-region-name">{r.id}</span>
                    {r.tier && <span className="detail-region-pill">{r.tier.label}</span>}
                  </span>
                  {r.band && (
                    <span className="detail-region-bar" aria-hidden="true">
                      <span className="detail-region-bar-band" style={{ left: pct(r.band.min), width: `calc(${pct(r.band.max)} - ${pct(r.band.min)})` }} />
                      <span className="detail-region-bar-fill" style={{ width: pct(r.sets) }} />
                    </span>
                  )}
                  <span className="detail-region-sets">
                    <strong>{r.sets}</strong> {r.sets === 1 ? 'set' : 'sets'}{r.band ? ` · target ${r.band.min}–${r.band.max}` : ''}
                  </span>
                </span>
                <span className={`detail-region-chevron${isOpen ? ' open' : ''}`} aria-hidden="true">›</span>
              </button>
              {isOpen && (
                <div className="detail-region-body">
                  <p className="detail-region-explain">{r.hint}</p>
                  {act && <p className={`detail-region-action detail-region-action--${act.tone}`}><span>{act.icon}</span>{act.text}</p>}
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
