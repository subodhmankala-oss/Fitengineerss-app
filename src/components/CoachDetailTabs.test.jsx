import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CoachDetailTabs from './CoachDetailTabs';

const statuses = { plans: '2 plans', livelog: '12:04', workout: 'Today', measurements: '70 kg' };
const original = window.matchMedia;
const setPhone = (phone) => {
  window.matchMedia = (query) => ({
    matches: phone && query.includes('max-width: 899px'),
    addEventListener: () => {},
    removeEventListener: () => {},
  });
};
const tabs = (props) => (
  <CoachDetailTabs active="plans" onSelect={() => {}} statuses={statuses} hasDot={() => false} {...props} />
);

describe('CoachDetailTabs', () => {
  beforeEach(() => setPhone(true));
  afterEach(() => { cleanup(); window.matchMedia = original; });

  it('phones: the same floating bottom tabs as the client app', () => {
    const onSelect = vi.fn();
    const { container } = render(tabs({ onSelect }));
    expect(document.querySelectorAll('.bottom-nav--coach .nav-item').length).toBe(4);
    expect(container.querySelector('.coach-tabs-track')).toBeNull();
    expect(screen.getByRole('button', { name: 'Plan' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Body' }));
    expect(onSelect).toHaveBeenCalledWith('measurements');
  });

  it('phones: marks the running clock and new updates', () => {
    render(tabs({ liveRunning: true, hasDot: (key) => key === 'workout' }));
    expect(screen.getByRole('button', { name: 'Log, running' }).querySelector('.nav-live-dot')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'History, new' }).querySelector('.nav-unread-dot')).toBeTruthy();
  });

  it('phones: out of the way while the coach menu covers the screen', () => {
    render(tabs({ hidden: true }));
    expect(document.querySelector('.bottom-nav')).toBeNull();
  });

  it('keeps the coach tour targets on both layouts', () => {
    const found = () => ['plans', 'livelog', 'workout'].every((k) => document.querySelector(`[data-tour="tc-tab-${k}"]`));
    render(tabs());
    expect(found()).toBe(true);
    cleanup();
    setPhone(false);
    render(tabs());
    expect(found()).toBe(true);
  });

  it('desktop: the status tabs stay at the top', () => {
    setPhone(false);
    render(tabs());
    expect(document.querySelector('.bottom-nav')).toBeNull();
    expect(screen.getByRole('tab', { name: /Measurements/ })).toBeTruthy();
    expect(screen.getByText('2 plans')).toBeTruthy();
  });
});
