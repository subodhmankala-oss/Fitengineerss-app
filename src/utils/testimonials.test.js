import { describe, it, expect } from 'vitest';
import {
  cleanTestimonialInput, shortClientName, monthsTrained, trainedLabel, buildTestimonialAsk,
  MAX_QUOTE_LENGTH, MAX_RESULT_LENGTH,
} from './testimonials';

describe('cleanTestimonialInput', () => {
  it('trims both fields', () => {
    expect(cleanTestimonialInput({ quote: '  Great coach. ', result: ' Lost 8 kg ' }))
      .toEqual({ quote: 'Great coach.', result: 'Lost 8 kg' });
  });

  it('returns null without a quote', () => {
    expect(cleanTestimonialInput({ quote: '   ', result: 'Lost 8 kg' })).toBeNull();
    expect(cleanTestimonialInput(null)).toBeNull();
  });

  it('caps the lengths', () => {
    const out = cleanTestimonialInput({ quote: 'x'.repeat(MAX_QUOTE_LENGTH + 9), result: 'y'.repeat(MAX_RESULT_LENGTH + 9) });
    expect(out.quote).toHaveLength(MAX_QUOTE_LENGTH);
    expect(out.result).toHaveLength(MAX_RESULT_LENGTH);
  });
});

describe('shortClientName', () => {
  it('keeps the first name and the last initial', () => {
    expect(shortClientName('priya anand sharma')).toBe('priya S.');
    expect(shortClientName('Priya Sharma')).toBe('Priya S.');
    expect(shortClientName('Priya')).toBe('Priya');
    expect(shortClientName('  ')).toBe('Client');
  });
});

describe('monthsTrained', () => {
  const now = new Date('2026-10-24T12:00:00Z');
  it('counts whole months', () => {
    expect(monthsTrained('2026-06-24T00:00:00Z', now)).toBe(4);
    expect(monthsTrained('2026-06-25T00:00:00Z', now)).toBe(3);
    expect(monthsTrained('2026-10-20T00:00:00Z', now)).toBe(0);
  });
  it('is null for missing or future dates', () => {
    expect(monthsTrained(null, now)).toBeNull();
    expect(monthsTrained('not a date', now)).toBeNull();
    expect(monthsTrained('2027-01-01T00:00:00Z', now)).toBeNull();
  });
  it('labels', () => {
    expect(trainedLabel(0)).toBe('Training under a month');
    expect(trainedLabel(1)).toBe('Training 1 month');
    expect(trainedLabel(4)).toBe('Training 4 months');
    expect(trainedLabel(null)).toBe('');
  });
});

describe('buildTestimonialAsk', () => {
  it('greets by first name and links to the form', () => {
    expect(buildTestimonialAsk('Priya Sharma', 'https://app.test'))
      .toBe("Hi Priya! If training together has helped you, would you write a short testimonial for me? It takes a minute: https://app.test/?openTestimonial=1");
  });
});
