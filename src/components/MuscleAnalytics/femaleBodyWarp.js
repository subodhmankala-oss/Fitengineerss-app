// The smooth reshaping that turns the vendored (male) body artwork into the
// female figure used by the Weekly Muscle Analytics heat map when a client's
// profile sex is "female". getBodyArt() in muscleBodyShapes.js applies it to
// the body and every muscle overlay at runtime (via svgWarp.js); see
// assets/SOURCES.md for provenance.
//
// One warp per view, mapping a point of the 200×369.03 canvas to its new
// position. It works row by row (a function of y) around the body's centre
// line:
//   - torso points (|x − c| below the torso/arm boundary T(y)) are scaled
//     about the centre by a(y): smaller head and jaw, narrower neck,
//     shoulders, ribcage and waist, wider hips and upper thighs;
//   - arm points (beyond T(y)) are carried along with the torso edge and made
//     a little slimmer (ARM_SCALE), so arms stay attached and keep their gap;
//   - the slope between the two is blended over ±BLEND units, so the
//     mapping is smooth and strictly increasing (no fold-overs).
// Front view only: a soft downward bulge under each pec rounds the chest.
//
// Pure functions of (x, y). The female gap-fill PNGs (body-*-fill-female.png)
// were made by pushing the male ones through femaleWarpInverse() below in a
// browser canvas (bilinear sampling), so raster and vector stay registered.
// Change any number here and those two PNGs must be regenerated the same way.

const lerpKnots = (knots, y) => {
  if (y <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [y1, v1] = knots[i];
    if (y <= y1) {
      const [y0, v0] = knots[i - 1];
      const t = (y - y0) / (y1 - y0);
      const s = t * t * (3 - 2 * t); // smoothstep between knots — no kinks
      return v0 + (v1 - v0) * s;
    }
  }
  return knots[knots.length - 1][1];
};

// Body scale a(y). Shared by both views (same proportions front and back).
// The head is a little narrower too, more so at the jaw (softer, smaller chin).
const TORSO_SCALE = [
  [0, 0.93], [28, 0.92], [42, 0.85], [52, 0.86], [62, 0.86], [72, 0.83], [112, 0.84], [128, 0.82],
  [146, 0.79], [162, 0.9], [180, 1.08], [198, 1.11], [222, 1.07], [252, 1.01], [272, 1],
];

// Torso/arm boundary T(y), measured from each view's rendered silhouette
// (the gap between the arm and the trunk). Above the armpit and below the
// fingertips nothing is "arm", so T is pushed past the body's edge there.
const ARM_BOUNDARY = {
  front: [[70, 80], [86, 37], [120, 34.5], [150, 32.5], [180, 37], [215, 37], [238, 80]],
  back: [[70, 80], [86, 39], [125, 35], [150, 34], [180, 38], [225, 38], [245, 80]],
};
const CENTER_X = { front: 99.3, back: 100 };
const ARM_SCALE = 0.86;
const BLEND = 4;

// ∫0^r slope(u) du, where slope blends from a (torso) to ARM_SCALE (arm)
// across [T − BLEND, T + BLEND] with a smoothstep; integrated in closed form.
function radial(r, a, T) {
  const lo = T - BLEND, hi = T + BLEND;
  if (r <= lo) return a * r;
  // ∫ smoothstep over [lo, x]: with t = (u − lo)/(2·BLEND), ∫ (3t² − 2t³) du
  const S = x => { const t = Math.min(1, (x - lo) / (hi - lo)); return (hi - lo) * (t ** 3 - t ** 4 / 2); };
  const upto = Math.min(r, hi);
  const blended = a * (upto - lo) + (ARM_SCALE - a) * S(upto);
  return a * lo + blended + (r > hi ? ARM_SCALE * (r - hi) : 0);
}

// Soft downward bulge under each pec (front view only).
const BUST = [{ x: -17.5 }, { x: 17.5 }].map(b => ({ ...b, y: 100, rx: 16, ry: 19, dy: 11 }));
function bustDy(r, y) {
  let dy = 0;
  for (const b of BUST) {
    const d2 = ((r - b.x) / b.rx) ** 2 + ((y - b.y) / b.ry) ** 2;
    if (d2 < 1) dy += b.dy * (1 - d2) ** 2;
  }
  return dy;
}

export function femaleWarp(view) {
  const c = CENTER_X[view], tKnots = ARM_BOUNDARY[view];
  return ([x, y]) => {
    const r = x - c;
    const a = lerpKnots(TORSO_SCALE, y);
    const T = lerpKnots(tKnots, y);
    const nr = Math.sign(r) * radial(Math.abs(r), a, T);
    // The bulge is placed in the already-narrowed chest, so look it up there.
    const dy = view === 'front' ? bustDy(nr, y) : 0;
    return [c + nr, y + dy];
  };
}

// Numeric inverse (for raster warping: output pixel → source pixel). The
// warp is a small, smooth displacement, so fixed-point iteration converges
// in a handful of steps.
export function femaleWarpInverse(view) {
  const w = femaleWarp(view);
  return ([qx, qy]) => {
    let px = qx, py = qy;
    for (let i = 0; i < 12; i++) {
      const [wx, wy] = w([px, py]);
      px += qx - wx; py += qy - wy;
    }
    return [px, py];
  };
}
