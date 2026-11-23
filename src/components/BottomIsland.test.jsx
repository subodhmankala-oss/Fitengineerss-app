import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import BottomIsland from './BottomIsland';

afterEach(cleanup);

describe('BottomIsland', () => {
  it('marks only the open tab and slides the pill to it', () => {
    const { container, rerender } = render(<BottomIsland activeTab="home" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    expect(container.querySelector('.bottom-island-pill').style.getPropertyValue('--i')).toBe('0');

    rerender(<BottomIsland activeTab="profile" onSelect={() => {}} />);
    expect(container.querySelectorAll('[aria-current="page"]').length).toBe(1);
    expect(container.querySelector('.bottom-island-pill').style.getPropertyValue('--i')).toBe('2');
  });

  it('has no pill when the open screen is not one of the tabs', () => {
    const { container } = render(<BottomIsland activeTab="nutrition" onSelect={() => {}} />);
    expect(container.querySelector('.bottom-island-pill')).toBeNull();
  });

  it('reports the tapped tab by its app id', () => {
    const onSelect = vi.fn();
    render(<BottomIsland activeTab="home" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Workout' }));
    expect(onSelect).toHaveBeenCalledWith('workouts');
  });

  it('shows the unread dot on other tabs, not on the open one', () => {
    const { container } = render(
      <BottomIsland activeTab="profile" onSelect={() => {}} hasDot={(t) => t !== 'workouts'} />
    );
    expect(container.querySelectorAll('.nav-unread-dot').length).toBe(1);
    expect(screen.getByRole('button', { name: 'Home, new' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Profile' })).toBeTruthy();
  });
});
