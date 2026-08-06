import React from 'react';
import { MUSCLE_BODY_VIEW, MUSCLE_TO_PPLC } from '../../utils/muscleGroups';
import {
  BODY_FRONT_SVG, BODY_BACK_SVG, FRONT_MUSCLE_LAYERS, BACK_MUSCLE_LAYERS,
  MUSCLE_CROP, HOLE_PATCHES, HOLE_PATCH_GRADIENT, recolorSvg
} from './muscleBodyShapes';

const CANVAS_W = 200, CANVAS_H = 369;

/**
 * Small zoomed-in body-diagram icon for a single muscle, used on the Muscle
 * Balance Overview cards in place of a plain "CH"/"BA"/"SH" text badge.
 * Reuses the exact same vendored body/overlay artwork as the full Section 2
 * heat map — just cropped to MUSCLE_CROP's pre-measured window and scaled up
 * so the muscle reads clearly at icon size, instead of shrinking the whole
 * body into a few pixels. Read-only (no click handler) — the card itself is
 * the tap target.
 */
const MuscleThumbnail = React.memo(function MuscleThumbnail({ muscle, color, size = 64 }) {
  const view = MUSCLE_BODY_VIEW[muscle];
  const crop = MUSCLE_CROP[muscle];
  if (!view || !crop) return null;

  const bodySvg = view === 'front' ? BODY_FRONT_SVG : BODY_BACK_SVG;
  const rawFiles = (view === 'front' ? FRONT_MUSCLE_LAYERS : BACK_MUSCLE_LAYERS)[muscle] || [];
  const scale = size / crop.w;

  return (
    <div className="muscle-thumb" style={{ width: size, height: size }} aria-hidden="true">
      {/* The canvas itself stays at native 200×369 size (so its child SVGs'
          own width:100%/height:100% is a no-op, same as the full heat map) —
          the crop/zoom is a real CSS transform, not a resize. A no-viewBox
          SVG stretched via CSS width/height does NOT rescale its content; it
          only resizes+clips the viewport at native (1 unit = 1px) scale, so
          resizing this div directly (the original approach) left the actual
          artwork rendering off-frame at native size instead of zoomed in —
          confirmed via getBoundingClientRect showing content still ~200px
          wide inside a ~90px box. transform: scale()+translate() properly
          scales the already-correctly-rendered native content as a unit. */}
      <div
        className="muscle-thumb-canvas"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `scale(${scale}) translate(${-crop.x}px, ${-crop.y}px)`,
        }}
      >
        <svg width={CANVAS_W} height={CANVAS_H} className="muscle-thumb-layer">
          <defs>
            <linearGradient id={`thumbHolePatch-${muscle}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={HOLE_PATCH_GRADIENT[view].top} />
              <stop offset="100%" stopColor={HOLE_PATCH_GRADIENT[view].bottom} />
            </linearGradient>
          </defs>
          {HOLE_PATCHES[view].map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} fill={`url(#thumbHolePatch-${muscle})`} />
          ))}
        </svg>

        <div className="muscle-thumb-layer" dangerouslySetInnerHTML={{ __html: bodySvg }} />

        {rawFiles.map((rawSvg, i) => (
          <div key={i} className="muscle-thumb-layer" dangerouslySetInnerHTML={{ __html: recolorSvg(rawSvg, color, false) }} />
        ))}
      </div>
    </div>
  );
});

/**
 * Whole-body icon for a routine card that trains many different muscle
 * groups (e.g. a plan literally named "Full Body ..." or one whose
 * exercises span 3+ Push/Pull/Legs/Core categories) — MuscleThumbnail's
 * tight single-muscle crop misrepresents those as "just a chest day" since
 * it can only zoom into one region. This shows the uncropped front-view
 * silhouette instead, with every trained front-visible muscle tinted by its
 * own Push/Pull/Legs/Core color (same family as the card's muscle chips
 * below it) so it reads as "several areas trained", not one flat color.
 * Muscles only visible from the back (Back, Triceps, Glutes, Hamstrings,
 * Calves — see MUSCLE_BODY_VIEW) can't be shown at this icon size; the
 * front view alone is enough to signal "full body" here.
 */
export const FullBodyThumbnail = ({ trainedMuscles = [], size = 64 }) => {
  const scale = size / CANVAS_H; // fit the full height into the square box
  const offsetX = (size - CANVAS_W * scale) / 2;
  const trainedSet = new Set(trainedMuscles);

  return (
    <div className="muscle-thumb" style={{ width: size, height: size }} aria-hidden="true">
      <div
        className="muscle-thumb-canvas"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `translate(${offsetX}px, 0px) scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <svg width={CANVAS_W} height={CANVAS_H} className="muscle-thumb-layer">
          <defs>
            <linearGradient id="thumbHolePatch-fullbody" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={HOLE_PATCH_GRADIENT.front.top} />
              <stop offset="100%" stopColor={HOLE_PATCH_GRADIENT.front.bottom} />
            </linearGradient>
          </defs>
          {HOLE_PATCHES.front.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} fill="url(#thumbHolePatch-fullbody)" />
          ))}
        </svg>

        <div className="muscle-thumb-layer" dangerouslySetInnerHTML={{ __html: BODY_FRONT_SVG }} />

        {Object.entries(FRONT_MUSCLE_LAYERS)
          .filter(([muscle]) => trainedSet.has(muscle))
          .flatMap(([muscle, rawFiles]) =>
            rawFiles.map((rawSvg, i) => (
              <div
                key={`${muscle}-${i}`}
                className="muscle-thumb-layer"
                dangerouslySetInnerHTML={{ __html: recolorSvg(rawSvg, FULL_BODY_PPLC_COLOR[MUSCLE_TO_PPLC[muscle]] || '#10b981', false) }}
              />
            ))
          )}
      </div>
    </div>
  );
};

// Same Push/Pull/Legs/Core palette PlanCard uses for its muscle chips — kept
// local (not imported from WorkoutTracker.jsx) to avoid a circular import;
// this is a fixed design-system mapping, not client-specific state.
const FULL_BODY_PPLC_COLOR = { Push: '#ef4444', Pull: '#3b82f6', Legs: '#10b981', Core: '#a855f7' };

export default MuscleThumbnail;
