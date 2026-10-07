import { describe, it, expect } from 'vitest';
import { femaleWarp, femaleWarpInverse } from './femaleBodyWarp';
import { warpSvg } from './svgWarp';
import { getBodyArt, FRONT_MUSCLE_LAYERS, SOURCE_FILL_PLACEHOLDER } from './muscleBodyShapes';

describe('femaleWarp', () => {
  for (const view of ['front', 'back']) {
    const w = femaleWarp(view);

    it(`${view}: never folds a row over itself (x stays strictly increasing)`, () => {
      for (let y = 0; y <= 369; y += 3) {
        let prev = -Infinity;
        for (let x = 0; x <= 200; x += 0.5) {
          const [nx] = w([x, y]);
          expect(nx).toBeGreaterThan(prev);
          prev = nx;
        }
      }
    });

    it(`${view}: leaves the lower legs and feet alone`, () => {
      for (const p of [[85, 290], [85, 330], [115, 360]]) {
        const [x, y] = w(p);
        expect(x).toBeCloseTo(p[0], 5);
        expect(y).toBeCloseTo(p[1], 5);
      }
    });

    it(`${view}: inverse undoes the warp (used for the fill PNGs)`, () => {
      const inv = femaleWarpInverse(view);
      for (const p of [[60, 90], [99, 100], [130, 145], [70, 190], [150, 200]]) {
        const [x, y] = inv(w(p));
        expect(x).toBeCloseTo(p[0], 2);
        expect(y).toBeCloseTo(p[1], 2);
      }
    });
  }

  it('narrows the waist and widens the hips', () => {
    const w = femaleWarp('front');
    const width = y => w([131, y])[0] - w([67, y])[0];
    expect(width(145)).toBeLessThan(64 * 0.9);
    expect(width(195)).toBeGreaterThan(64 * 1.05);
  });
});

describe('warpSvg', () => {
  it('bakes group/path transforms into absolute coordinates', () => {
    const svg = '<svg><g transform="translate(-10,5)"><path transform="matrix(-1,0,0,1,100,0)" d="m 20,30 10,0 c 1,1 2,2 3,3 z" style="fill:#fc0000"/></g></svg>';
    const out = warpSvg(svg, p => p);
    expect(out).not.toMatch(/transform=/);
    // (20,30) → mirror: (80,30) → translate: (70,35); next point relative +10 → (60,35)
    expect(out).toContain('d="M 70,35 L 60,35 C 59,36 58,37 57,38 Z"');
    expect(out).toContain('fill:#fc0000');
  });
});

describe('getBodyArt', () => {
  it('returns the vendored art for male or unset sex', () => {
    expect(getBodyArt('male').front.layers).toBe(FRONT_MUSCLE_LAYERS);
    expect(getBodyArt(undefined).front.underlayUrl).toBeNull();
  });

  it('female: every muscle keeps its recolorable overlays, same keys and counts', () => {
    const female = getBodyArt('female');
    for (const view of ['front', 'back']) {
      const male = getBodyArt('male')[view].layers;
      expect(Object.keys(female[view].layers)).toEqual(Object.keys(male));
      for (const [m, files] of Object.entries(female[view].layers)) {
        expect(files).toHaveLength(male[m].length);
        for (const f of files) expect(f).toContain(SOURCE_FILL_PLACEHOLDER);
      }
    }
    expect(female.front.underlayUrl).toBeTruthy();
    expect(female.front.bodyMaskStyle.maskImage).toMatch(/^url\("data:image\/svg\+xml,/); // armpit slivers cut out
    expect(getBodyArt('male').front.bodyMaskStyle).toBeNull();
    expect(getBodyArt('female')).toBe(female); // built once, cached
  });
});
