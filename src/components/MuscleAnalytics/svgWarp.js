// Shared helpers for warping the vendored body/muscle SVGs point-by-point.
//
// Each file is rewritten so every <path> carries absolute coordinates in the
// final 200×369 canvas (its <g>/<path> transforms are baked in and removed),
// then every point — anchors AND bezier control points — is passed through
// the warp function. Bezier curves stay smooth under a smooth warp, so the
// artwork keeps its look; and since the base body and every overlay go
// through the SAME warp, the overlays stay registered on the body.
//
// Only the path commands these files actually use are needed: M/L/H/V/C/S/Q/T/Z,
// relative and absolute (no arcs — checked).

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

function parsePath(d) {
  const tokens = d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?|[a-zA-Z]/gi) || [];
  const segs = []; // { c: 'M'|'L'|'C'|'Z', p: [[x,y]...] } absolute
  let i = 0, cmd = null, cx = 0, cy = 0, sx = 0, sy = 0, lastCtrl = null, lastQ = null;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === 'Z') {
      segs.push({ c: 'Z', p: [] });
      cx = sx; cy = sy; lastCtrl = lastQ = null;
      continue;
    }
    if (C === 'M') {
      cx = ox + num(); cy = oy + num(); sx = cx; sy = cy;
      segs.push({ c: 'M', p: [[cx, cy]] }); lastCtrl = lastQ = null;
    } else if (C === 'L') {
      cx = ox + num(); cy = oy + num();
      segs.push({ c: 'L', p: [[cx, cy]] }); lastCtrl = lastQ = null;
    } else if (C === 'H') {
      cx = ox + num(); segs.push({ c: 'L', p: [[cx, cy]] }); lastCtrl = lastQ = null;
    } else if (C === 'V') {
      cy = oy + num(); segs.push({ c: 'L', p: [[cx, cy]] }); lastCtrl = lastQ = null;
    } else if (C === 'C') {
      const p1 = [ox + num(), oy + num()], p2 = [ox + num(), oy + num()], p = [ox + num(), oy + num()];
      segs.push({ c: 'C', p: [p1, p2, p] }); [cx, cy] = p; lastCtrl = p2; lastQ = null;
    } else if (C === 'S') {
      const p1 = lastCtrl ? [2 * cx - lastCtrl[0], 2 * cy - lastCtrl[1]] : [cx, cy];
      const p2 = [ox + num(), oy + num()], p = [ox + num(), oy + num()];
      segs.push({ c: 'C', p: [p1, p2, p] }); [cx, cy] = p; lastCtrl = p2; lastQ = null;
    } else if (C === 'Q' || C === 'T') {
      const q = C === 'Q' ? [ox + num(), oy + num()] : (lastQ ? [2 * cx - lastQ[0], 2 * cy - lastQ[1]] : [cx, cy]);
      const p = [ox + num(), oy + num()];
      segs.push({ c: 'C', p: [[cx + 2 / 3 * (q[0] - cx), cy + 2 / 3 * (q[1] - cy)], [p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1])], p] });
      [cx, cy] = p; lastQ = q; lastCtrl = null;
    } else {
      throw new Error(`Unsupported path command ${cmd}`);
    }
  }
  return segs;
}

const r2 = v => Math.round(v * 100) / 100;
function serialize(segs) {
  return segs.map(s => s.c + (s.p.length ? ' ' + s.p.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ') : '')).join(' ');
}

// 2D affine matrices as [a,b,c,d,e,f] (SVG order).
const IDENT = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
function parseTransform(attrs) {
  const t = attrs.match(/\stransform="([^"]*)"/);
  if (!t) return IDENT;
  let m = IDENT;
  for (const [, fn, args] of t[1].matchAll(/(\w+)\(([^)]*)\)/g)) {
    const a = args.match(NUM).map(Number);
    if (fn === 'translate') m = mul(m, [1, 0, 0, 1, a[0], a[1] || 0]);
    else if (fn === 'matrix') m = mul(m, a);
    else if (fn === 'scale') m = mul(m, [a[0], 0, 0, a[1] ?? a[0], 0, 0]);
    else throw new Error(`Unsupported transform ${fn}`);
  }
  return m;
}

/**
 * Returns the SVG text with every path flattened to canvas coordinates and
 * warped by `warp([x, y]) → [x, y]`. Pass `warp = p => p` to just flatten.
 */
export function warpSvg(text, warp) {
  const stack = [IDENT];
  return text.replace(/<(\/?)([\w:]+)((?:[^>"]|"[^"]*")*?)(\/?)>/g, (tag, close, name, attrs, selfClose) => {
    if (close) { if (name === 'g') stack.pop(); return tag; }
    const m = mul(stack[stack.length - 1], parseTransform(attrs));
    if (name === 'g' && !selfClose) {
      stack.push(m);
      return `<g${attrs.replace(/\s+transform="[^"]*"/, '')}>`;
    }
    if (name === 'path') {
      const newAttrs = attrs
        .replace(/\s+transform="[^"]*"/, '')
        .replace(/(\sd=")([^"]*)(")/, (_, a, d, b) => {
          const segs = parsePath(d);
          for (const s of segs) {
            s.p = s.p.map(([x, y]) => warp([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]));
          }
          return a + serialize(segs) + b;
        });
      return `<${name}${newAttrs}${selfClose}>`;
    }
    return tag;
  });
}
