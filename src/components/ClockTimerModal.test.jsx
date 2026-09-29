// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

vi.mock('../utils/alarmSound', () => ({ playAlarmBeeps: vi.fn(), unlockAudio: vi.fn() }));
import { playAlarmBeeps } from '../utils/alarmSound';
import ClockTimerModal from './ClockTimerModal';

const T0 = new Date('2026-09-29T10:00:00Z').getTime();

// A phone suspends setInterval while the app is off screen: real time
// passes but no tick runs. So move the clock forward WITHOUT running any
// timers, then bring the app back on screen.
const leaveAppFor = (ms) => vi.setSystemTime(Date.now() + ms);
const comeBackOnScreen = () => act(() => { document.dispatchEvent(new Event('visibilitychange')); });
const clockLabel = () => document.querySelector('.clock-ring-label').textContent;
const openTimer = () => {
  render(<ClockTimerModal onClose={() => {}} />);
  fireEvent.click(screen.getByText('Timer'));
};

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  localStorage.clear();
  playAlarmBeeps.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ClockTimerModal while the app is off screen', () => {
  it('keeps the timer counting down', () => {
    openTimer();
    fireEvent.click(screen.getByText('Start'));
    expect(clockLabel()).toBe('01:00');
    leaveAppFor(25_000);
    comeBackOnScreen();
    expect(clockLabel()).toBe('00:35');
  });

  it('finishes and beeps once when the timer ran out while away', () => {
    openTimer();
    fireEvent.click(screen.getByText('Start'));
    leaveAppFor(61_000);
    comeBackOnScreen();
    expect(clockLabel()).toBe('00:00');
    expect(screen.getByText("Time's up")).toBeTruthy();
    expect(playAlarmBeeps).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(playAlarmBeeps).toHaveBeenCalledTimes(1);
  });

  it('does not beep for a timer that finished long before the app came back', () => {
    openTimer();
    fireEvent.click(screen.getByText('Start'));
    leaveAppFor(10 * 60_000);
    comeBackOnScreen();
    expect(screen.getByText("Time's up")).toBeTruthy();
    expect(playAlarmBeeps).not.toHaveBeenCalled();
  });

  it('keeps the stopwatch counting', () => {
    render(<ClockTimerModal onClose={() => {}} />);
    fireEvent.click(screen.getByText('Start'));
    leaveAppFor(125_000);
    comeBackOnScreen();
    expect(clockLabel()).toBe('02:05');
  });

  it('freezes the stopwatch while stopped', () => {
    render(<ClockTimerModal onClose={() => {}} />);
    fireEvent.click(screen.getByText('Start'));
    leaveAppFor(10_000);
    comeBackOnScreen();
    fireEvent.click(screen.getByText('Stop'));
    leaveAppFor(60_000);
    comeBackOnScreen();
    expect(clockLabel()).toBe('00:10');
  });

  it('keeps running after the popup is closed and opened again', () => {
    const { unmount } = render(<ClockTimerModal onClose={() => {}} />);
    fireEvent.click(screen.getByText('Start'));
    unmount();
    leaveAppFor(40_000);
    render(<ClockTimerModal onClose={() => {}} />);
    expect(clockLabel()).toBe('00:40');
  });

  it('pauses the timer where it was and resumes from there', () => {
    openTimer();
    fireEvent.click(screen.getByText('Start'));
    leaveAppFor(20_000);
    comeBackOnScreen();
    fireEvent.click(screen.getByText('Pause'));
    leaveAppFor(60_000);
    comeBackOnScreen();
    expect(clockLabel()).toBe('00:40');
    fireEvent.click(screen.getByText('Resume'));
    leaveAppFor(15_000);
    comeBackOnScreen();
    expect(clockLabel()).toBe('00:25');
  });
});
