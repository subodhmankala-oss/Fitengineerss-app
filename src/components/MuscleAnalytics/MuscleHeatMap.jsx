import React, { useState, useMemo } from 'react';
import { MUSCLE_BODY_VIEW } from '../../utils/muscleGroups';
import { getHeatMapTier } from '../../utils/muscleAnalytics';
import {
  BODY_FRONT_SVG, BODY_BACK_SVG, FRONT_MUSCLE_LAYERS, BACK_MUSCLE_LAYERS,
  HOLE_PATCHES, HOLE_PATCH_GRADIENT, recolorSvg
} from './muscleBodyShapes';

const LEGEND = [
  { key: 'not_trained', color: '#64748b', label: 'Not Trained' },
  { key: 'low', color: '#3b82f6', label: 'Low' },
  { key: 'optimal', color: '#10b981', label: 'Optimal' },
  { key: 'high', color: '#f97316', label: 'High' },
  { key: 'very_high', color: '#ef4444', label: 'Very High' },
];

const MuscleLayer = ({ rawSvg, color, isActive, onSelect, ariaLabel }) => (
  <div
    className="muscle-region interactive muscle-svg-layer"
    role="button"
    tabIndex={0}
    aria-label={ariaLabel}
    onClick={onSelect}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
    dangerouslySetInnerHTML={{ __html: recolorSvg(rawSvg, color, isActive) }}
  />
);

const BodyDiagram = ({ view, statByMuscle, activeMuscle, onSelectMuscle }) => {
  const bodySvg = view === 'front' ? BODY_FRONT_SVG : BODY_BACK_SVG;
  const layerMap = view === 'front' ? FRONT_MUSCLE_LAYERS : BACK_MUSCLE_LAYERS;

  return (
    <div className="muscle-body-stack">
      {/* Behind the body: fills the artwork's large centreline gaps so they
          read as pale skin / soft shadow instead of the dark card showing
          through. Masked by the body artwork itself — see HOLE_PATCHES.
          IMPORTANT: deliberately NO viewBox, matching the vendored assets —
          none of them declare one, so every layer draws at native user units
          and they align exactly. Adding a viewBox here made this layer scale
          to the container (~10% larger) while the body did not, which pushed
          the patch out past the silhouette beside the head. */}
      <svg width="200" height="369" className="muscle-svg-layer" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`holePatch-${view}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={HOLE_PATCH_GRADIENT[view].top} />
            <stop offset="100%" stopColor={HOLE_PATCH_GRADIENT[view].bottom} />
          </linearGradient>
        </defs>
        {HOLE_PATCHES[view].map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} fill={`url(#holePatch-${view})`} />
        ))}
      </svg>

      <div className="muscle-svg-layer" dangerouslySetInnerHTML={{ __html: bodySvg }} />

      {Object.entries(layerMap).map(([muscle, rawFiles]) => {
        const stat = statByMuscle[muscle];
        const tier = stat ? getHeatMapTier(stat) : null;
        const isActive = muscle === activeMuscle;
        const label = `${muscle}: ${tier?.label ?? 'Not Trained'}, ${stat?.sets ?? 0} sets this week`;
        return rawFiles.map((rawSvg, i) => (
          <MuscleLayer
            key={`${muscle}-${i}`}
            rawSvg={rawSvg}
            color={tier?.color ?? '#64748b'}
            isActive={isActive}
            onSelect={() => onSelectMuscle(muscle)}
            ariaLabel={label}
          />
        ));
      })}

    </div>
  );
};

/**
 * Section 2 — Muscle Heat Map. Body artwork is vendored from the wger
 * open-source project (see assets/SOURCES.md) — real anatomical
 * illustration with per-muscle overlay files, recolored live by this
 * week's volume tier (same classification as Section 1 — getHeatMapTier).
 * Tapping a muscle opens the Section 9 detail screen via `onSelectMuscle`.
 *
 * Content-only (no card wrapper/title) — this shares a single card with
 * the Recovery Dashboard via a tab switcher in WeeklyMuscleAnalytics.jsx,
 * so the wrapper/title live there. Keeps its own Front/Back toggle, since
 * that's a distinct, second-level switch (which side of the body), not the
 * same kind of choice as the outer Heat Map/Recovery tab.
 */
const MuscleHeatMap = ({ muscleStats, onSelectMuscle, activeMuscle }) => {
  const [view, setView] = useState('front');

  const statByMuscle = useMemo(
    () => Object.fromEntries(muscleStats.map(s => [s.muscle, s])),
    [muscleStats]
  );
  const visibleMuscles = Object.entries(MUSCLE_BODY_VIEW).filter(([, v]) => v === view).map(([m]) => m);

  return (
    <>
      <div className="muscle-status-legend">
        {LEGEND.map(l => (
          <span key={l.key} className="legend-item">
            <span className="legend-dot" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>

      <div className="widget-header justify-between" style={{ marginBottom: '4px' }}>
        <p className="muscle-analytics-subtext" style={{ margin: 0 }}>Tap any muscle for exercises, volume, and recovery detail.</p>
        <div className="heatmap-view-toggle">
          <button type="button" className={view === 'front' ? 'active' : ''} onClick={() => setView('front')}>Front</button>
          <button type="button" className={view === 'back' ? 'active' : ''} onClick={() => setView('back')}>Back</button>
        </div>
      </div>

      <div className="muscle-body-wrapper">
        <BodyDiagram view={view} statByMuscle={statByMuscle} activeMuscle={activeMuscle} onSelectMuscle={onSelectMuscle} />
      </div>

      {/* Quick-tap chips under the diagram — same regions, easier tap target
          than the small SVG shapes on a phone screen. */}
      <div className="heatmap-chip-row">
        {visibleMuscles.map(muscle => {
          const stat = statByMuscle[muscle];
          const tier = stat ? getHeatMapTier(stat) : null;
          return (
            <button
              key={muscle}
              type="button"
              className="heatmap-chip"
              style={{ '--chip-color': tier?.color }}
              onClick={() => onSelectMuscle(muscle)}
            >
              {muscle}
            </button>
          );
        })}
      </div>

      {/* CC BY-SA 3.0 attribution — required by the license on the vendored
          body/muscle illustration assets (see assets/SOURCES.md). */}
      <p className="heatmap-attribution">
        Body illustration adapted from{' '}
        <a href="https://github.com/wger-project/wger" target="_blank" rel="noopener noreferrer">wger</a>
        {' '}(Termininja, CC BY-SA 3.0)
      </p>
    </>
  );
};

export default MuscleHeatMap;
