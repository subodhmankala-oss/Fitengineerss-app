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
