// Body measurements are always STORED in cm (and body weight in kg) — the
// coach's views, reports and history all read them that way. The client's
// choice (localStorage lengthUnit: 'cm' | 'in', weightUnit: 'kg' | 'lbs')
// only changes how the numbers are shown and typed.
import { kgToDisplayWeight, displayWeightToKg } from './weightUnits';

export const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;

const round = (v, d) => { const f = 10 ** d; return Math.round(v * f) / f; };

// units: { length: 'cm' | 'in', weight: 'kg' | 'lbs' }
export function measUnitFor(key, units = {}) {
  if (key === 'weight') return units.weight === 'lbs' ? 'lbs' : 'kg';
  return units.length === 'in' ? 'in' : 'cm';
}

// Stored value -> text for the chosen unit ('' when empty/unparseable).
export function storedToDisplay(key, stored, units = {}) {
  if (key === 'weight') return kgToDisplayWeight(stored, measUnitFor(key, units));
  const cm = parseFloat(stored);
  if (!Number.isFinite(cm)) return '';
  return String(measUnitFor(key, units) === 'in' ? round(cm / CM_PER_IN, 1) : cm);
}

// What the client typed -> value to store. Inches keep 2 decimals so
// 32 in -> 81.28 cm shows back as exactly 32 in.
export function displayToStored(key, text, units = {}) {
  if (key === 'weight') return displayWeightToKg(text, measUnitFor(key, units));
  const n = parseFloat(text);
  if (!Number.isFinite(n)) return '';
  return String(measUnitFor(key, units) === 'in' ? round(n * CM_PER_IN, 2) : n);
}

// A stored-unit difference (cm or kg) in the chosen unit.
export function deltaToDisplay(key, delta, units = {}) {
  const u = measUnitFor(key, units);
  if (u === 'in') return delta / CM_PER_IN;
  if (u === 'lbs') return delta / KG_PER_LB;
  return delta;
}

// "81.3cm" / "32in" / "72kg" for a stored value.
export function formatMeas(key, stored, units = {}) {
  const shown = storedToDisplay(key, stored, units);
  return shown === '' ? '' : `${shown}${measUnitFor(key, units)}`;
}

// "▲ 1.2in" for a stored-unit difference.
export function formatMeasDelta(key, delta, units = {}) {
  const d = deltaToDisplay(key, delta, units);
  return `${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}${measUnitFor(key, units)}`;
}
