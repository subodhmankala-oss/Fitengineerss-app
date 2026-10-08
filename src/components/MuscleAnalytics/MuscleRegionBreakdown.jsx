import React, { useEffect, useRef, useState } from 'react';
import { RegionThumbnail } from './MuscleThumbnail';

/**
 * "Inside Back" (or Chest/Shoulders) on the muscle detail screen: each region
 * of the muscle — Lats, Trapezius, Mid Back, Rotator Cuff, Lower Back — with
 * its own heat-map status for the week. Tap a row for what was logged there
 * and what to add. `focusRegion` (the part of the body diagram that was
 * tapped) starts expanded, highlighted and scrolled into view.
 */
const MuscleRegionBreakdown = ({ muscle, regions, focusRegion = null }) => {
  const [open, setOpen] = useState(focusRegion);
  const focusRef = useRef(null);

  useEffect(() => {
    if (!focusRegion) return undefined;
    // Wait for the sheet's slide-up so the scroll measures final layout.
    const t = setTimeout(() => focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 320);
    return () => clearTimeout(t);
  }, [focusRegion]);

  if (!regions.length) return null;

  return (
    <div className="detail-section">
      <span className="detail-section-title">Inside {muscle}</span>
      <div className="detail-region-list">
        {regions.map(r => {
          const isOpen = open === r.id;
          const color = r.tier?.color ?? '#64748b';
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
                  <p className="detail-region-hint">{r.hint}</p>
                  {r.exercises.length > 0 ? (
                    <p className="detail-region-line">
                      <strong>This week:</strong> {r.exercises.map(e => `${e.name} (${e.sets})`).join(', ')}
                    </p>
                  ) : (
                    <p className="detail-region-line">Nothing logged here this week.</p>
                  )}
                  {r.suggestions.length > 0 && r.band && r.sets < r.band.min && (
                    <p className="detail-region-line">
                      <strong>Add {r.band.min - r.sets} set{r.band.min - r.sets === 1 ? '' : 's'}:</strong> {r.suggestions.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MuscleRegionBreakdown;
