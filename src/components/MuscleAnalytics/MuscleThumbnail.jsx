import React from 'react';
import { MUSCLE_BODY_VIEW } from '../../utils/muscleGroups';
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
const MuscleThumbnail = ({ muscle, color, size = 64 }) => {
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
};

export default MuscleThumbnail;
