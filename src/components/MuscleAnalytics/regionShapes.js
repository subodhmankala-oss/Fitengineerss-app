// ─── SUB-GROUP REGION SHAPES ───
// How each Add Exercise sub-group (Upper Chest, Mid Back, Biceps Long Head,
// Tibialis… — see src/data/exerciseSubgroups.js) is drawn on the same
// 200×369 body artwork as the heat map.
//
// The vendored overlays are whole muscles (one pec, one trapezius), so most
// regions are a CLIPPED overlay: `clip` is the [x0, y0, x1, y1] window of the
// overlay to keep (e.g. the top band of the pec = Upper Chest; the outer
// half of each biceps = Long Head). A region can list the same overlay twice
// with two clips — one per arm. Muscles the artwork doesn't have at all
// (erector spinae, adductors, tibialis anterior) are hand-drawn `paths`.
//
// `box` is the highlighted area itself; RegionThumbnail zooms to it. Bounds
// were measured from the overlay files' rendered geometry (2026-10-07).

import muscle1Raw from './assets/muscle-1.svg?raw';   // Biceps brachii
import muscle2Raw from './assets/muscle-2.svg?raw';   // Anterior deltoid
import muscle4Raw from './assets/muscle-4.svg?raw';   // Pectoralis major
import muscle5Raw from './assets/muscle-5.svg?raw';   // Triceps brachii
import muscle6Raw from './assets/muscle-6.svg?raw';   // Rectus abdominis
import muscle7Raw from './assets/muscle-7.svg?raw';   // Gastrocnemius
import muscle8Raw from './assets/muscle-8.svg?raw';   // Gluteus maximus
import muscle9Raw from './assets/muscle-9.svg?raw';   // Trapezius
import quadsRaw from './assets/muscle-quads-traced.svg?raw'; // Quadriceps (hand-traced)
import muscle12Raw from './assets/muscle-12.svg?raw'; // Latissimus dorsi
import muscle14Raw from './assets/muscle-14.svg?raw'; // Obliquus externus abdominis
import forearmRaw from './assets/muscle-forearm-traced.svg?raw';
import rearDeltRaw from './assets/muscle-rear-delt.svg?raw';
import teresRaw from './assets/muscle-teres.svg?raw';
import hamstringsRaw from './assets/muscle-hamstrings.svg?raw';
import tibialisRaw from './assets/muscle-tibialis.svg?raw';

// Pec spans y 68–102: thirds-ish, upper band a little deeper (clavicular head).
const PEC_X = [55, 142];
const pecBand = (y0, y1) => [{ raw: muscle4Raw, clip: [PEC_X[0], y0, PEC_X[1], y1] }];

// Arms: biceps at x 46.7–62.2 / 134.6–150.1 (front); triceps at 44–63 /
// 136.9–155.9 (back). "Outer" = away from the body's midline.
const BICEPS_OUTER = [[44, 90, 54.5, 133], [142.3, 90, 153, 133]];
const BICEPS_INNER = [[54.5, 90, 64, 133], [132, 90, 142.3, 133]];
const TRICEPS_INNER = [[53.5, 90, 65, 134], [135, 90, 146.4, 134]];
const TRICEPS_OUTER = [[41, 90, 53.5, 134], [146.4, 90, 159, 134]];
const clipped = (raw, clips) => clips.map(clip => ({ raw, clip }));

export const REGION_SHAPES = {
  'Upper Chest': { view: 'front', parts: pecBand(66, 79), box: [58, 67, 139, 79] },
  'Mid Chest': { view: 'front', parts: pecBand(79, 89), box: [58, 79, 139, 89] },
  'Lower Chest': { view: 'front', parts: pecBand(89, 104), box: [58, 89, 139, 102] },

  Lats: { view: 'back', parts: [{ raw: muscle12Raw }], box: [63, 97, 137, 148] },
  // Trapezius runs y 43–116: the neck/shoulder part is the upper traps; the
  // part between the shoulder blades (plus teres/infraspinatus) is where the
  // rhomboids and middle/lower traps sit.
  'Upper Back': { view: 'back', parts: [{ raw: muscle9Raw, clip: [60, 40, 140, 76] }], box: [66, 43, 135, 76] },
  'Mid Back': { view: 'back', parts: [{ raw: muscle9Raw, clip: [60, 76, 140, 117] }, { raw: teresRaw }], box: [62, 76, 138, 117] },
  // Erector spinae: two columns either side of the lumbar spine.
  'Lower Back': {
    view: 'back',
    paths: ['M94.5,119 C90,125 90,155 94.5,161 C98.5,155 98.5,125 94.5,119 Z', 'M105.5,119 C101.5,125 101.5,155 105.5,161 C110,155 110,125 105.5,119 Z'],
    box: [88, 118, 112, 162],
  },

  'Front Delts': { view: 'front', parts: [{ raw: muscle2Raw }], box: [49, 66, 148, 98] },
  // Outer edge of the deltoid cap, seen from the front.
  'Side Delts': { view: 'front', parts: clipped(muscle2Raw, [[45, 60, 59, 100], [138, 60, 152, 100]]), box: [45, 64, 152, 99] },
  'Rear Delts': { view: 'back', parts: [{ raw: rearDeltRaw }], box: [43, 64, 157, 103] },

  'Biceps Long Head': { view: 'front', parts: clipped(muscle1Raw, BICEPS_OUTER), box: [44, 94, 153, 131] },
  'Biceps Short Head': { view: 'front', parts: clipped(muscle1Raw, BICEPS_INNER), box: [44, 94, 153, 131] },
  'Triceps Long Head': { view: 'back', parts: clipped(muscle5Raw, TRICEPS_INNER), box: [42, 93, 158, 131] },
  'Triceps Lateral Head': { view: 'back', parts: clipped(muscle5Raw, TRICEPS_OUTER), box: [42, 93, 158, 131] },
  Forearms: { view: 'front', parts: [{ raw: forearmRaw }], box: [25, 124, 173, 178] },

  // Rectus abdominis spans y 116–182.
  'Upper Abs': { view: 'front', parts: [{ raw: muscle6Raw, clip: [80, 114, 117, 149] }], box: [82, 116, 115, 149] },
  'Lower Abs': { view: 'front', parts: [{ raw: muscle6Raw, clip: [80, 149, 117, 184] }], box: [82, 149, 115, 182] },
  Obliques: { view: 'front', parts: [{ raw: muscle14Raw }], box: [67, 113, 131, 177] },
  'Deep Core': { view: 'front', parts: [{ raw: muscle6Raw }, { raw: muscle14Raw }], box: [67, 113, 131, 182] },

  Quads: { view: 'front', parts: [{ raw: quadsRaw }], box: [64, 174, 135, 256] },
  Hamstrings: { view: 'back', parts: [{ raw: hamstringsRaw }], box: [65, 196, 135, 272] },
  Glutes: { view: 'back', parts: [{ raw: muscle8Raw }], box: [61, 157, 138, 237] },
  // Adductors: the inner strip of each thigh, below the groin.
  'Inner Thighs': {
    view: 'front',
    paths: ['M96,190 C88,196 88,214 92,226 C95,218 98,204 99,192 Z', 'M104,190 C112,196 112,214 108,226 C105,218 102,204 101,192 Z'],
    box: [86, 188, 114, 227],
  },
  Calves: { view: 'back', parts: [{ raw: muscle7Raw }], box: [71, 261, 130, 351] },
  // Tibialis anterior: FRONT of the shin, outer edge, knee to ankle.
  Tibialis: { view: 'front', parts: [{ raw: tibialisRaw }], box: [69, 266, 132, 331] },
};

// Square zoom window around a region's box (with breathing room so the
// surrounding body shows where it is), kept inside the canvas.
export function regionCrop(region, canvasW = 200, canvasH = 369) {
  const shape = REGION_SHAPES[region];
  if (!shape) return null;
  const [x0, y0, x1, y1] = shape.box;
  const side = Math.min(canvasW, Math.max(70, Math.max(x1 - x0, y1 - y0) * 1.35));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const x = Math.max(0, Math.min(canvasW - side, cx - side / 2));
  const y = Math.max(0, Math.min(canvasH - side, cy - side / 2));
  return { x, y, w: side, h: side };
}

// CSS clip-path for a part's clip window, in the canvas's native px.
export function clipStyle(clip, canvasW = 200, canvasH = 369.03) {
  if (!clip) return undefined;
  const [x0, y0, x1, y1] = clip;
  const px = v => `${+v.toFixed(2)}px`;
  return `inset(${px(y0)} ${px(canvasW - x1)} ${px(canvasH - y1)} ${px(x0)})`;
}
