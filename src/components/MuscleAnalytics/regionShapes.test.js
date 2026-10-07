import { describe, it, expect } from 'vitest';
import { REGION_SHAPES, regionCrop, clipStyle } from './regionShapes';
import { EXERCISE_SUBGROUPS } from '../../data/exerciseSubgroups';

describe('region shapes', () => {
  it('every Add Exercise sub-group has a shape to highlight', () => {
    const missing = Object.values(EXERCISE_SUBGROUPS).flat().map(sg => sg.id).filter(id => !REGION_SHAPES[id]);
    expect(missing).toEqual([]);
  });

  it('tibialis is drawn on the front of the body, calves on the back', () => {
    expect(REGION_SHAPES.Tibialis.view).toBe('front');
    expect(REGION_SHAPES.Calves.view).toBe('back');
  });

  it('crops stay inside the 200x369 canvas', () => {
    Object.keys(REGION_SHAPES).forEach(r => {
      const c = regionCrop(r);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(200);
      expect(c.y + c.h).toBeLessThanOrEqual(369);
    });
  });

  it('turns a clip window into a CSS inset', () => {
    expect(clipStyle([60, 76, 140, 117])).toBe('inset(76px 60px 252.03px 60px)');
    expect(clipStyle(undefined)).toBeUndefined();
  });
});
