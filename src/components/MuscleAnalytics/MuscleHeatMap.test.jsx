// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { BodyDiagram } from './MuscleHeatMap';

const optimal = { key: 'optimal', color: '#10b981', label: 'Optimal' };
const notTrained = { key: 'not_trained', color: '#64748b', label: 'Not Trained' };

// Deep Core sits under the abs, so it has no part of its own on the map:
// once trained it glows in its color from underneath the abs and obliques.
describe('BodyDiagram — Deep Core glow', () => {
  afterEach(cleanup);

  const glows = (deepCore) => {
    const { container } = render(
      <BodyDiagram view="front" onSelectMuscle={() => {}}
        regionSplit={{ Core: { 'Upper Abs': notTrained, 'Deep Core': deepCore } }} />
    );
    return { container, layers: [...container.querySelectorAll('.muscle-hidden-glow')] };
  };

  it('glows in its own color under the abs once it has sets', () => {
    const { container, layers } = glows(optimal);
    expect(layers.length).toBeGreaterThan(0);
    expect(layers[0].firstElementChild.style.filter).toContain('#10b981');
    expect(layers[0].closest('.interactive')).toBeNull(); // taps go to the abs
    // Drawn before (under) the abs layer, not on top of it.
    const abs = container.querySelector('[aria-label^="Core, Upper Abs"]');
    expect(layers[0].compareDocumentPosition(abs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('rect[stroke-dasharray]')).toBeNull();
  });

  it('draws nothing for Deep Core while it is untrained', () => {
    expect(glows(notTrained).layers).toHaveLength(0);
  });
});
