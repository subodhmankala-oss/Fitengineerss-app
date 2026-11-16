import { describe, it, expect } from 'vitest';
import { storedToDisplay, displayToStored, formatMeas, formatMeasDelta, measUnitFor } from './lengthUnits';

const IN = { length: 'in', weight: 'kg' };
const CM = { length: 'cm', weight: 'kg' };

describe('lengthUnits', () => {
  it('stores inches as cm and shows them back unchanged', () => {
    expect(displayToStored('waist', '32', IN)).toBe('81.28');
    expect(storedToDisplay('waist', '81.28', IN)).toBe('32');
    expect(storedToDisplay('waist', '81.28', CM)).toBe('81.28');
  });

  it('leaves body weight on the weight unit, not the length unit', () => {
    expect(measUnitFor('weight', IN)).toBe('kg');
    expect(formatMeas('weight', '72', IN)).toBe('72kg');
    expect(formatMeas('weight', '72', { length: 'cm', weight: 'lbs' })).toBe('158.7lbs');
  });

  it('formats values and changes in the chosen unit', () => {
    expect(formatMeas('chest', '100', IN)).toBe('39.4in');
    expect(formatMeasDelta('chest', 2.54, IN)).toBe('▲ 1.0in');
    expect(formatMeasDelta('chest', -1.5, CM)).toBe('▼ 1.5cm');
    expect(formatMeas('neck', '', IN)).toBe('');
  });
});
