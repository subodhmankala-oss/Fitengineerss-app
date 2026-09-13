import { describe, it, expect } from 'vitest';
import { getYouTubeEmbedUrl, normalizeExerciseForGuide, findExerciseGuideMatch } from './videoUtils';

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

describe('videoUtils: findExerciseGuideMatch', () => {
  it('matches exact, case-insensitive names', () => {
    const list = [{ name: 'Bench Press', video_url: 'a' }];
    expect(findExerciseGuideMatch(list, 'bench press')).toBe(list[0]);
  });

  it('matches names differing only by spacing/hyphen/case (squashed)', () => {
    const list = [{ name: 'Pullover', video_url: 'a' }];
    expect(findExerciseGuideMatch(list, 'Pull-Over')).toBe(list[0]);
  });

  it('matches a base name against a qualified library entry', () => {
    const list = [{ name: 'Bench Press (Barbell)', video_url: 'a' }];
    expect(findExerciseGuideMatch(list, 'Bench Press')).toBe(list[0]);
  });

  // Real mismatches found between the generic workout library (which uses
  // "<part> (<qualifier>)") and the admin exercise library (some of which
  // were saved as "<qualifier> <part>") — same movement, different word
  // order, previously showed no video despite one existing.
  it('matches the same words in a different order', () => {
    const list = [{ name: 'Standing Calf Raise', video_url: 'a' }];
    expect(findExerciseGuideMatch(list, 'Calf Raise (Standing)')).toBe(list[0]);
  });

  it('matches "Side Plank" against "Plank (Side)"', () => {
    const list = [{ name: 'Side Plank', video_url: 'a' }];
    expect(findExerciseGuideMatch(list, 'Plank (Side)')).toBe(list[0]);
  });

  it('matches "Seated Leg Curl" against "Leg Curl (Seated)"', () => {
    const list = [{ name: 'Seated Leg Curl', video_url: 'a' }];
    expect(findExerciseGuideMatch(list, 'Leg Curl (Seated)')).toBe(list[0]);
  });

  it('matches "Wide-Grip Lat Pulldown" against "Lat Pulldown (Wide Grip)"', () => {
    const list = [{ name: 'Wide-Grip Lat Pulldown', video_url: 'a' }];
    expect(findExerciseGuideMatch(list, 'Lat Pulldown (Wide Grip)')).toBe(list[0]);
  });

  it('returns null when nothing matches at any tier', () => {
    const list = [{ name: 'Bench Press', video_url: 'a' }];
    expect(findExerciseGuideMatch(list, 'Nonexistent Exercise')).toBeNull();
  });

  it('returns null for invalid inputs', () => {
    expect(findExerciseGuideMatch([], 'Bench Press')).toBeNull();
    expect(findExerciseGuideMatch(null, 'Bench Press')).toBeNull();
    expect(findExerciseGuideMatch([{ name: 'Bench Press' }], '')).toBeNull();
  });
});
