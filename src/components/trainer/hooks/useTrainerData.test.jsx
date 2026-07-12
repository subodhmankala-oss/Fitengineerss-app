// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { useTrainerData } from './useTrainerData';
import databaseService from '../../../services/databaseService';

vi.mock('../../../services/databaseService', () => {
  return {
    default: {
      getAllCoaches: vi.fn(),
      getPlatformStats: vi.fn(),
      getPendingCoachApplications: vi.fn(),
      getExerciseLibrary: vi.fn(),
      getAllUsersWithRoles: vi.fn(),
      resolveUserId: vi.fn(),
      getAllUsers: vi.fn(),
      getWorkoutSummaryForCoach: vi.fn(),
      setCoachBlocked: vi.fn(),
      rejectCoach: vi.fn(),
      refreshLocalCoaches: vi.fn(),
      supabase: null
    },
    isSuperAdmin: vi.fn((email) => email === 'admin@fitengineers.com'),
    isSupabaseConfigured: false
  };
});

describe('useTrainerData hook', () => {
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    databaseService.resolveUserId.mockResolvedValue('coach-1');
    databaseService.getAllUsers.mockResolvedValue([
      { id: 'client-1', userName: 'Jaswanth', email: 'jash@gmail.com' }
    ]);
    databaseService.getWorkoutSummaryForCoach.mockResolvedValue([]);
  });

  afterEach(cleanup);

  it('should initialize states with defaults', async () => {
    const { result } = renderHook(() =>
      useTrainerData({
        loggedInEmail: 'coach@fitengineers.com',
        userRole: 'coach',
        handleLogout: mockLogout
      })
    );

    expect(result.current.superAdmin).toBe(false);
    expect(result.current.loadingAdmin).toBe(false);
    expect(result.current.loadingClients).toBe(true);

    await waitFor(() => {
      expect(result.current.clients).toHaveLength(1);
      expect(result.current.loadingClients).toBe(false);
    });
  });

  it('should resolve coach id on mount', async () => {
    const { result } = renderHook(() =>
      useTrainerData({
        loggedInEmail: 'coach@fitengineers.com',
        userRole: 'coach',
        handleLogout: mockLogout
      })
    );

    await waitFor(() => {
      expect(result.current.resolvedCoachId).toBe('coach-1');
    });
  });

  it('should identify superAdmin and fetch admin data', async () => {
    databaseService.getAllCoaches.mockResolvedValue([{ id: 'c1', name: 'Ravi' }]);
    databaseService.getPlatformStats.mockResolvedValue({ totalActiveClients: 5 });
    databaseService.getPendingCoachApplications.mockResolvedValue([]);
    databaseService.getExerciseLibrary.mockResolvedValue(new Array(204));
    databaseService.getAllUsersWithRoles.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useTrainerData({
        loggedInEmail: 'admin@fitengineers.com',
        userRole: 'super-admin',
        handleLogout: mockLogout
      })
    );

    expect(result.current.superAdmin).toBe(true);

    result.current.fetchAdminData();

    await waitFor(() => {
      expect(result.current.coachesList).toHaveLength(1);
      expect(result.current.platformStats.totalActiveClients).toBe(5);
      expect(result.current.exerciseCount).toBe(204);
    });
  });
});
