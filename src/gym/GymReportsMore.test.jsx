import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GymReportsMore from './GymReportsMore';

const report = {
  success: true,
  exercises: [{ name: 'Bench Press', count: 12, lastMonth: 10, change: 20 }],
  muscles: [{ name: 'Chest', count: 40, lastMonth: 0, change: null }],
  months: [{ key: '2026-10', collected: 5000, joined: 3, retention: { 30: { kept: 2, of: 3, pct: 67 }, 60: null } }],
  leads: [{ source: 'instagram', enquiries: 4, trials: 2, joined: 1, pct: 25 }]
};

describe('GymReportsMore', () => {
  it('renders aggregates only', async () => {
    render(<GymReportsMore service={{ getOwnerReports: vi.fn(async () => report) }} />);
    expect(await screen.findByText('Bench Press')).toBeTruthy();
    expect(screen.getByText('+20%')).toBeTruthy();
    expect(screen.getByText('new')).toBeTruthy();
    expect(screen.getByText('67% (2 of 3)')).toBeTruthy();
    expect(screen.getByText('Instagram')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
  });

  it('shows the error', async () => {
    render(<GymReportsMore service={{ getOwnerReports: vi.fn(async () => ({ success: false, error: 'Nope' })) }} />);
    expect(await screen.findByText('Nope')).toBeTruthy();
  });

  it('renders nothing without a service', () => {
    const { container } = render(<GymReportsMore service={null} />);
    expect(container.textContent).toBe('');
  });
});
