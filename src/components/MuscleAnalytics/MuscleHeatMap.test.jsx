// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BodyDiagram } from './MuscleHeatMap';

const optimal = { key: 'optimal', color: '#10b981', label: 'Optimal' };
const notTrained = { key: 'not_trained', color: '#64748b', label: 'Not Trained' };

// Deep Core sits under the abs, so it has no part of its own on the map:
// once trained it shows as a dashed outline in its color instead.
describe('BodyDiagram — Deep Core outline', () => {
  afterEach(cleanup);

  const outline = (deepCore) => {
    const { container } = render(
      <BodyDiagram view="front" onSelectMuscle={() => {}}
        regionSplit={{ Core: { 'Upper Abs': notTrained, 'Deep Core': deepCore } }} />
    );
    return container.querySelector('rect[stroke-dasharray]');
  };

  it('outlines Deep Core in its own color once it has sets', () => {
    const rect = outline(optimal);
    expect(rect).toBeTruthy();
    expect(rect.getAttribute('stroke')).toBe('#10b981');
    expect(rect.closest('.interactive')).toBeNull(); // taps go to the abs
  });

  it('draws nothing for Deep Core while it is untrained', () => {
    expect(outline(notTrained)).toBeNull();
  });
});
