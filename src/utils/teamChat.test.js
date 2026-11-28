import { describe, expect, it } from 'vitest';
import { buildChatBubbles, hasUnreadTeamMessage } from './teamChat';

describe('buildChatBubbles', () => {
  it('orders team messages and client messages by time', () => {
    const rows = [
      { id: 'a', kind: 'message', message: 'How was leg day?', createdAt: '2026-11-02T10:00:00Z', clientReply: 'Sore!', clientReplyAt: '2026-11-02T12:00:00Z' },
      { id: 'b', kind: 'client', message: '', clientReply: 'Bench weight?', clientReplyAt: '2026-11-01T09:00:00Z', createdAt: '2026-11-01T09:00:00Z' },
    ];
    expect(buildChatBubbles(rows).map(b => `${b.from}:${b.text}`)).toEqual([
      'me:Bench weight?', 'team:How was leg day?', 'me:Sore!',
    ]);
  });

  it('skips the old single-person welcome text but keeps the reply to it', () => {
    const rows = [{ id: 'w', kind: 'welcome', message: "Hi! I'm Subodh…", createdAt: '2026-11-01T09:00:00Z', clientReply: 'Thanks', clientReplyAt: '2026-11-01T09:05:00Z' }];
    expect(buildChatBubbles(rows).map(b => `${b.from}:${b.text}`)).toEqual(['me:Thanks']);
  });

  it('handles nothing', () => {
    expect(buildChatBubbles(null)).toEqual([]);
  });
});

describe('hasUnreadTeamMessage', () => {
  it('is true only for an unopened team-written message', () => {
    expect(hasUnreadTeamMessage([{ kind: 'message', readAt: null }])).toBe(true);
    expect(hasUnreadTeamMessage([{ kind: 'message', readAt: '2026-11-01' }])).toBe(false);
    expect(hasUnreadTeamMessage([{ kind: 'welcome', readAt: null }])).toBe(false);
    expect(hasUnreadTeamMessage([{ kind: 'client', readAt: null }])).toBe(false);
  });
});
