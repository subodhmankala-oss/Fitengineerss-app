import { writeFileSync } from 'fs';
import { join } from 'path';

// Back-view overlays wger's asset set lacks: the posterior deltoid (shoulder
// cap), the infraspinatus / teres major+minor block between the delt, the
// trapezius overlay (muscle-9) and the lats overlay (muscle-12), and the
// inner hamstrings.
// Points are the figure's right side (image left), traced against the
// rendered body-back.svg on a labelled grid in the shared 200x369 display
// space; the artwork is symmetric about x=100 so the other side is mirrored.
// Covers the whole shoulder cap: outer edge follows the silhouette (~0.5
// inside it), top runs along the shoulder line up to where the trapezius
// overlay starts, bottom follows the delt/triceps seam.
const REAR_DELT = [
  [66, 71.5], [65.5, 68.5], [62, 67], [58, 67.4], [55.5, 69.8], [52.5, 73.3],
  [50.5, 75.6], [48.5, 78.3], [46.8, 81], [45.5, 84.3], [44.5, 87.5], [44, 91],
  [43.8, 94.5], [45, 97], [50, 97], [55, 96], [60, 91], [63, 84], [65, 77],
];
const TERES = [
  [66, 76], [70, 72], [75, 74], [80, 84], [84, 95], [82, 101], [72, 102],
  [63, 100], [58, 96.5], [61, 91], [64, 84],
];
// Semitendinosus + semimembranosus: wger's hamstring file (muscle-11) is
// biceps femoris only, so the inner two-thirds of the back of the thigh
// stayed grey. Sits between muscle-11's inner edge and the inner thigh line,
// from just below the glute overlay to just above the calf overlay.
const INNER_HAMSTRING = [
  [81, 210], [86, 207], [92, 208], [95, 215], [96, 230], [95, 245], [93, 257],
  [90, 262], [85, 263], [82, 260], [82, 250], [81, 235], [81, 222],
];

const mirror = pts => pts.map(([x, y]) => [200 - x, y]);

// Catmull-Rom → cubic bezier (same as gen-forearm-overlay.mjs) so the traced
// polygon renders as a smooth muscle edge.
function smooth(pts) {
  const n = pts.length, at = i => pts[((i % n) + n) % n];
  let d = `m ${at(0)[0].toFixed(4)},${at(0)[1].toFixed(4)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` c ${(c1[0] - p1[0]).toFixed(4)},${(c1[1] - p1[1]).toFixed(4)}` +
         ` ${(c2[0] - p1[0]).toFixed(4)},${(c2[1] - p1[1]).toFixed(4)}` +
         ` ${(p2[0] - p1[0]).toFixed(4)},${(p2[1] - p1[1]).toFixed(4)}`;
  }
  return d + ' z';
}

function file(id, pts) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg
   xmlns:svg="http://www.w3.org/2000/svg"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   width="200"
   height="369.03"
   id="svg2"
   version="1.1">
  <defs id="defs4" />
  <g
     inkscape:label="Ebene 1"
     inkscape:groupmode="layer"
     id="layer1">
    <path
       inkscape:connector-curvature="0"
       id="path-${id}-r"
       d="${smooth(pts)}"
       style="opacity:0.52424239;fill:#fc0000;fill-opacity:1;stroke:none" />
    <path
       inkscape:connector-curvature="0"
       id="path-${id}-l"
       d="${smooth(mirror(pts))}"
       style="opacity:0.52424239;fill:#fc0000;fill-opacity:1;stroke:none" />
  </g>
</svg>
`;
}

const outDir = process.argv[2];
for (const [name, pts] of [['rear-delt', REAR_DELT], ['teres', TERES], ['inner-hamstring', INNER_HAMSTRING]]) {
  const out = join(outDir, `muscle-${name}.svg`);
  writeFileSync(out, file(name, pts));
  console.log('wrote', out);
}
