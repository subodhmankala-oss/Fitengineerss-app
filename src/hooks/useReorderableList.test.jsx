// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act, renderHook } from '@testing-library/react';
import { useReorderableList } from './useReorderableList';

const ROW_HEIGHT = 50;

function Harness({ items, onReorder }) {
  const { getRowStyle, startReorderDrag, measureRowHeight, isReordering, dragIndex, getItemKey } = useReorderableList(items, onReorder);
  return (
    <div className="main-content" data-testid="scroller">
      <div>
        {items.map((it, i) => (
          // Real call sites wrap each row in .ex-reorder-row — the hook's
          // scroll-anchor logic locates the dragged row via
          // e.currentTarget.closest('.ex-reorder-row'), so the harness has
          // to match that structure for those tests to exercise real code.
          <div key={getItemKey(i)} className="ex-reorder-row" style={getRowStyle(i)} data-testid={`row-${i}`}>
            <button
              data-testid={`handle-${i}`}
              onPointerDown={startReorderDrag(i)}
              ref={i === 0 ? measureRowHeight : undefined}
            >
              handle
            </button>
            {typeof it === 'object' ? it.name : it}
          </div>
        ))}
      </div>
      <div data-testid="status">{String(isReordering)}:{String(dragIndex)}</div>
    </div>
  );
}

function rectAt(top, height) {
  return { top, bottom: top + height, left: 0, right: 300, width: 300, height, x: 0, y: top };
}

// jsdom never lays anything out, so every element's getBoundingClientRect()
// is all zeros by default — that makes the auto-scroll edge math think the
// pointer is always at the edge. Stub real-looking geometry so tests can
// tell "near the edge" apart from "middle of the list".
//
// Returns a `moveRow(index, top)` helper the anchor-correction test uses to
// simulate another row's height animating open/closed and shoving `index`'s
// row to a new position mid-correction, without needing a real layout
// engine.
function stubGeometry({ scroller, rowHeight = ROW_HEIGHT, viewportHeight = 400, scrollHeight = 2000, rowCount = 1 }) {
  Object.defineProperty(scroller, 'getBoundingClientRect', {
    configurable: true,
    value: () => rectAt(0, viewportHeight),
  });
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: viewportHeight });
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: scrollHeight });

  // Real scrolling moves every descendant's on-screen rect by -delta as a
  // side effect — jsdom does none of that, so the scrollTop setter below
  // applies it manually to every stubbed row rect. Without this, the
  // anchor-correction loop's own scrollTop writes would never actually
  // reduce the drift it just measured, and it'd keep "correcting" the same
  // apparent gap forever instead of converging in one frame like it does
  // for real.
  const rowTopSetters = [];
  let scrollTop = 0;
  Object.defineProperty(scroller, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (v) => {
      const delta = v - scrollTop;
      scrollTop = v;
      rowTopSetters.forEach((shift) => shift(-delta));
    },
  });

  for (let i = 0; i < rowCount; i++) {
    const handle = scroller.querySelector(`[data-testid="handle-${i}"]`);
    const row = handle.closest('.ex-reorder-row');
    let rect = rectAt(i * rowHeight, rowHeight);
    const apply = () => rect;
    Object.defineProperty(handle, 'getBoundingClientRect', { configurable: true, value: apply });
    Object.defineProperty(row, 'getBoundingClientRect', { configurable: true, value: apply });
    row.__setTop = (top) => { rect = rectAt(top, rect.height); };
    rowTopSetters.push((deltaTop) => { rect = rectAt(rect.top + deltaTop, rect.height); });
  }

  return {
    // Simulates another row's own height changing and shoving row `index`
    // down/up to `top`, independent of any scrollTop change.
    moveRow: (index, top) => {
      const handle = scroller.querySelector(`[data-testid="handle-${index}"]`);
      handle.closest('.ex-reorder-row').__setTop(top);
    },
  };
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

  it('gives the same key back for the same item across a reorder (stable identity, not index-based)', () => {
    const onReorder = vi.fn();
    const a = { name: 'A' };
    const b = { name: 'B' };
    const items = [a, b];
    const { result, rerender } = renderHook(
      ({ list }) => useReorderableList(list, onReorder),
      { initialProps: { list: items } }
    );
    const keyForAAtIndex0 = result.current.getItemKey(0);
    const keyForBAtIndex1 = result.current.getItemKey(1);

    // Same objects, now in the other order — as endDrag's
    // orderIdsRef.current.map(id => itemsRef.current[id]) produces, since a
    // reorder permutes references rather than cloning them.
    rerender({ list: [b, a] });

    expect(result.current.getItemKey(0)).toBe(keyForBAtIndex1); // b, wherever it lands, keeps b's key
    expect(result.current.getItemKey(1)).toBe(keyForAAtIndex0); // a, wherever it lands, keeps a's key
  });

  it('keeps the dropped row anchored in the viewport if another row grows above it during settle', async () => {
    const onReorder = vi.fn();
    const items = Array.from({ length: 5 }, (_, i) => `Item ${i}`);
    const { getByTestId } = render(<Harness items={items} onReorder={onReorder} />);
    const scroller = getByTestId('scroller');
    const { moveRow } = stubGeometry({ scroller, rowCount: 5 });

    pointerDown(getByTestId('handle-0'), 100);
    pointerMove(100 + ROW_HEIGHT * 2); // drag row 0 down two slots
    pointerUp(100 + ROW_HEIGHT * 2);

    // Real 280ms settle timeout (endDrag) — past it, the commit + anchor
    // capture has fired.
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(scroller.scrollTop).toBe(0);

    // Simulate another row's compact-card morph (WorkoutTracker.css's
    // .ex-reorder-morph max-height transition) pushing this row down by
    // 120px while the anchor-correction window is still open.
    moveRow(0, 120);

    await new Promise((resolve) => {
      let frames = 0;
      const step = () => {
        frames += 1;
        if (frames < 10) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    // The correction should have scrolled exactly enough to cancel the
    // 120px drift and hold — not under-corrected, not runaway.
    expect(scroller.scrollTop).toBe(120);
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
