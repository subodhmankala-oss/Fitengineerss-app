import React from 'react';
import { MUSCLE_BODY_VIEW, MUSCLE_TO_PPLC } from '../../utils/muscleGroups';
import {
  BODY_FRONT_SVG, BODY_BACK_SVG, FRONT_MUSCLE_LAYERS, BACK_MUSCLE_LAYERS,
  MUSCLE_CROP, BODY_FRONT_FILL_URL, BODY_BACK_FILL_URL, FACE_MASK, FACE_MASK_GRADIENT,
  SCALP_MASK, SCALP_MASK_GRADIENT, recolorSvg
} from './muscleBodyShapes';

// Same featureless-face patch as the full heat map (MuscleHeatMap.jsx) — see
// FACE_MASK there for why. Front-view crops (Chest, Shoulders, Biceps, Core,
// Forearms) and the full-body thumbnail all include the head, so they'd
// otherwise show the same hollow-eyed vendored face, just more zoomed in.
const FaceMaskLayer = ({ gradientId }) => (
  <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className="muscle-thumb-layer">
    <defs>
      <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={FACE_MASK_GRADIENT.center} stopOpacity="1" />
        <stop offset="70%" stopColor={FACE_MASK_GRADIENT.mid} stopOpacity="1" />
        <stop offset="100%" stopColor={FACE_MASK_GRADIENT.edge} stopOpacity="0" />
      </radialGradient>
    </defs>
    <ellipse cx={FACE_MASK.cx} cy={FACE_MASK.cy} rx={FACE_MASK.rx} ry={FACE_MASK.ry} fill={`url(#${gradientId})`} />
  </svg>
);

// Same scalp-dim wash as the full heat map — see SCALP_MASK there for why.
// Only the "Back" crop (Latissimus dorsi + Trapezius) includes the head.
const ScalpMaskLayer = ({ gradientId }) => (
  <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} className="muscle-thumb-layer">
    <defs>
      <radialGradient id={gradientId} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={SCALP_MASK_GRADIENT.center} />
        <stop offset="70%" stopColor={SCALP_MASK_GRADIENT.mid} />
        <stop offset="100%" stopColor={SCALP_MASK_GRADIENT.edge} />
      </radialGradient>
    </defs>
    <ellipse cx={SCALP_MASK.cx} cy={SCALP_MASK.cy} rx={SCALP_MASK.rx} ry={SCALP_MASK.ry} fill={`url(#${gradientId})`} />
  </svg>
);

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
        <img
          src={view === 'front' ? BODY_FRONT_FILL_URL : BODY_BACK_FILL_URL}
          alt=""
          className="muscle-thumb-layer"
        />

        <div className="muscle-thumb-layer" dangerouslySetInnerHTML={{ __html: bodySvg }} />

        {view === 'front' && <FaceMaskLayer gradientId={`thumbFace-${muscle}`} />}
        {view === 'back' && <ScalpMaskLayer gradientId={`thumbScalp-${muscle}`} />}

        {rawFiles.map((rawSvg, i) => (
          <div key={i} className="muscle-thumb-layer" dangerouslySetInnerHTML={{ __html: recolorSvg(rawSvg, color, false) }} />
        ))}
      </div>
    </div>
  );
});

// Bounding box (shared 200×369 canvas) covering every one of `muscles` —
// the union of their individual MUSCLE_CROP windows. Used to zoom
// MultiMuscleThumbnail into just the trained region (upper body for a
// Push/Pull day, legs for a Legs day) instead of shrinking the whole
// standing figure down to icon size, which left the actually-trained area
// too small to read. A genuine full-body plan's muscles span top to bottom,
// so its union naturally comes out close to the full canvas anyway.
function unionMuscleCrop(muscles) {
  const boxes = muscles.map(m => MUSCLE_CROP[m]).filter(Boolean);
  if (boxes.length === 0) return { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
  const x0 = Math.min(...boxes.map(b => b.x));
  const y0 = Math.min(...boxes.map(b => b.y));
  const x1 = Math.max(...boxes.map(b => b.x + b.w));
  const y1 = Math.max(...boxes.map(b => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Multi-muscle icon for a routine card that trains more than one muscle
 * group (a Push/Pull/Legs/Upper-Body split, or a literal Full Body plan) —
 * MuscleThumbnail's crop only fits a single muscle, and the whole-body
 * silhouette by itself misrepresents a split day since it can only zoom out.
 * This zooms into the union of every trained muscle's own crop window
 * instead (tight around the torso for a Push/Pull day, around the legs for
 * a Legs day, close to the whole figure for a genuine full-body plan), each
 * one tinted by its own Push/Pull/Legs/Core color (same family as the
 * card's muscle chips below it) so it reads as "these areas trained", not
 * one flat color.
 *
 * The union box isn't always square, so it's fit (not stretched) into the
 * square icon — letterboxed on whichever axis has room to spare, same as a
 * photo thumbnail — rather than distorting the artwork to fill the box.
 *
 * `view` picks front or back — a muscle only visible on the other view (see
 * MUSCLE_BODY_VIEW) has no layer in this view's map and is skipped, both for
 * tinting and for the crop union, so callers should pick whichever view
 * covers more of `trainedMuscles` (see getPlanCardMeta's view logic in
 * WorkoutTracker.jsx) rather than defaulting to front — a Pull or Legs day
 * is mostly back-visible muscles and would render almost empty on front.
 */
export const FullBodyThumbnail = ({ trainedMuscles = [], view = 'front', size = 64 }) => {
  const isFront = view !== 'back';
  const trainedSet = new Set(trainedMuscles);
  const layers = isFront ? FRONT_MUSCLE_LAYERS : BACK_MUSCLE_LAYERS;
  const visibleMuscles = trainedMuscles.filter(m => layers[m]);

  const crop = unionMuscleCrop(visibleMuscles);
  const scale = Math.min(size / crop.w, size / crop.h);
  const offsetX = (size - crop.w * scale) / 2;
  const offsetY = (size - crop.h * scale) / 2;

  return (
    <div className="muscle-thumb" style={{ width: size, height: size }} aria-hidden="true">
      <div
        className="muscle-thumb-canvas"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale}) translate(${-crop.x}px, ${-crop.y}px)`,
          transformOrigin: 'top left',
        }}
      >
        <img src={isFront ? BODY_FRONT_FILL_URL : BODY_BACK_FILL_URL} alt="" className="muscle-thumb-layer" />

        <div className="muscle-thumb-layer" dangerouslySetInnerHTML={{ __html: isFront ? BODY_FRONT_SVG : BODY_BACK_SVG }} />

        {isFront
          ? <FaceMaskLayer gradientId="thumbFace-fullbody" />
          : <ScalpMaskLayer gradientId="thumbScalp-fullbody" />}

        {Object.entries(layers)
          .filter(([muscle]) => trainedSet.has(muscle))
          .flatMap(([muscle, rawFiles]) =>
            rawFiles.map((rawSvg, i) => (
              <div
                key={`${muscle}-${i}`}
                className="muscle-thumb-layer"
                dangerouslySetInnerHTML={{ __html: recolorSvg(rawSvg, FULL_BODY_PPLC_COLOR[MUSCLE_TO_PPLC[muscle]] || 'var(--primary-accent-light)', false) }}
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
const FULL_BODY_PPLC_COLOR = { Push: '#ef4444', Pull: '#3b82f6', Legs: 'var(--primary-accent-light)', Core: '#a855f7' };

export default MuscleThumbnail;
