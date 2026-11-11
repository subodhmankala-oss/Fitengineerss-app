// Writes docs/ai-exercise-tags-review.csv: every tagged exercise, risky rows
// first (aiProgrammingRules.js REVIEW_RISK — high impact, difficulty 3, or
// loading lumbar/knee/shoulder), most risk reasons first, then A–Z.
//
//   node tools/exercise-tags-review-csv.mjs [exercises.json]
//
// exercises.json (optional) is a JSON array of DB rows with name, category,
// primary_muscle — e.g. the output of
//   GET /rest/v1/exercises?select=name,category,primary_muscle
// to fill the category/muscle columns. Without it they come from the code
// library where it has the exercise, else stay blank.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EXERCISE_TAGS } from '../src/data/exerciseTags.js';
import { REVIEW_RISK } from '../src/data/aiProgrammingRules.js';
import { EXERCISE_LIBRARY } from '../src/data/exerciseLibrary.js';
import { exerciseNameKey } from '../src/utils/exerciseName.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = process.argv[2];

const info = new Map();
EXERCISE_LIBRARY.forEach(e => info.set(exerciseNameKey(e.name), { category: e.category || '', muscle: e.primary || '' }));
if (dbFile) {
  JSON.parse(fs.readFileSync(dbFile, 'utf8')).forEach(r =>
    info.set(exerciseNameKey(r.name), { category: r.category || '', muscle: r.primary_muscle || '' }));
}

const reasonsFor = ([, impact, difficulty, joints]) => [
  ...(REVIEW_RISK.impact.includes(impact) ? [`${impact} impact`] : []),
  ...(REVIEW_RISK.difficulty.includes(difficulty) ? [`difficulty ${difficulty}`] : []),
  ...joints.filter(j => REVIEW_RISK.joints.includes(j)).map(j => `loads ${j}`)
];

const rows = EXERCISE_TAGS
  .map(row => ({ row, reasons: reasonsFor(row) }))
  .sort((a, b) => (b.reasons.length > 0) - (a.reasons.length > 0)
    || b.reasons.length - a.reasons.length
    || a.row[0].localeCompare(b.row[0]));

const cell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const header = ['#', 'review_first', 'risk_reasons', 'exercise', 'category', 'primary_muscle', 'impact', 'difficulty', 'joints_loaded', 'equipment', 'tagging_note', 'your_ok', 'your_correction'];
const lines = rows.map(({ row: [name, impact, difficulty, joints, equipment, note], reasons }, i) => {
  const meta = info.get(exerciseNameKey(name)) || { category: '', muscle: '' };
  return [i + 1, reasons.length ? 'YES' : '', reasons.join('; '), name, meta.category, meta.muscle,
    impact, difficulty, joints.join(' + '), equipment, note || '', '', ''].map(cell).join(',');
});

const out = path.join(root, 'docs', 'ai-exercise-tags-review.csv');
fs.writeFileSync(out, '﻿' + [header.join(','), ...lines].join('\r\n') + '\r\n');
console.log(`${rows.length} rows (${rows.filter(r => r.reasons.length).length} to review first) → ${path.relative(root, out)}`);
