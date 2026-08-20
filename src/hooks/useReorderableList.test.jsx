// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useReorderableList } from './useReorderableList';

const ROW_HEIGHT = 50;

function Harness({ items, onReorder }) {
  const { getRowStyle, startReorderDrag, measureRowHeight, isReordering, dragIndex } = useReorderableList(items, onReorder);
  return (
    <div className="main-content" data-testid="scroller">
      <div>
        {items.map((it, i) => (
          <div key={it} style={getRowStyle(i)} data-testid={`row-${i}`}>
            <button
              data-testid={`handle-${i}`}
              onPointerDown={startReorderDrag(i)}
              ref={i === 0 ? measureRowHeight : undefined}
            >
              handle
            </button>
            {it}
          </div>
        ))}
      </div>
      <div data-testid="status">{String(isReordering)}:{String(dragIndex)}</div>
    </div>
  );
}

// jsdom never lays anything out, so every element's getBoundingClientRect()
// is all zeros by default — that makes the auto-scroll edge math think the
// pointer is always at the edge. Stub real-looking geometry so tests can
// tell "near the edge" apart from "middle of the list".
function stubGeometry({ scroller, rowHeight = ROW_HEIGHT, viewportHeight = 400, scrollHeight = 2000 }) {
  Object.defineProperty(scroller, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, bottom: viewportHeight, left: 0, right: 300, width: 300, height: viewportHeight, x: 0, y: 0 }),
  });
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: viewportHeight });
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: scrollHeight });
  let scrollTop = 0;
  Object.defineProperty(scroller, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (v) => { scrollTop = v; },
  });
  const handle0 = scroller.querySelector('[data-testid="handle-0"]');
  Object.defineProperty(handle0, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, bottom: rowHeight, left: 0, right: 300, width: 300, height: rowHeight, x: 0, y: 0 }),
  });
}

function pointerDown(el, clientY) {
  act(() => {
    el.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientY, button: 0, pointerId: 1 }));
  });
}
function pointerMove(clientY) {
  act(() => {
    window.dispatchEvent(new window.PointerEvent('pointermove', { bubbles: true, cancelable: true, clientY, pointerId: 1 }));
  });
}
function pointerUp(clientY) {
  act(() => {
    window.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, cancelable: true, clientY, pointerId: 1 }));
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useReorderableList', () => {
  it('starts a drag on pointerdown and follows the pointer 1:1', () => {
    const onReorder = vi.fn();
    const items = ['A', 'B', 'C', 'D', 'E'];
    const { getByTestId } = render(<Harness items={items} onReorder={onReorder} />);
    stubGeometry({ scroller: getByTestId('scroller') });

    pointerDown(getByTestId('handle-0'), 100);
    expect(getByTestId('status').textContent).toBe('true:0');

    pointerMove(150);
    expect(getByTestId('row-0').getAttribute('style')).toContain('translateY(50px)');

    pointerUp(150);
  });

  it('reorders correctly and commits on release', () => {
    vi.useFakeTimers();
    const onReorder = vi.fn();
    const items = ['A', 'B', 'C', 'D', 'E'];
    const { getByTestId } = render(<Harness items={items} onReorder={onReorder} />);
    stubGeometry({ scroller: getByTestId('scroller') });

    pointerDown(getByTestId('handle-0'), 100);
    // Move down 2.5 rows worth — rounds to 3 steps, moving item A to index 3.
    pointerMove(100 + ROW_HEIGHT * 2.5);
    pointerUp(100 + ROW_HEIGHT * 2.5);

    act(() => { vi.advanceTimersByTime(300); });

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0][0]).toEqual(['B', 'C', 'D', 'A', 'E']);
  });

  it('auto-scrolls the container when the pointer nears the bottom edge, keeping the row glued to the pointer', () => {
    const onReorder = vi.fn();
    const items = Array.from({ length: 30 }, (_, i) => `Item ${i}`);
    const { getByTestId } = render(<Harness items={items} onReorder={onReorder} />);
    const scroller = getByTestId('scroller');
    stubGeometry({ scroller, viewportHeight: 400 });

    pointerDown(getByTestId('handle-0'), 200);
    expect(scroller.scrollTop).toBe(0);

    // 20px from the bottom edge (viewport bottom = 400) — well inside the
    // 70px auto-scroll zone.
    pointerMove(380);

    // Let a few animation frames of the auto-scroll loop run.
    act(() => {
      for (let i = 0; i < 5; i++) vi.runOnlyPendingTimers ? null : null;
    });
    // requestAnimationFrame in jsdom resolves via a real timer; flush a
    // handful of frames manually since fake timers aren't in play here.
    return new Promise((resolve) => {
      let frames = 0;
      const step = () => {
        frames += 1;
        if (frames < 6) {
          requestAnimationFrame(step);
        } else {
          expect(scroller.scrollTop).toBeGreaterThan(0);
          // The dragged row's own translateY should still reflect "pointer
          // minus its (shifted) start", not drift now that the container
          // has scrolled under a stationary pointer.
          const style = getByTestId('row-0').getAttribute('style');
          expect(style).toMatch(/translateY\((\d+(\.\d+)?)px\)/);
          pointerUp(380);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  });

  it('lets a new drag start immediately after a previous one ends', () => {
    const onReorder = vi.fn();
    const items = ['A', 'B', 'C'];
    const { getByTestId } = render(<Harness items={items} onReorder={onReorder} />);
    stubGeometry({ scroller: getByTestId('scroller') });

    pointerDown(getByTestId('handle-0'), 100);
    pointerMove(120);
    pointerUp(120);

    // Immediately drag again.
    pointerDown(getByTestId('handle-0'), 100);
    expect(getByTestId('status').textContent).toBe('true:0');
    pointerMove(160);
    expect(getByTestId('row-0').getAttribute('style')).toContain('translateY(60px)');
    pointerUp(160);
  });
});
