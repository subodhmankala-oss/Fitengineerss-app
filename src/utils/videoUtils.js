// Video and Form Guide Utility Helpers

/**
 * Extracts the YouTube video ID from standard links and returns an embeddable URL.
 * Supports standard watch links, youtu.be short links, and embed paths.
 * 
 * @param {string} url - The raw video URL
 * @returns {string} The formatted YouTube embed URL, or an empty string if not a YouTube link.
 */
export const getYouTubeEmbedUrl = (url) => {
  if (!url) return '';
  
  // Try matching Shorts format first
  const shortsRegExp = /^.*youtube\.com\/shorts\/([^#\&\?\/]+).*/;
  const shortsMatch = url.match(shortsRegExp);
  if (shortsMatch && shortsMatch[1].length === 11) {
    return `https://www.youtube.com/embed/${shortsMatch[1]}`;
  }

  // Fallback to standard YouTube regex
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) 
    ? `https://www.youtube.com/embed/${match[2]}`
    : '';
};

// Squash a name down to just its letters/digits, lowercased — collapses
// case, spacing, hyphen, and punctuation differences ("Pull Over" /
// "Pull-Over" / "pullover" all squash to the same string).
const squash = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Finds a logged/planned exercise's matching entry in the curated exercise
 * library (the one with real video_url/setup/execution/tip data), used to
 * open the Form Guide. A plain case-insensitive `.find()` was the only
 * lookup here before — reliable when the logged name is byte-for-byte
 * identical to the library entry, but a coach typing "Pull over" against a
 * library entry saved as "Pullover" (or any other spacing/hyphen/case
 * difference) silently missed, and the client saw the generic no-video
 * fallback even though a real video existed. This tries progressively
 * looser matches instead of giving up after the first exact-match miss:
 *   1. Exact, case-insensitive (unchanged from before).
 *   2. Squashed — same letters, different spacing/punctuation/case.
 *   3. Base-name — the logged name has no variant qualifier ("Bench
 *      Press") but the library only has qualified versions ("Bench Press
 *      (Barbell)") — showing *a* real video beats showing none.
 * Returns null if nothing matches at any tier (still falls through to the
 * generic guide, same as before).
 */
export function findExerciseGuideMatch(list, name) {
  if (!name || !Array.isArray(list) || list.length === 0) return null;
  const target = name.trim().toLowerCase();

  let match = list.find(pe => (pe.name || '').trim().toLowerCase() === target);
  if (match) return match;

  const targetSquashed = squash(name);
  match = list.find(pe => squash(pe.name) === targetSquashed);
  if (match) return match;

  match = list.find(pe => squash((pe.name || '').replace(/\(.*?\)/g, '')) === targetSquashed);
  return match || null;
}

/**
 * Normalizes an exercise object into a standard format used by guide bottom sheets.
 * Handles both the legacy local presets schema and the database exercises schema.
 * 
 * @param {object} ex - The raw exercise object
 * @returns {object} The normalized exercise object with standard fields
 */
export const normalizeExerciseForGuide = (ex) => {
  if (!ex) return null;
  const video = ex.video_url || ex.videoFile || '';
  const setupVal = ex.setup || ex.guide?.setup || '';
  const executionVal = ex.execution || ex.guide?.execution || '';
  const tipVal = ex.tip || ex.guide?.tip || '';
  
  return {
    name: ex.name,
    category: ex.category,
    primary: ex.primary_muscle || ex.primary || ex.category,
    secondary: ex.secondary_muscle || ex.secondary || '',
    videoFile: video,
    guide: {
      target: ex.primary_muscle || ex.primary || ex.category,
      setup: setupVal,
      execution: executionVal,
      tip: tipVal
    }
  };
};
