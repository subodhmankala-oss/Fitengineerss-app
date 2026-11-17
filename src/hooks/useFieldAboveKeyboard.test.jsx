import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import useFieldAboveKeyboard, { keyboardHeight } from './useFieldAboveKeyboard';

function Screen() {
  useFieldAboveKeyboard('.cp-form-scroll');
  return (
    <div className="cp-form-scroll" data-testid="scroller">
      <input data-testid="waist" />
    </div>
  );
}

describe('keyboardHeight', () => {
  it('is the part of the window the visual viewport no longer covers', () => {
    expect(keyboardHeight({ height: 500, offsetTop: 0 }, 800)).toBe(300);
    expect(keyboardHeight({ height: 800, offsetTop: 0 }, 800)).toBe(0);
    expect(keyboardHeight(null, 800)).toBe(0);
  });
});

describe('useFieldAboveKeyboard', () => {
  let vv;
  beforeEach(() => {
    vi.useFakeTimers();
    vv = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('pads the scroller by the keyboard height and scrolls the field into view', () => {
    const { getByTestId } = render(<Screen />);
    const input = getByTestId('waist');
    input.focus();
    vv.height = 480; // number pad opens
    act(() => { vi.advanceTimersByTime(350); });
    expect(getByTestId('scroller').style.paddingBottom).toBe('344px'); // 320 + 24
    expect(input.scrollIntoView).toHaveBeenCalled();
  });

  it('removes the padding once the keyboard closes', () => {
    const { getByTestId } = render(<Screen />);
    const input = getByTestId('waist');
    input.focus();
    vv.height = 480;
    act(() => { vi.advanceTimersByTime(350); });
    input.blur();
    vv.height = 800;
    act(() => { vi.advanceTimersByTime(400); });
    expect(getByTestId('scroller').style.paddingBottom).toBe('');
  });
});
