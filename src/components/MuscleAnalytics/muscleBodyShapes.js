// ─── MUSCLE BODY DIAGRAM ASSETS ───
// Section 2 heat map artwork. See assets/SOURCES.md for full provenance —
// in short: body-front.svg / body-back.svg / muscle-N.svg are vendored from
// the wger open-source project (themselves adapted from a Wikimedia Commons
// illustration by Termininja), CC BY-SA 3.0. Each muscle-N.svg is a real,
// separately-colorable overlay that sits on the shared base body — no
// reverse-engineering needed, wger already built it as an overlay set.
//
// One gap: wger has no dedicated "Forearms" file, so that region is a small
// hand-drawn patch (same technique as the rest of this app's original
// hand-drawn body) layered on top of the same vendored base.

import bodyFrontRaw from './assets/body-front.svg?raw';
import bodyBackRaw from './assets/body-back.svg?raw';
import muscle1Raw from './assets/muscle-1.svg?raw';   // Biceps brachii
import muscle2Raw from './assets/muscle-2.svg?raw';   // Anterior deltoid
import muscle4Raw from './assets/muscle-4.svg?raw';   // Pectoralis major
import muscle5Raw from './assets/muscle-5.svg?raw';   // Triceps brachii
import muscle6Raw from './assets/muscle-6.svg?raw';   // Rectus abdominis
import muscle7Raw from './assets/muscle-7.svg?raw';   // Gastrocnemius
import muscle8Raw from './assets/muscle-8.svg?raw';   // Gluteus maximus
import muscle9Raw from './assets/muscle-9.svg?raw';   // Trapezius
import muscle10Raw from './assets/muscle-10.svg?raw'; // Quadriceps femoris
import muscle11Raw from './assets/muscle-11.svg?raw'; // Biceps femoris
import muscle12Raw from './assets/muscle-12.svg?raw'; // Latissimus dorsi
import muscle13Raw from './assets/muscle-13.svg?raw'; // Brachialis
import muscle14Raw from './assets/muscle-14.svg?raw'; // Obliquus externus abdominis
import forearmRaw from './assets/muscle-forearm.svg?raw'; // Forearms (generated — see below)

// ── Body tone ──
// The vendored artwork is a dark greyscale ramp (front: #303030→#cfcfcf,
// back: #191919→#d5d5d5). On this app's dark card that reads as a near-black
// figure — the face especially, whose features use the darkest tones and
// merge into one dark mass at phone size.
//
// This rescales every grey fill from the file's own range into a bright band,
// so the figure reads as pale near-white muscle with grey shading (and the
// artwork's transparent gaps reading as the dark separations between muscle
// groups — the artwork was drawn for a light background, so those gaps are
// its line work).
//
// A per-file LEVELS remap rather than a fixed gamma curve, for two reasons:
// the two files have different input ranges (front starts at 48, back at 25),
// so normalising each into the same output band keeps the two views
// consistent — a gamma curve left the back view's darkest tone at 116, still
// murky, while the front's floor was 145. It also keeps brighter highlights
// (252 vs gamma's 238) for the near-white look.
//
// Applied once at module load (not per render) to the raw SVG text; the
// vendored files themselves stay untouched on disk.
const BODY_TONE_OUT_MIN = 152; // darkest shading
const BODY_TONE_OUT_MAX = 252; // brightest highlight

function lightenGreys(svgText, outMin = BODY_TONE_OUT_MIN, outMax = BODY_TONE_OUT_MAX) {
  const GREY_FILL = /fill:#([0-9a-fA-F]{6})/g;
  // Only neutral greys are touched — never the muscle-overlay placeholder red
  // or any other hue that might exist in the artwork.
  const isGrey = hex => {
    const r = parseInt(hex.slice(0, 2), 16);
    return r === parseInt(hex.slice(2, 4), 16) && r === parseInt(hex.slice(4, 6), 16);
  };

  const greys = [...svgText.matchAll(GREY_FILL)]
    .map(m => m[1]).filter(isGrey)
    .map(hex => parseInt(hex.slice(0, 2), 16));
  if (greys.length === 0) return svgText;

  const inMin = Math.min(...greys);
  const inMax = Math.max(...greys);
  const span = inMax - inMin;

  return svgText.replace(GREY_FILL, (match, hex) => {
    if (!isGrey(hex)) return match;
    const v = parseInt(hex.slice(0, 2), 16);
    const scaled = span === 0
      ? outMax
      : Math.round(outMin + ((v - inMin) / span) * (outMax - outMin));
    const h = Math.max(0, Math.min(255, scaled)).toString(16).padStart(2, '0');
    return `fill:#${h}${h}${h}`;
  });
}

export const BODY_FRONT_SVG = lightenGreys(bodyFrontRaw);
export const BODY_BACK_SVG = lightenGreys(bodyBackRaw);

// ── Hole patches ──
// The artwork was drawn for a LIGHT background: its muscle-definition lines
// are transparent GAPS, not dark strokes. On this app's dark card most of
// those gaps still read fine as fine linework, but the large ones down the
// body's centreline read as solid black blobs — the sternum/chest gap on the
// front, and the back of the head plus the neck on the back view.
//
// One rect per view, rendered BEHIND the body: the artwork itself masks it,
// so only the parts showing through an actual gap are ever visible. That
// means a plain rectangle suffices and can never distort the silhouette.
//
// Each rect was derived from the artwork, not guessed: interior holes were
// found by flood-filling transparency from the canvas border (so gaps that
// connect to the outside — between fingers, under the arms — are correctly
// excluded), then the widest span around the centreline containing zero
// "outside" pixels was measured per row and merged. The result was verified
// pixel-by-pixel to contain 0 outside pixels with a 1-unit safety inset, so
// no edge can poke past the figure. Coordinates are the shared 200x369 canvas.
export const HOLE_PATCHES = {
  front: [{ x: 85.5, y: 9, width: 25.5, height: 120.5 }],
  back: [{ x: 87, y: 9, width: 28, height: 110.5 }],
};

// Vertical gradient rather than a flat tone, with stops taken from the actual
// mean body luminance measured behind each rect (top third → bottom third) so
// the fill blends with whatever it sits behind:
//   front  173 → 189 → 230   (head/neck is shaded; abs are bright)
//   back   231 → 226 → 217   (fairly even, easing off slightly downward)
// Note the front runs DARK-to-LIGHT downward — the opposite of the intuitive
// "pale head, shadowed torso" guess, which is why these are measured.
export const HOLE_PATCH_GRADIENT = {
  front: { top: '#adadad', bottom: '#e6e6e6' },
  back: { top: '#e7e7e7', bottom: '#d9d9d9' },
};

// Every source file uses this same placeholder fill — swapped for the live
// heat-tier color at render time (see recolorSvg below).
export const SOURCE_FILL_PLACEHOLDER = '#fc0000';

// Swaps the vendored SVG's placeholder red fill for a live color, and
// (when isActive) adds a white outline — done as a string substitution
// rather than parsing/rebuilding the SVG, so the original file's
// structure/alignment is never touched. Shared by the full heat map
// (MuscleHeatMap.jsx) and the small per-muscle icon (MuscleThumbnail.jsx).
//
// Pure function of (rawSvg, color, isActive), so the result is cached —
// MuscleThumbnail is rendered dozens/hundreds of times per screen (the full
// exercise picker list, muscle balance cards, etc.) and those screens sit
// under components that re-render on a 1s/100ms timer tick (workout
// stopwatch, rest timer), which used to re-run this string split/join over
// every visible muscle SVG on every single tick — real main-thread work,
// felt as UI/video stutter while a live session timer was running. Same
// (rawSvg, color, isActive) triple always produces the same string, so a
// tiny cache turns every repeat call into an O(1) lookup instead.
const recolorCache = new Map();
export function recolorSvg(rawSvg, color, isActive) {
  const cacheKey = color + '|' + isActive;
  let byColor = recolorCache.get(rawSvg);
  if (!byColor) {
    byColor = new Map();
    recolorCache.set(rawSvg, byColor);
  } else if (byColor.has(cacheKey)) {
    return byColor.get(cacheKey);
  }
  let svg = rawSvg.split(SOURCE_FILL_PLACEHOLDER).join(color);
  if (isActive) {
    svg = svg.split('stroke:none').join('stroke:#ffffff;stroke-width:2.5;stroke-opacity:0.95');
  }
  byColor.set(cacheKey, svg);
  return svg;
}

// Crop window (shared 200×369 canvas, same as HOLE_PATCHES) used to render
// each muscle as a small zoomed-in body icon (MuscleThumbnail) instead of a
// tiny full-body diagram or a plain text badge. Each rect is centered on the
// real measured bounding box of that muscle's overlay path(s) — via
// SVGGraphicsElement.getBBox() on every vendored file — padded to 2.2x the
// muscle's largest dimension so the icon reads as recognisable anatomy (arm,
// torso, leg) rather than a tight, unrecognisable sliver, then clamped to
// stay inside the canvas (and capped at 195 wide, just short of the full
// 200-unit body width). Combined muscles (Biceps, Core, Back) use the union
// of their files' boxes.
export const MUSCLE_CROP = {
  Chest: { x: 10.04, y: 0, w: 177.32, h: 177.32 },
  Shoulders: { x: 1.1, y: 0, w: 195, h: 195 },
  Biceps: { x: 0.65, y: 14.85, w: 195, h: 195 },
  Triceps: { x: 2.4, y: 14.5, w: 195, h: 195 },
  Forearms: { x: 1.3, y: 59.55, w: 195, h: 195 },
  Core: { x: 24.3, y: 73.1, w: 149.6, h: 149.6 },
  Glutes: { x: 12.35, y: 109.5, w: 174.9, h: 174.9 },
  Quads: { x: 21.36, y: 139.31, w: 155.98, h: 155.98 },
  Hamstrings: { x: 29.26, y: 170.26, w: 141.68, h: 141.68 },
  Calves: { x: 2.85, y: 174, w: 195, h: 195 },
  Back: { x: 2.5, y: 0, w: 195, h: 195 },
};

// Which vendored file(s) render for each of this app's 11 muscle groups,
// per view. Back/Core/Biceps combine two wger muscles (e.g. Back = lats +
// trapezius) for better anatomical coverage than a single region would give.
export const FRONT_MUSCLE_LAYERS = {
  Shoulders: [muscle2Raw],
  Chest: [muscle4Raw],
  Biceps: [muscle1Raw, muscle13Raw],
  Core: [muscle6Raw, muscle14Raw],
  Forearms: [forearmRaw],
  Quads: [muscle10Raw],
};

export const BACK_MUSCLE_LAYERS = {
  Back: [muscle12Raw, muscle9Raw],
  Triceps: [muscle5Raw],
  Glutes: [muscle8Raw],
  Hamstrings: [muscle11Raw],
  Calves: [muscle7Raw],
};

// NOTE ON FOREARMS: wger's asset set has no forearm/brachioradialis file.
// Rather than hand-drawing an approximate shape (an earlier attempt looked
// obviously wrong against the detailed artwork), muscle-forearm.svg is
// GENERATED from the body artwork itself: the arm silhouette was traced by
// sampling body-front.svg's rendered pixels row by row, then inset by the
// same proportions the sibling biceps overlay uses against that same
// silhouette. It ships in the identical file format/style as the vendored
// overlays, so it recolors and aligns exactly like them.
// Regenerate with: node tools/gen-forearm-overlay.mjs <output-path>
