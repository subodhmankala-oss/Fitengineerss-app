import { writeFileSync } from 'fs';
import { join } from 'path';

// Back-view overlays wger's asset set lacks: the posterior deltoid (shoulder
// cap), the infraspinatus / teres major+minor block between the delt, the
// trapezius overlay (muscle-9) and the lats overlay (muscle-12), and the
// inner hamstrings.
// Points are the figure's right side (image left), traced against the
// rendered body-back.svg on a labelled grid in the shared 200x369 display
// space; the artwork is symmetric about x=100 so the other side is mirrored.
// Hand-traced by the coach in the browser tracer (scratch tool) over the
// lightened back artwork; covers the full shoulder cap down to the triceps.
const REAR_DELT = [
  [44.8, 102.8],
  [51.3, 96.8],
  [60.8, 90.8],
  [66.5, 85.5],
  [69.5, 83.3],
  [73.3, 80],
  [76.5, 77.8],
  [75.5, 74.5],
  [74.3, 71],
  [71.3, 68.3],
  [68.3, 65.8],
  [66.3, 64.5],
  [64, 64.8],
  [58.8, 66.5],
  [53.5, 68.8],
  [50.5, 71.8],
  [47.3, 75],
  [44.8, 79.8],
  [43.5, 84.8],
  [43.5, 91],
  [43.5, 96],
];
// Hand-traced by the coach in the browser tracer, same as REAR_DELT.
const TERES = [
  [77.5, 78],
  [74.3, 79.3],
  [70.5, 82.8],
  [66.8, 85.8],
  [63.5, 89.8],
  [62, 91.8],
  [62.5, 94.5],
  [65, 96.8],
  [68, 98.8],
  [71, 100],
  [74.8, 100.5],
  [80, 99.8],
  [83.5, 99.3],
  [84.3, 97.8],
  [82.3, 92.5],
  [80.8, 86.8],
  [79.5, 81.3],
];
// Whole back of the thigh, hand-traced by the coach in the browser tracer.
// Replaces wger's muscle-11 (biceps femoris only) on the heat map.
const HAMSTRINGS = [
  [96, 196.8],
  [91.5, 198],
  [85, 202],
  [81.8, 204.8],
  [75.5, 209.8],
  [70.5, 213.8],
  [67.5, 217.8],
  [66, 222.8],
  [66, 227.8],
  [67.3, 236.3],
  [69.3, 243.8],
  [72.5, 252.3],
  [73.5, 255.3],
  [74.3, 267.8],
  [74.3, 271.8],
  [78.3, 268.8],
  [79.5, 264.3],
  [81.5, 260.5],
  [84, 262.8],
  [89.3, 262.8],
  [91, 261.3],
  [92.8, 262.8],
  [95, 266],
  [96.5, 267.5],
  [97.5, 262.8],
  [98, 254.8],
  [97.8, 244],
  [97.8, 228.8],
  [98.5, 211.8],
  [99.3, 199.8],
  [99.5, 196.3],
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
for (const [name, pts] of [['rear-delt', REAR_DELT], ['teres', TERES], ['hamstrings', HAMSTRINGS]]) {
  const out = join(outDir, `muscle-${name}.svg`);
  writeFileSync(out, file(name, pts));
  console.log('wrote', out);
}
