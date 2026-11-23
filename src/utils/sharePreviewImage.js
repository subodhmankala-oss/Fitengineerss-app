// The picture chat apps show on a shared workout's message: name, sets, time
// and the muscle map. Drawn in the owner's browser (the body drawings live
// there) and stored with the link, so it goes away when sharing stops. It
// carries no weights, calories or person's name.
import { getBodyArt, recolorSvg, FACE_MASK, FACE_MASK_GRADIENT, SCALP_MASK, SCALP_MASK_GRADIENT } from '../components/MuscleAnalytics/muscleBodyShapes';
import { HELPED_MUSCLE_COLOR, MAIN_MUSCLE_COLOR } from './workoutShare';

export const PREVIEW_W = 960;
export const PREVIEW_H = 504;
const BODY_W = 236;
const BODY_H = Math.round(BODY_W * (369 / 200));
const SCALE = BODY_W / 200;

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('preview image part failed to load'));
  img.src = src;
});

async function loadSvg(svgText) {
  const doc = new DOMParser().parseFromString(svgText.slice(svgText.indexOf('<svg')), 'image/svg+xml');
  doc.documentElement.setAttribute('width', BODY_W);
  doc.documentElement.setAttribute('height', BODY_H);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' }));
  try { return await loadImage(url); } finally { URL.revokeObjectURL(url); }
}

const newCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

function headPatch(ctx, mask, stops) {
  const [cx, cy, rx, ry] = [mask.cx, mask.cy, mask.rx, mask.ry].map(n => n * SCALE);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  stops.forEach(([at, color]) => g.addColorStop(at, color));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

async function drawBody(sex, view, colors) {
  const art = getBodyArt(sex)[view];
  const canvas = newCanvas(BODY_W, BODY_H);
  const ctx = canvas.getContext('2d');
  const draw = (img) => ctx.drawImage(img, 0, 0, BODY_W, BODY_H);
  const maskUrl = /url\((["']?)(.*)\1\)/.exec(art.bodyMaskStyle?.maskImage || art.bodyMaskStyle?.WebkitMaskImage || '')?.[2];
  const overlays = Object.entries(art.layers).flatMap(([muscle, files]) => (
    colors[muscle] ? files.map(raw => recolorSvg(raw, colors[muscle], false)) : []
  ));
  const [fill, body, mask, underlay, ...layers] = await Promise.all([
    loadImage(art.fillUrl), loadSvg(art.bodySvg),
    maskUrl ? loadImage(maskUrl) : null, art.underlayUrl ? loadImage(art.underlayUrl) : null,
    ...overlays.map(loadSvg),
  ]);
  draw(fill);
  draw(body);
  if (mask) {
    ctx.globalCompositeOperation = 'destination-in';
    draw(mask);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (view === 'front') headPatch(ctx, FACE_MASK, [[0, FACE_MASK_GRADIENT.center], [0.7, FACE_MASK_GRADIENT.mid], [1, 'rgba(199,199,199,0)']]);
  else headPatch(ctx, SCALP_MASK, [[0, SCALP_MASK_GRADIENT.center], [0.7, SCALP_MASK_GRADIENT.mid], [1, SCALP_MASK_GRADIENT.edge]]);
  if (underlay) draw(underlay);
  layers.forEach(draw);
  return canvas;
}

// Up to `max` lines of at most `width`, the last one cut with "…".
export function wrapLines(measure, text, width, max) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= width || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  const kept = lines.slice(0, max);
  kept.forEach((l, i) => {
    const cut = i === max - 1 && lines.length > max;
    let s = l;
    while (s && measure(cut || s !== l ? `${s}…` : s) > width) s = s.slice(0, -1);
    kept[i] = cut || s !== l ? `${s.trimEnd()}…` : s;
  });
  return kept;
}

/** The picture as base64 JPEG (no data: prefix), or null if it can't be drawn. */
export async function drawSharePreview({ title, sets, durationSeconds, muscles, sex }) {
  try {
    const colors = Object.fromEntries(muscles.map(m => [m.muscle, m.main ? MAIN_MUSCLE_COLOR : HELPED_MUSCLE_COLOR]));
    const [front, back, logo] = await Promise.all([
      drawBody(sex, 'front', colors), drawBody(sex, 'back', colors), loadImage('/logo.png').catch(() => null),
      ...['600 32px Outfit', '700 24px Outfit', '500 24px Outfit'].map(f => document.fonts?.load(f).catch(() => null)),
    ]);
    const canvas = newCanvas(PREVIEW_W, PREVIEW_H);
    const ctx = canvas.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 0, PREVIEW_H);
    bg.addColorStop(0, '#141f3a');
    bg.addColorStop(1, '#090e17');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);

    const bodyTop = (PREVIEW_H - BODY_H) / 2;
    ctx.drawImage(front, PREVIEW_W - 2 * BODY_W - 12, bodyTop);
    ctx.drawImage(back, PREVIEW_W - BODY_W - 14, bodyTop);

    const x = 44;
    const font = (weight, size) => { ctx.font = `${weight} ${size}px Outfit, system-ui, sans-serif`; };
    const text = (s, y, color) => { ctx.fillStyle = color; ctx.fillText(s, x, y); };
    if (logo) ctx.drawImage(logo, x, 40, 44, 44);
    font(600, 24);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('Fitengineers', x + (logo ? 56 : 0), 70);

    // Long plan names step down a size so the whole name shows.
    const measure = s => ctx.measureText(s).width;
    font(600, 32);
    let lines = wrapLines(measure, title, 400, 9);
    const small = lines.length > 2;
    if (small) { font(600, 26); lines = wrapLines(measure, title, 400, 3); }
    let y = small ? 138 : 150;
    lines.forEach(l => { text(l, y, '#ffffff'); y += small ? 34 : 40; });
    font(500, 24);
    const mins = durationSeconds ? `${Math.max(1, Math.round(durationSeconds / 60))} min  ·  ` : '';
    text(`${mins}${sets} ${sets === 1 ? 'set' : 'sets'}`, y + (small ? 4 : 0), '#aab4c5');
    y += 54;

    const shown = muscles.slice(0, lines.length === 1 ? 5 : 4);
    shown.forEach(m => {
      ctx.fillStyle = colors[m.muscle];
      ctx.beginPath();
      ctx.arc(x + 7, y - 8, 7, 0, Math.PI * 2);
      ctx.fill();
      font(500, 24);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(m.muscle, x + 26, y);
      const w = ctx.measureText(m.muscle).width;
      font(700, 24);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(m.sets), x + 38 + w, y);
      y += 40;
    });
    const data = canvas.toDataURL('image/jpeg', 0.84);
    return data.startsWith('data:image/jpeg;base64,') ? data.split(',')[1] : null;
  } catch (e) {
    console.warn('share preview image:', e?.message || e);
    return null;
  }
}
