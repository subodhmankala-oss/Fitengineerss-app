// @vitest-environment jsdom
// connectClientToCoach routes a GYM code to the gym path and leaves 6-char
// coach invite codes on the coach path — including ones that happen to start
// with "GYM".
import { describe, it, expect, vi, afterEach } from 'vitest';
import databaseService from './databaseService';

describe('connectClientToCoach — gym codes', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['GYM-QFAP', 'gym-qfap', ' gym qfap ', 'GYMQFAP'])('routes %j to the gym path as GYM-QFAP', async (raw) => {
    const spy = vi.spyOn(databaseService, 'connectClientToGym').mockResolvedValue({ success: true, gymName: 'Test Gym' });
    const result = await databaseService.connectClientToCoach(raw);
    expect(spy).toHaveBeenCalledWith('GYM-QFAP');
    expect(result.gymName).toBe('Test Gym');
  });

  it('a 6-character coach code starting with GYM stays on the coach path', async () => {
    const gymSpy = vi.spyOn(databaseService, 'connectClientToGym');
    await databaseService.connectClientToCoach('GYMA3K');
    expect(gymSpy).not.toHaveBeenCalled();
  });
});
