import { writeFileSync } from 'fs';
import { join } from 'path';

// Two back-view overlays wger's asset set lacks: the posterior deltoid
// (shoulder cap) and the infraspinatus / teres major+minor block between the
// delt, the trapezius overlay (muscle-9) and the lats overlay (muscle-12).
// Points are the figure's right side (image left), traced against the
// rendered body-back.svg on a labelled grid in the shared 200x369 display
// space; the artwork is symmetric about x=100 so the other side is mirrored.
const REAR_DELT = [
  [64, 70], [58, 66.5], [51, 66], [45, 68.5], [41, 74], [39.5, 82], [40, 90],
  [43, 95.5], [49, 97], [55, 96], [60, 91], [63, 84], [65, 77],
];
const TERES = [
  [66, 76], [70, 72], [75, 74], [80, 84], [84, 95], [82, 101], [72, 102],
  [63, 100], [58, 96.5], [61, 91], [64, 84],
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
for (const [name, pts] of [['rear-delt', REAR_DELT], ['teres', TERES]]) {
  const out = join(outDir, `muscle-${name}.svg`);
  writeFileSync(out, file(name, pts));
  console.log('wrote', out);
}
