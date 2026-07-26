import { writeFileSync } from 'fs';

// Silhouette traced from the actual body-front.svg artwork pixels
// (see _forearm_trace.html): [y, outerX, innerX] in the 200x369 display space.
const LEFT = [
  [142, 33.5, 56.8], [144, 32.8, 56.0], [146, 32.0, 55.3], [148, 31.3, 54.3],
  [150, 30.8, 53.3], [152, 30.0, 52.3], [154, 29.3, 51.3], [156, 28.8, 50.0],
  [158, 28.0, 49.0], [160, 27.3, 47.8], [162, 26.5, 46.8], [164, 25.8, 45.5],
  [166, 25.0, 44.3], [168, 24.3, 43.0], [170, 23.5, 41.8], [172, 23.0, 40.5],
];
const RIGHT = [
  [142, 164.3, 141.0], [144, 165.0, 142.0], [146, 165.8, 143.0], [148, 166.5, 143.8],
  [150, 167.0, 144.8], [152, 167.8, 145.8], [154, 168.5, 146.8], [156, 169.3, 148.0],
  [158, 169.8, 149.0], [160, 170.5, 150.3], [162, 171.3, 151.3], [164, 171.8, 152.5],
  [166, 172.5, 154.0], [168, 173.3, 155.3], [170, 173.8, 157.0], [172, 174.5, 158.5],
];

// Inset ratios measured from how the sibling biceps overlay (muscle-1.svg)
// sits inside the same arm silhouette: ~27% off the outer edge, ~15% off the
// inner edge. Keeps this overlay visually consistent with its siblings.
const OUTER_R = 0.15, INNER_R = 0.10;
// Inkscape layer transform used by every wger muscle overlay.
const TX = 395.71431, TY = 323.50506;

function build(rows) {
  const outer = [], inner = [];
  for (const [y, ox, ix] of rows) {
    const w = Math.abs(ix - ox);
    const dir = Math.sign(ix - ox);         // +1 on the left arm, -1 on the right
    outer.push([ox + dir * w * OUTER_R, y]);
    inner.push([ix - dir * w * INNER_R, y]);
  }
  return [...outer, ...inner.reverse()];
}

// Catmull-Rom → cubic bezier, so the traced points render as a smooth,
// organic muscle edge rather than a faceted polygon.
function smooth(pts) {
  const n = pts.length, at = i => pts[((i % n) + n) % n];
  let d = `m ${(at(0)[0] + TX).toFixed(4)},${(at(0)[1] + TY).toFixed(4)}`;
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

// Matches the exact structure/style of the sibling wger overlay files so it
// recolors and renders identically (same placeholder fill + opacity).
const svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg
   xmlns:svg="http://www.w3.org/2000/svg"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   width="200"
   height="362"
   id="svg2"
   version="1.1">
  <defs id="defs4" />
  <g
     inkscape:label="Ebene 1"
     inkscape:groupmode="layer"
     id="layer1"
     transform="translate(-${TX},-${TY})">
    <path
       inkscape:connector-curvature="0"
       id="path-forearm-l"
       d="${smooth(build(LEFT))}"
       style="opacity:0.52424239;fill:#fc0000;fill-opacity:1;stroke:none" />
    <path
       inkscape:connector-curvature="0"
       id="path-forearm-r"
       d="${smooth(build(RIGHT))}"
       style="opacity:0.52424239;fill:#fc0000;fill-opacity:1;stroke:none" />
  </g>
</svg>
`;

writeFileSync(process.argv[2], svg);
console.log('wrote', process.argv[2]);
