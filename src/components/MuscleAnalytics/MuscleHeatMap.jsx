import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MUSCLE_BODY_VIEW } from '../../utils/muscleGroups';
import { getHeatMapTier } from '../../utils/muscleAnalytics';
import { useBodySex } from './bodySex';
import { getRegionShape, clipStylePct, REGION_SHAPES } from './regionShapes';
import {
  getBodyArt, FACE_MASK, FACE_MASK_GRADIENT, SCALP_MASK, SCALP_MASK_GRADIENT, recolorSvg, LAYER_REGIONS,
  FRONT_MUSCLE_LAYERS, BACK_MUSCLE_LAYERS
} from './muscleBodyShapes';

// The un-warped overlay files, to tell which of a muscle's layers its regions
// are cut from (the female figure's layers are warped copies, so compare by
// index against these).
const MALE_LAYERS = { front: FRONT_MUSCLE_LAYERS, back: BACK_MUSCLE_LAYERS };

const LEGEND = [
  { key: 'not_trained', color: 'var(--text-subtle)', label: 'Not Trained' },
  { key: 'low', color: '#3b82f6', label: 'Low' },
  { key: 'optimal', color: 'var(--accent-text)', label: 'Optimal' },
  { key: 'high', color: '#f97316', label: 'High' },
  { key: 'very_high', color: '#ef4444', label: 'Very High' },
];

// Taps are resolved by BodyDiagram (snap to the nearest part), so a layer
// only names what it is (data-muscle / data-region / data-clip) and handles
// the keyboard itself.
const layerProps = ({ muscle, region, clip, flash, ariaLabel, onSelect }) => ({
  className: `muscle-region interactive muscle-svg-layer${flash ? ' tap-flash' : ''}`,
  style: clip ? { clipPath: clipStylePct(clip) } : undefined,
  'data-muscle': muscle,
  'data-region': region || '',
  'data-clip': clip ? clip.join(',') : undefined,
  role: 'button',
  tabIndex: 0,
  'aria-label': ariaLabel,
  onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } },
});

const MuscleLayer = ({ rawSvg, color, isActive, ...rest }) => (
  <div {...layerProps(rest)} dangerouslySetInnerHTML={{ __html: recolorSvg(rawSvg, color, isActive) }} />
);

const CANVAS_H = 369.03;
// How far from a part a tap may land and still pick it (screen px, about a
// fingertip). Searched outward in rings, so the closest part wins.
const SNAP_PX = 22;
const ZOOM_IN = 2.5;
const ZOOM_MAX = 4;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The part layer under (x, y), or the nearest one within SNAP_PX. Uses the
// browser's own hit-testing, so clip windows and exact shapes count.
function findPartAt(root, x, y) {
  for (let r = 0; r <= SNAP_PX; r += 3) {
    const steps = r === 0 ? 1 : 16;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * 2 * Math.PI;
      const el = document.elementFromPoint(x + r * Math.cos(a), y + r * Math.sin(a));
      const layer = el?.closest?.('.muscle-region.interactive');
      if (layer && root.contains(layer)) return layer;
    }
  }
  return null;
}

// Where to put each part's name when zoomed in: the middle of its biggest
// visible piece (one side of a left/right pair), as fractions of the figure.
// Measured from the drawn paths, so it works for every overlay, clip window
// and the female warp alike — and at any zoom, since the stack scales evenly.
function measureAnchors(stack) {
  const box = stack.getBoundingClientRect();
  if (!box.width) return [];
  const best = new Map();
  stack.querySelectorAll('.muscle-region.interactive').forEach(layer => {
    const { muscle, region, clip } = layer.dataset;
    const c = clip ? clip.split(',').map(Number) : null;
    layer.querySelectorAll('path').forEach(p => {
      const r = p.getBoundingClientRect();
      let x0 = (r.left - box.left) / box.width, x1 = (r.right - box.left) / box.width;
      let y0 = (r.top - box.top) / box.height, y1 = (r.bottom - box.top) / box.height;
      if (c) {
        x0 = Math.max(x0, c[0] / 200); x1 = Math.min(x1, c[2] / 200);
        y0 = Math.max(y0, c[1] / CANVAS_H); y1 = Math.min(y1, c[3] / CANVAS_H);
      }
      if (x1 <= x0 || y1 <= y0) return;
      const key = `${muscle}|${region}`;
      if (!best.has(key)) best.set(key, { key, label: region || muscle, area: 0, pieces: [] });
      const a = best.get(key);
      a.pieces.push({ x0, y0, x1, y1, area: (x1 - x0) * (y1 - y0) });
      a.area = Math.max(a.area, (x1 - x0) * (y1 - y0));
    });
  });
  // Spots to try, best first: the middle of each piece (biggest piece
  // first), then a quarter up / down it — so a name crowded out of one spot
  // (Inner vs Outer Hamstring side by side) can still find room.
  return [...best.values()].map(({ pieces, ...a }) => {
    pieces.sort((p, q) => q.area - p.area);
    const spot = (p, f) => ({ cx: (p.x0 + p.x1) / 2, cy: p.y0 + (p.y1 - p.y0) * f });
    return { ...a, spots: [...pieces.map(p => spot(p, 0.5)), ...pieces.flatMap(p => [spot(p, 0.25), spot(p, 0.75)])] };
  }).sort((a, b) => b.area - a.area);
}

// Also used by the Add Exercise picker's body filter, which has no weekly
// stats: it passes colorFor/labelFor to color and label muscles itself.
// Male or female figure per the viewed client's profile sex (useBodySex).
// regionSplit: { Back: { Lats: tier, Trapezius: tier, ... }, Glutes: {...} }
// draws each listed muscle as its separate regions (regionShapes.js), each in
// its own heat-map color and each opening the muscle with that region picked
// out, instead of one block in the whole muscle's color. Regions that can't
// be seen (Deep Core, under the abs) are left off (`hiddenOnMap`).
//
// Tapping: a tap picks the part under the finger or, failing that, the
// nearest one within a fingertip (SNAP_PX), which flashes before it opens.
// `zoomable` (the heat map) adds touch zoom: the first tap zooms in around
// that spot with every part named, a second tap opens a part; drag pans,
// pinch zooms, "Whole body" / a tap off the body zooms back out. A mouse
// click skips the zoom step. Remount (key) per view to reset the zoom.
export const BodyDiagram = ({ view, statByMuscle = {}, activeMuscle, onSelectMuscle, colorFor, labelFor, regionSplit = null, zoomable = false }) => {
  const sex = useBodySex();
  const { bodySvg, fillUrl: bodyFillUrl, layers: layerMap, underlayUrl, bodyMaskStyle } = getBodyArt(sex)[view];

  const viewportRef = useRef(null);
  const stackRef = useRef(null);
  const [flash, setFlash] = useState(null); // "muscle|region" just tapped
  const [zoom, setZoom] = useState(null); // { s, ox, oy } — scale + origin as fractions
  const [gesturing, setGesturing] = useState(false);
  const [anchors, setAnchors] = useState(null); // { list, W, H }
  const g = useRef({ pointers: new Map(), moved: false, type: 'mouse', start: null, pinch: null });
  const flashTimer = useRef(null);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // Part names for the zoomed view, measured once the layers are drawn.
  const zoomed = Boolean(zoom);
  useEffect(() => {
    if (!zoomable || !zoomed) return undefined;
    const t = setTimeout(() => {
      if (!stackRef.current || !viewportRef.current) return;
      const { width, height } = viewportRef.current.getBoundingClientRect();
      setAnchors({ list: measureAnchors(stackRef.current), W: width, H: height });
    }, 0);
    return () => clearTimeout(t);
  }, [zoomable, zoomed, regionSplit, sex, view]);

  const pick = (layer) => {
    const { muscle, region } = layer.dataset;
    setFlash(`${muscle}|${region}`);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => { setFlash(null); onSelectMuscle(muscle, region || null); }, 160);
  };

  const fraction = (x, y) => {
    const r = viewportRef.current.getBoundingClientRect();
    return { fx: clamp((x - r.left) / r.width, 0, 1), fy: clamp((y - r.top) / r.height, 0, 1), w: r.width, h: r.height };
  };

  const onClick = (e) => {
    if (g.current.moved) { g.current.moved = false; return; }
    if (zoomable && !zoom && g.current.type !== 'mouse') {
      const { fx, fy } = fraction(e.clientX, e.clientY);
      setZoom({ s: ZOOM_IN, ox: fx, oy: fy });
      return;
    }
    const direct = e.target.closest?.('.muscle-region.interactive');
    const layer = direct || findPartAt(stackRef.current, e.clientX, e.clientY);
    if (layer) pick(layer);
    else if (zoom) setZoom(null);
  };

  const onPointerDown = (e) => {
    const s = g.current;
    s.type = e.pointerType || 'mouse';
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!zoomable) return;
    const z = zoom;
    if (s.pointers.size === 1) {
      s.moved = false;
      s.start = { x: e.clientX, y: e.clientY, ox: z?.ox ?? 0.5, oy: z?.oy ?? 0.5 };
    } else if (s.pointers.size === 2) {
      const [a, b] = [...s.pointers.values()];
      const mid = fraction((a.x + b.x) / 2, (a.y + b.y) / 2);
      s.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: z?.s ?? 1, ox: z ? z.ox : mid.fx, oy: z ? z.oy : mid.fy };
    }
  };

  const onPointerMove = (e) => {
    const s = g.current;
    if (!zoomable || !s.pointers.has(e.pointerId)) return;
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (s.pointers.size === 2 && s.pinch) {
      const [a, b] = [...s.pointers.values()];
      const scale = clamp(s.pinch.s * (Math.hypot(a.x - b.x, a.y - b.y) / s.pinch.dist), 1, ZOOM_MAX);
      s.moved = true;
      setGesturing(true);
      setZoom({ s: scale, ox: s.pinch.ox, oy: s.pinch.oy });
    } else if (s.pointers.size === 1 && zoom && s.start) {
      const dx = e.clientX - s.start.x, dy = e.clientY - s.start.y;
      if (!s.moved && Math.hypot(dx, dy) < 6) return;
      const z = zoom;
      const { w, h } = fraction(e.clientX, e.clientY);
      s.moved = true;
      setGesturing(true);
      setZoom({ s: z.s, ox: clamp(s.start.ox - dx / (w * (z.s - 1)), 0, 1), oy: clamp(s.start.oy - dy / (h * (z.s - 1)), 0, 1) });
    }
  };

  const onPointerUp = (e) => {
    const s = g.current;
    s.pointers.delete(e.pointerId);
    if (!zoomable) return;
    if (s.pointers.size === 1) {
      // Pinch → one finger left: carry on as a pan from where it is now.
      const [p] = [...s.pointers.values()];
      const z = zoom;
      s.pinch = null;
      s.start = { x: p.x, y: p.y, ox: z?.ox ?? 0.5, oy: z?.oy ?? 0.5 };
    } else if (s.pointers.size === 0) {
      s.pinch = null;
      setGesturing(false);
      if (zoom && zoom.s < 1.15) setZoom(null);
    }
  };

  // Each part's name goes in the first of its spots that is in view and
  // clear of the names already placed (bigger parts first); a name with no
  // room is left off. Sizes are in figure fractions at the current zoom.
  const labels = [];
  if (zoom && anchors?.W) {
    const { W, H } = anchors;
    const fx = px => px / (zoom.s * W), fy = px => px / (zoom.s * H);
    // The part of the figure in view (scaling about the origin), so a name
    // near the edge is nudged inside instead of cut off.
    const vis = [zoom.ox - zoom.ox / zoom.s, zoom.oy - zoom.oy / zoom.s, zoom.ox + (1 - zoom.ox) / zoom.s, zoom.oy + (1 - zoom.oy) / zoom.s];
    const overlaps = (b, l) => b[0] < l[2] && l[0] < b[2] && b[1] < l[3] && l[1] < b[3];
    // Keep clear of the "Whole body" button (top-left, ~120×40 px).
    const taken = [[vis[0], vis[1], vis[0] + fx(124), vis[1] + fy(42)]];
    anchors.list.forEach(a => {
      const w = fx(a.label.length * 6 + 12), h = fy(18);
      for (const s of a.spots) {
        if (s.cx < vis[0] || s.cx > vis[2] || s.cy < vis[1] || s.cy > vis[3]) continue;
        const cx = clamp(s.cx, vis[0] + w / 2, vis[2] - w / 2), cy = clamp(s.cy, vis[1] + h / 2, vis[3] - h / 2);
        const box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
        if (taken.some(t => overlaps(box, t))) continue;
        taken.push(box);
        labels.push({ key: a.key, label: a.label, cx, cy });
        break;
      }
    });
  }

  const stack = (
    <div
      ref={stackRef}
      className={`muscle-body-stack${zoomable ? ' zoomable' : ''}${gesturing ? ' gesturing' : ''}`}
      style={zoom ? { transform: `scale(${zoom.s})`, transformOrigin: `${zoom.ox * 100}% ${zoom.oy * 100}%` } : undefined}
      onClick={zoomable ? undefined : onClick}
      onPointerDown={zoomable ? undefined : onPointerDown}
      onPointerUp={zoomable ? undefined : onPointerUp}
      onPointerCancel={zoomable ? undefined : onPointerUp}
    >
      {/* Behind the body: fills the artwork's gaps (see BODY_FRONT_FILL_URL
          in muscleBodyShapes.js) so they read as pale skin instead of the
          dark card showing through. Masked by the body artwork itself, same
          as the SVG layers below it. */}
      <img src={bodyFillUrl} alt="" className="muscle-svg-layer" aria-hidden="true" style={bodyMaskStyle ?? undefined} />

      <div className="muscle-svg-layer" style={bodyMaskStyle ?? undefined} dangerouslySetInnerHTML={{ __html: bodySvg }} />

      {/* Featureless-face patch (front view only) — see FACE_MASK in
          muscleBodyShapes.js for why the vendored face is masked instead of
          shown as-is. Sits on TOP of the body, unlike the hole-patch layer
          above, and never intercepts taps (aria-hidden, no click handler). */}
      {view === 'front' && (
        <svg viewBox="0 0 200 369.03" className="muscle-svg-layer" aria-hidden="true" focusable="false">
          <defs>
            <radialGradient id="faceMask" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={FACE_MASK_GRADIENT.center} stopOpacity="1" />
              <stop offset="65%" stopColor={FACE_MASK_GRADIENT.mid} stopOpacity="1" />
              <stop offset="100%" stopColor={FACE_MASK_GRADIENT.edge} stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse
            cx={FACE_MASK.cx} cy={FACE_MASK.cy} rx={FACE_MASK.rx} ry={FACE_MASK.ry}
            fill="url(#faceMask)"
          />
        </svg>
      )}

      {/* Scalp dim (back view only) — see SCALP_MASK in muscleBodyShapes.js.
          A translucent wash, not a color swap, so it dims the real painted
          highlight AND the gap-fill beneath it together without needing to
          tell those two apart. */}
      {view === 'back' && (
        <svg viewBox="0 0 200 369.03" className="muscle-svg-layer" aria-hidden="true" focusable="false">
          <defs>
            <radialGradient id="scalpMask" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={SCALP_MASK_GRADIENT.center} />
              <stop offset="70%" stopColor={SCALP_MASK_GRADIENT.mid} />
              <stop offset="100%" stopColor={SCALP_MASK_GRADIENT.edge} />
            </radialGradient>
          </defs>
          <ellipse
            cx={SCALP_MASK.cx} cy={SCALP_MASK.cy} rx={SCALP_MASK.rx} ry={SCALP_MASK.ry}
            fill="url(#scalpMask)"
          />
        </svg>
      )}

      {/* Female figure, front only: the bust (soft shading), beneath the
          muscle overlays so a colored Chest still sits on top of it. */}
      {underlayUrl && <img src={underlayUrl} alt="" className="muscle-svg-layer" aria-hidden="true" />}

      {Object.entries(layerMap).map(([muscle, rawFiles]) => {
        const split = regionSplit?.[muscle];
        if (split) {
          // Overlays no region is cut from (Biceps' brachialis) still show,
          // in the whole muscle's color, under the regions.
          const covered = new Set(Object.keys(split).flatMap(r => (REGION_SHAPES[r]?.parts || []).map(p => p.raw)));
          const stat = statByMuscle[muscle];
          const tier = stat ? getHeatMapTier(stat) : null;
          const rest = rawFiles.flatMap((rawSvg, i) => (covered.has(MALE_LAYERS[view][muscle]?.[i]) ? [] : [
            <MuscleLayer key={`${muscle}-${i}`} rawSvg={rawSvg} color={tier?.color ?? '#64748b'} isActive={muscle === activeMuscle}
              muscle={muscle} flash={flash === `${muscle}|`} onSelect={() => onSelectMuscle(muscle)} ariaLabel={`${muscle}: ${tier?.label ?? 'Not Trained'}`} />,
          ]));
          return rest.concat(Object.entries(split).flatMap(([region, regionTier]) => {
            const shape = getRegionShape(region, sex);
            if (!shape || shape.view !== view || shape.hiddenOnMap) return [];
            const color = regionTier?.color ?? '#64748b';
            const select = () => onSelectMuscle(muscle, region);
            const label = `${muscle}, ${region}: ${regionTier?.label ?? 'Not Trained'}`;
            const isFlash = flash === `${muscle}|${region}`;
            const layers = (shape.parts || []).map((part, i) => (
              <MuscleLayer key={`${region}-${i}`} rawSvg={part.raw} clip={part.clip} color={color} isActive={muscle === activeMuscle}
                muscle={muscle} region={region} flash={isFlash} onSelect={select} ariaLabel={label} />
            ));
            if (shape.paths) {
              layers.push(
                // Wrapped like MuscleLayer: the CSS only lets paths INSIDE an
                // .interactive layer take taps.
                <div key={`${region}-paths`} {...layerProps({ muscle, region, flash: isFlash, ariaLabel: label, onSelect: select })}>
                  <svg viewBox="0 0 200 369.03">
                    {shape.paths.map((d, i) => (
                      <path key={i} d={d} fill={color} stroke="#0f1420" strokeWidth={muscle === activeMuscle ? 1.6 : 0.8} strokeOpacity="0.9" />
                    ))}
                  </svg>
                </div>
              );
            }
            return layers;
          }));
        }
        const stat = statByMuscle[muscle];
        const tier = stat ? getHeatMapTier(stat) : null;
        const isActive = muscle === activeMuscle;
        const label = labelFor ? labelFor(muscle) : `${muscle}: ${tier?.label ?? 'Not Trained'}, ${stat?.sets ?? 0} sets this week`;
        return rawFiles.map((rawSvg, i) => {
          const region = LAYER_REGIONS[view]?.[muscle]?.[i] ?? null;
          return (
            <MuscleLayer
              key={`${muscle}-${i}`}
              rawSvg={rawSvg}
              color={colorFor ? colorFor(muscle) : (tier?.color ?? '#64748b')}
              isActive={isActive}
              muscle={muscle}
              region={region}
              flash={flash === `${muscle}|${region || ''}`}
              onSelect={() => onSelectMuscle(muscle, region)}
              ariaLabel={label}
            />
          );
        });
      })}

      {labels.map(l => (
        <span
          key={l.key}
          className="body-part-label"
          style={{ left: `${l.cx * 100}%`, top: `${l.cy * 100}%`, transform: `translate(-50%, -50%) scale(${1 / zoom.s})` }}
          aria-hidden="true"
        >
          {l.label}
        </span>
      ))}
    </div>
  );

  if (!zoomable) return stack;
  return (
    <div
      ref={viewportRef}
      className={`muscle-body-viewport${zoom ? ' zoomed' : ''}`}
      style={{ touchAction: zoom ? 'none' : 'pan-y' }}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {stack}
      {zoom && (
        <button
          type="button"
          className="muscle-body-zoom-out"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); setZoom(null); }}
        >
          ← Whole body
        </button>
      )}
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
const MuscleHeatMap = ({ muscleStats, onSelectMuscle, activeMuscle, regionSplit = null }) => {
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
        <p className="muscle-analytics-subtext" style={{ margin: 0 }}>Tap the body to zoom in, then tap a part for its detail. Pinch or drag to move around.</p>
        <div className="heatmap-view-toggle">
          <button type="button" className={view === 'front' ? 'active' : ''} onClick={() => setView('front')}>Front</button>
          <button type="button" className={view === 'back' ? 'active' : ''} onClick={() => setView('back')}>Back</button>
        </div>
      </div>

      <div className="muscle-body-wrapper">
        <BodyDiagram key={view} view={view} statByMuscle={statByMuscle} activeMuscle={activeMuscle} onSelectMuscle={onSelectMuscle} regionSplit={regionSplit} zoomable />
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
