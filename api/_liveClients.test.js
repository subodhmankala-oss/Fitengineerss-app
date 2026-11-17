import { describe, it, expect } from 'vitest';
import { liveUserIds, liveSince, LIVE_WINDOW_MINUTES } from './_liveClients.js';

const NOW = Date.parse('2026-11-18T10:00:00Z');
const ago = min => new Date(NOW - min * 60 * 1000).toISOString();

describe('liveUserIds', () => {
  it('counts a running draft saved a few minutes ago', () => {
    expect(liveUserIds([{ user_id: 'a', timer_status: 'running', updated_at: ago(3) }], NOW)).toEqual(['a']);
  });

  it(`ignores a running draft older than ${LIVE_WINDOW_MINUTES} minutes (abandoned session)`, () => {
    expect(liveUserIds([{ user_id: 'a', timer_status: 'running', updated_at: ago(LIVE_WINDOW_MINUTES + 1) }], NOW)).toEqual([]);
  });

  it('ignores paused and idle drafts', () => {
    expect(liveUserIds([
      { user_id: 'a', timer_status: 'paused', updated_at: ago(1) },
      { user_id: 'b', timer_status: 'idle', updated_at: ago(1) },
    ], NOW)).toEqual([]);
  });

  it('lists a client once when both their own and the coach draft are live', () => {
    expect(liveUserIds([
      { user_id: 'a', timer_status: 'running', updated_at: ago(2) },
      { user_id: 'a', timer_status: 'running', updated_at: ago(5) },
    ], NOW)).toEqual(['a']);
  });

  it('survives junk input', () => {
    expect(liveUserIds(null, NOW)).toEqual([]);
    expect(liveUserIds([{ user_id: 'a', timer_status: 'running', updated_at: 'nope' }], NOW)).toEqual([]);
  });

  it('liveSince is the window start', () => {
    expect(liveSince(NOW)).toBe(ago(LIVE_WINDOW_MINUTES));
  });
});
