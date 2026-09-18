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
import muscle12Raw from './assets/muscle-12.svg?raw'; // Latissimus dorsi
import muscle13Raw from './assets/muscle-13.svg?raw'; // Brachialis
import muscle14Raw from './assets/muscle-14.svg?raw'; // Obliquus externus abdominis
import forearmRaw from './assets/muscle-forearm.svg?raw'; // Forearms (generated — see below)
import rearDeltRaw from './assets/muscle-rear-delt.svg?raw'; // Posterior deltoid (generated — see below)
import teresRaw from './assets/muscle-teres.svg?raw'; // Infraspinatus / teres major+minor (generated — see below)
import hamstringsRaw from './assets/muscle-hamstrings.svg?raw'; // Whole hamstring group (generated — see below)
import bodyFrontFillUrl from './assets/body-front-fill.png'; // Gap-filled backdrop (generated — see below)
import bodyBackFillUrl from './assets/body-back-fill.png'; // Gap-filled backdrop (generated — see below)

// ── Body tone ──
// The vendored artwork is a dark greyscale ramp (front: #303030→#cfcfcf,
// back: #191919→#d5d5d5). On this app's dark card that reads as a near-black
// figure — the face especially, whose features use the darkest tones and
// merge into one dark mass at phone size.
//
// This rescales every grey fill from the file's own range into a band that
// still reads as pale muscle overall (bright highlights, outMax=252) but
// keeps real shadow depth instead of crushing everything into a narrow
// bright band — an outMin=152 first pass made every shading transition
// low-contrast, so the muscle separations (pecs, abs, deltoid) read as
// flat/washed-out instead of defined. The artwork's transparent gaps read
// as the darkest separations between muscle groups — the artwork was drawn
// for a light background, so those gaps are its line work.
//
// A per-file LEVELS remap rather than a fixed gamma curve, since the two
// files have different input ranges (front starts at 48, back at 25);
// normalising each into the same output band keeps the two views
// consistent — except the floor itself, which is NOT the same for both
// (see BODY_TONE_OUT_MIN below): front only has 7 distinct shading steps
// vendored (back has 11), so the same floor that reads as fine, smooth
// shading on the back's finer gradient reads as bigger, blockier dark
// patches on the front's coarser one — the same darkness value covers more
// visible area per step. Front's floor sits higher purely to compensate for
// having fewer steps to spread that darkness across, not because the front
// SHOULD look lighter than the back.
//
// Applied once at module load (not per render) to the raw SVG text; the
// vendored files themselves stay untouched on disk.
const BODY_TONE_OUT_MIN = { front: 130, back: 90 }; // darkest shading, per view — see comment above
const BODY_TONE_OUT_MAX = 252; // brightest highlight

function lightenGreys(svgText, outMin, outMax = BODY_TONE_OUT_MAX) {
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

export const BODY_FRONT_SVG = lightenGreys(bodyFrontRaw, BODY_TONE_OUT_MIN.front);
export const BODY_BACK_SVG = lightenGreys(bodyBackRaw, BODY_TONE_OUT_MIN.back);

// ── Gap-filled backdrop ──
// The artwork was drawn for a LIGHT background: its muscle-definition lines
// are transparent GAPS, not dark strokes. On this app's dark card, every one
// of those gaps — not just the large sternum/neck ones this used to patch
// with two fixed rects, but dozens of smaller ones across the collarbone,
// underarm, forearm, hand, knee etc. — shows the card's own dark background
// through, reading as scattered black scribbles/holes rather than skin.
//
// body-front-fill.png / body-back-fill.png are a full-body version of the
// same idea as the old two-rect patch, generalized: a solid backdrop,
// rendered BEHIND the real vendored SVG, that fills gaps at once instead of
// enumerating each one by hand. Because the real SVG still draws on top
// unchanged, this can only ever show through an actual gap — it can't
// distort the silhouette.
//
// Not every gap gets filled, though: some "gaps" are real anatomy — the
// midline groove down the back of the thigh/calf, the ab striations — thin
// natural linework that reads fine and should stay exactly as the artwork
// drew it. Only the blobby ones (the sternum/neck patch this replaces, but
// also dozens more the old two rects missed: collarbone, shoulder blade,
// palm, knee) read as broken scribbles and needed fixing. So the generator
// tells them apart by shape, not by hand-picked coordinates:
//   1. Rasterize the (already lightened) SVG to a canvas.
//   2. Flood-fill "outside" from the canvas border through transparent
//      pixels, so gaps that genuinely connect to the outside — between
//      fingers/toes, under the arms — are correctly left transparent.
//   3. Distance-transform the remaining "interior" transparent pixels
//      (distance to the nearest non-gap pixel) and connected-component them.
//      A thin line's max distance stays low regardless of length; a blobby
//      hole's grows with its width. Threshold: 4px at the 3x working
//      resolution (~1.3 native units radius) — only components that reach
//      it anywhere get filled; thin ones are left fully alone rather than
//      partially chewed into.
//   4. Fill eligible interior pixels with the color of their nearest real
//      painted neighbour (multi-source flood fill), so each gap blends into
//      its own local shading instead of one flat tone for the whole body.
//
// Regenerate (no CLI tool — needs a real browser canvas to rasterize the
// SVG): ask Claude to re-run the gap-fill script against the current
// body-front.svg/body-back.svg and replace these two files.
export const BODY_FRONT_FILL_URL = bodyFrontFillUrl;
export const BODY_BACK_FILL_URL = bodyBackFillUrl;

// ── Face ──
// The vendored artwork draws real facial anatomy (eyes, nose, mouth,
// wrinkles) meant for a life-size muscular-system poster. At this app's
// scale, and after lightenGreys() above brightens the rest of the body, the
// eye/nose shading — the darkest tones in the source file — reads as hollow
// black sockets rather than a shaded face, which is unsettling rather than
// "realistic". The face carries no muscle data (Section 2 is a heat map,
// not a portrait), so this app follows the same convention most fitness/
// anatomy apps use: a smooth, featureless head.
//
// Rendered as its own layer ON TOP of the body (unlike the gap-fill backdrop
// below, which sits behind it) — a soft-edged ellipse over just the eyes/nose/mouth,
// leaving the hairline, ears, jaw outline and neck shading untouched so the
// head still reads as a real head, just without the features that looked
// wrong. The edge fades out via the gradient's own alpha stops (radial,
// opaque center → transparent rim) rather than a blur filter, so it renders
// identically across browsers at small sizes. Colors are sampled from this
// same region's own lightened forehead/cheek tone, not guessed, so the
// patch matches its surroundings instead of sitting on top as a flat sticker.
export const FACE_MASK = { cx: 98, cy: 29, rx: 16.5, ry: 20 };
export const FACE_MASK_GRADIENT = { center: '#d8d8d8', mid: '#c7c7c7', edge: '#c7c7c7' };

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

// Crop window (shared 200×369 canvas) used to render
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
  Back: [muscle12Raw, muscle9Raw, teresRaw],
  Shoulders: [rearDeltRaw],
  Triceps: [muscle5Raw],
  Glutes: [muscle8Raw],
  Hamstrings: [hamstringsRaw],
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
//
// NOTE ON REAR DELT / TERES: wger also has no posterior-deltoid or teres
// major/minor/infraspinatus files, which left the shoulder caps and the
// block between traps and lats permanently grey on the back view. Both are
// traced from body-back.svg on a labelled grid and mirrored about x=100.
// Rear delt feeds Shoulders (so Shoulders now renders on both views, unlike
// the one-view rule in MUSCLE_BODY_VIEW, which only drives the chip row);
// teres feeds Back alongside lats + traps. Hamstrings likewise uses a
// traced whole-thigh shape (muscle-hamstrings.svg) instead of wger's
// muscle-11, which is biceps femoris only and left the inner hamstrings grey.
// Regenerate with: node tools/gen-back-shoulder-overlays.mjs <assets-dir>
