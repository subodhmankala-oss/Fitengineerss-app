// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TrainerProvider, useTrainer } from './TrainerContext';

vi.mock('../hooks/useTrainerData', () => {
  return {
    useTrainerData: vi.fn(() => ({
      superAdmin: true,
      resolvedCoachId: 'coach-123',
      clients: [{ id: 'client-1', userName: 'Vinay' }]
    }))
  };
});

function ConsumerComponent() {
  const { superAdmin, resolvedCoachId, clients } = useTrainer();
  return (
    <div>
      <span data-testid="admin-val">{superAdmin ? 'admin-yes' : 'admin-no'}</span>
      <span data-testid="coach-val">{resolvedCoachId}</span>
      <span data-testid="client-val">{clients[0]?.userName}</span>
    </div>
  );
}

describe('TrainerContext & TrainerProvider', () => {
  afterEach(cleanup);

  it('should pass context values down to nested consumer components', () => {
    render(
      <TrainerProvider loggedInEmail="admin@fitengineers.com" userRole="admin" handleLogout={() => {}}>
        <ConsumerComponent />
      </TrainerProvider>
    );

    expect(screen.getByTestId('admin-val').textContent).toBe('admin-yes');
    expect(screen.getByTestId('coach-val').textContent).toBe('coach-123');
    expect(screen.getByTestId('client-val').textContent).toBe('Vinay');
  });

  it('should throw an error when consumed outside of a Provider', () => {
    // Suppress console error output for this test since we expect an error to be thrown
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<ConsumerComponent />)).toThrow(
      'useTrainer must be used within a TrainerProvider'
    );

    errSpy.mockRestore();
  });
});
