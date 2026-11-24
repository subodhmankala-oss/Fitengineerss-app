// The picture chat apps show on a shared workout's message: name, sets, time
// and the muscle map, plus the person when they chose to show their photo. Drawn in the owner's browser (the body drawings live
// there) and stored with the link, so it goes away when sharing stops. It
// carries no weights or calories.
import { getBodyArt, recolorSvg, FACE_MASK, FACE_MASK_GRADIENT, SCALP_MASK, SCALP_MASK_GRADIENT } from '../components/MuscleAnalytics/muscleBodyShapes';
import { getAvatarColor } from './avatarUtil';
import { workoutNameParts, workoutNameTags } from './workoutNameParts';
import { HELPED_MUSCLE_COLOR, MAIN_MUSCLE_COLOR } from './workoutShare';

export const PREVIEW_W = 960;
export const PREVIEW_H = 504;
const BODY_W = 236;
const BODY_H = Math.round(BODY_W * (369 / 200));
const SCALE = BODY_W / 200;

const loadImage = (src, cors) => new Promise((resolve, reject) => {
  const img = new Image();
  // Google answers 429 to photo requests that name another site.
  if (cors) { img.crossOrigin = 'anonymous'; img.referrerPolicy = 'no-referrer'; }
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

// Level, week and session each in their own colour (r,g,b).
const TAG_RGB = {
  'level-beginner': '52,211,153', 'level-intermediate': '251,191,36', 'level-advanced': '248,113,113', 'level-number': '251,191,36',
  week: '96,165,250', session: '196,181,253',
};

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
// `person`: { name, photoUrl } when their photo is on (name null when that is
// off); without a photo the name's first letter stands in.
export async function drawSharePreview({ title, sets, durationSeconds, muscles, sex, person = null }) {
  try {
    const colors = Object.fromEntries(muscles.map(m => [m.muscle, m.main ? MAIN_MUSCLE_COLOR : HELPED_MUSCLE_COLOR]));
    const [front, back, logo, face] = await Promise.all([
      drawBody(sex, 'front', colors), drawBody(sex, 'back', colors), loadImage('/logo.png').catch(() => null),
      person?.photoUrl ? loadImage(person.photoUrl, true).catch(() => null) : null,
      ...['600 32px Outfit', '600 18px Outfit', '600 21px Outfit', '700 24px Outfit', '500 24px Outfit'].map(f => document.fonts?.load(f).catch(() => null)),
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

    // Says what this is to someone who doesn't know the app.
    const completed = (cx, cy) => {
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + 2, cy - 7);
      ctx.lineTo(cx + 8, cy - 1);
      ctx.lineTo(cx + 19, cy - 14);
      ctx.stroke();
      font(600, 21);
      ctx.fillStyle = '#34d399';
      ctx.fillText('Workout completed', cx + 30, cy);
    };
    const letter = person?.name ? person.name[0].toUpperCase() : '';
    const showPerson = !!(face || letter);
    if (showPerson) {
      const r = 38;
      const cx = x + r;
      const cy = 104 + r;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      if (face) {
        ctx.drawImage(face, cx - r, cy - r, r * 2, r * 2);
      } else {
        ctx.fillStyle = getAvatarColor(person.name);
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        font(700, 34);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(letter, cx - ctx.measureText(letter).width / 2, cy + 12);
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
      ctx.stroke();
      const tx = x + r * 2 + 18;
      if (person.name) {
        font(600, 29);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(wrapLines(s => ctx.measureText(s).width, person.name, 300, 1)[0] || '', tx, 138);
        completed(tx, 169);
      } else {
        completed(tx, 150);
      }
    } else {
      completed(x, 145);
    }

    const parts = workoutNameParts(title);
    const tags = workoutNameTags(parts);
    // Long names step down a size so the whole name shows.
    const measure = s => ctx.measureText(s).width;
    font(600, 32);
    let lines = wrapLines(measure, parts.name, 400, 9);
    const small = lines.length > 2;
    if (small) { font(600, 26); lines = wrapLines(measure, parts.name, 400, 3); }
    let y = (small ? 184 : 188) + (showPerson ? 36 : 0);
    const lineStep = small ? 34 : 40;
    lines.forEach(l => { text(l, y, '#ffffff'); y += lineStep; });
    const lastLineWidth = measure(lines[lines.length - 1] || '');
    const tagWidth = (tag) => { font(600, 18); return measure(tag.text) + 24; };
    const drawTag = (tag, tx, ty) => {
      const w = tagWidth(tag);
      ctx.beginPath();
      // (Safari before 16 has no roundRect.)
      if (ctx.roundRect) ctx.roundRect(tx + 1, ty + 1, w - 2, 28, 14);
      else ctx.rect(tx + 1, ty + 1, w - 2, 28);
      ctx.fillStyle = `rgba(${TAG_RGB[tag.kind]},0.16)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${TAG_RGB[tag.kind]},0.55)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = `rgb(${TAG_RGB[tag.kind]})`;
      ctx.fillText(tag.text, tx + 12, ty + 21);
    };
    // The level sits beside the name when there is room, else with the rest.
    if (parts.level) {
      const beside = x + lastLineWidth + 14;
      if (beside + tagWidth(tags[0]) <= x + 410) drawTag(tags.shift(), beside, y - lineStep - (small ? 22 : 25));
    }
    if (tags.length) {
      let tx = x;
      let ty = y - 22;
      tags.forEach(tag => {
        const w = tagWidth(tag);
        if (tx > x && tx + w > x + 410) { tx = x; ty += 38; }
        drawTag(tag, tx, ty);
        tx += w + 8;
      });
      y = ty + 64;
    }
    font(500, 24);
    const mins = durationSeconds ? `${Math.max(1, Math.round(durationSeconds / 60))} min  ·  ` : '';
    text(`${mins}${sets} ${sets === 1 ? 'set' : 'sets'}`, y + (small && !tags.length ? 4 : 0), '#aab4c5');
    y += 48;

    const shown = muscles.slice(0, Math.min(5, Math.floor((PREVIEW_H - 24 - y) / 36) + 1));
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
      ctx.fillText(`${m.sets} ${m.sets === 1 ? 'set' : 'sets'}`, x + 38 + w, y);
      y += 36;
    });
    const data = canvas.toDataURL('image/jpeg', 0.84);
    return data.startsWith('data:image/jpeg;base64,') ? data.split(',')[1] : null;
  } catch (e) {
    console.warn('share preview image:', e?.message || e);
    return null;
  }
}
