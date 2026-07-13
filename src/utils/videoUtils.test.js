import { describe, it, expect } from 'vitest';
import { getYouTubeEmbedUrl, normalizeExerciseForGuide } from './videoUtils';

describe('videoUtils: getYouTubeEmbedUrl', () => {
  it('should parse standard watch URLs', () => {
    expect(getYouTubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(getYouTubeEmbedUrl('http://youtube.com/watch?v=dQw4w9WgXcQ&feature=related')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('should parse short share URLs', () => {
    expect(getYouTubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(getYouTubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=12')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('should parse Shorts URLs', () => {
    expect(getYouTubeEmbedUrl('https://youtube.com/shorts/MinlHnG7j4k?si=R-y0-W965FsCJNIN')).toBe('https://www.youtube.com/embed/MinlHnG7j4k');
    expect(getYouTubeEmbedUrl('https://www.youtube.com/shorts/MinlHnG7j4k')).toBe('https://www.youtube.com/embed/MinlHnG7j4k');
  });

  it('should parse direct embed paths', () => {
    expect(getYouTubeEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('should return empty string for non-YouTube URLs', () => {
    expect(getYouTubeEmbedUrl('/videos/shoulders-press.mp4')).toBe('');
    expect(getYouTubeEmbedUrl('https://google.com')).toBe('');
    expect(getYouTubeEmbedUrl('')).toBe('');
    expect(getYouTubeEmbedUrl(null)).toBe('');
  });
});

describe('videoUtils: normalizeExerciseForGuide', () => {
  it('should parse legacy preset exercise schema', () => {
    const legacy = {
      name: 'Biceps Curl',
      category: 'Arms',
      primary: 'Biceps Brachii',
      secondary: 'Forearms',
      videoFile: '/videos/biceps-curl.mp4',
      guide: {
        setup: 'Stand tall.',
        execution: 'Curl weights.',
        tip: 'No momentum.'
      }
    };
    const result = normalizeExerciseForGuide(legacy);
    expect(result.name).toBe('Biceps Curl');
    expect(result.category).toBe('Arms');
    expect(result.primary).toBe('Biceps Brachii');
    expect(result.secondary).toBe('Forearms');
    expect(result.videoFile).toBe('/videos/biceps-curl.mp4');
    expect(result.guide.setup).toBe('Stand tall.');
    expect(result.guide.execution).toBe('Curl weights.');
    expect(result.guide.tip).toBe('No momentum.');
  });

  it('should parse new database exercise schema', () => {
    const dbExercise = {
      name: 'Flat Bench Press',
      category: 'Chest',
      primary_muscle: 'Pectoralis Major',
      secondary_muscle: 'Triceps',
      video_url: 'https://supabase.co/bench.mp4',
      setup: 'Lie down on the bench.',
      execution: 'Press bar up.',
      tip: 'Keep feet flat.'
    };
    const result = normalizeExerciseForGuide(dbExercise);
    expect(result.name).toBe('Flat Bench Press');
    expect(result.category).toBe('Chest');
    expect(result.primary).toBe('Pectoralis Major');
    expect(result.secondary).toBe('Triceps');
    expect(result.videoFile).toBe('https://supabase.co/bench.mp4');
    expect(result.guide.setup).toBe('Lie down on the bench.');
    expect(result.guide.execution).toBe('Press bar up.');
    expect(result.guide.tip).toBe('Keep feet flat.');
  });

  it('should handle missing fields with safe fallbacks', () => {
    const empty = {
      name: 'Pushups',
      category: 'Chest'
    };
    const result = normalizeExerciseForGuide(empty);
    expect(result.name).toBe('Pushups');
    expect(result.category).toBe('Chest');
    expect(result.primary).toBe('Chest'); // falls back to category
    expect(result.secondary).toBe('');
    expect(result.videoFile).toBe('');
    expect(result.guide.setup).toBe('');
    expect(result.guide.execution).toBe('');
    expect(result.guide.tip).toBe('');
  });

  it('should return null for invalid inputs', () => {
    expect(normalizeExerciseForGuide(null)).toBeNull();
    expect(normalizeExerciseForGuide(undefined)).toBeNull();
  });
});
