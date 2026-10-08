// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useExerciseEnterAnimation } from './useExerciseEnterAnimation';

// A list that renders one row per name, like the loggers' exercise lists.
function List({ names, hook }) {
  return <div>{names.map(n => <div key={n} data-name={n} ref={hook.enterRef(n)} />)}</div>;
}

describe('useExerciseEnterAnimation', () => {
  afterEach(() => { cleanup(); delete HTMLElement.prototype.animate; });

  it('animates only a row whose exercise was just added, once', () => {
    const animate = vi.fn(() => ({}));
    HTMLElement.prototype.animate = animate;
    let api = null;
    function Harness({ names }) {
      const h = useExerciseEnterAnimation();
      useEffect(() => { api = h; });
      return <List names={names} hook={h} />;
    }
    const { rerender } = render(<Harness names={['Squat']} />);
    expect(animate).not.toHaveBeenCalled(); // initial rows never animate

    act(() => { api.markEntering('Bench Press'); });
    rerender(<Harness names={['Squat', 'Bench Press']} />);
    expect(animate).toHaveBeenCalledTimes(1);
    const [frames] = animate.mock.calls[0];
    expect(frames[0]).toMatchObject({ height: '0px', opacity: 0 });
    expect(frames[1]).toMatchObject({ opacity: 1 });

    rerender(<Harness names={['Squat', 'Bench Press']} />); // re-render: no replay
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('does nothing where the Web Animations API is missing', () => {
    function Harness() {
      const h = useExerciseEnterAnimation();
      h.markEntering('Squat');
      return <List names={['Squat']} hook={h} />;
    }
    expect(() => render(<Harness />)).not.toThrow();
  });
});
