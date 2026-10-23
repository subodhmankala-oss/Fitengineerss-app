import { describe, it, expect } from 'vitest';
import { rateLimitWaitMs } from './generate-workout-draft.js';

describe('rateLimitWaitMs', () => {
  it('reads the wait out of Groq\'s 429 message', () => {
    const msg = 'Rate limit reached for model `openai/gpt-oss-120b` ... on tokens per minute (TPM): Limit 8000, Used 5980, Requested 2168. Please try again in 1.109999999s. Need more tokens?';
    expect(rateLimitWaitMs(msg)).toBe(1360);
  });

  it('handles minutes and milliseconds', () => {
    expect(rateLimitWaitMs('Please try again in 2m3.5s.')).toBe(123750);
    expect(rateLimitWaitMs('Please try again in 450ms.')).toBe(700);
  });

  it('falls back to the retry-after header, else null', () => {
    expect(rateLimitWaitMs('Rate limit reached', '3')).toBe(3250);
    expect(rateLimitWaitMs('Rate limit reached', null)).toBeNull();
  });
});
