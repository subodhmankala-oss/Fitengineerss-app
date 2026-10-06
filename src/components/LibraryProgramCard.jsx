import React from 'react';
import MuscleThumbnail, { FullBodyThumbnail } from './MuscleAnalytics/MuscleThumbnail';
import { getPlanCardMeta } from '../utils/planCardMeta';

const LEVEL_LABEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

// One Workout Library program row. The star sits beside (not inside) the
// card's button so tapping it favorites the program instead of starting it.
// showWhere adds "Gym · Beginner" to the meta line, for the top sections
// where programs from different tabs are mixed together.
export default function LibraryProgramCard({ workout, category, level, showWhere = false, isFavorite, onToggleFavorite, onStart }) {
  const exList = Array.isArray(workout.exercises) ? workout.exercises : [];
  const meta = getPlanCardMeta({ exercises: exList, planName: workout.name });
  return (
    <div className="wt-program-card-wrap">
      <button
        type="button"
        className={`wt-program-card wt-program-card--${level} wt-program-card--fav`}
        onClick={() => onStart(workout, level)}
      >
        <div className="wt-program-tile">
          {meta.muscles.length > 1 ? (
            <FullBodyThumbnail trainedMuscles={meta.muscles} view={meta.view} size={64} />
          ) : (
            <MuscleThumbnail muscle={meta.primaryMuscle} color={meta.color} size={64} />
          )}
        </div>
        <div className="wt-program-info">
          <div className="wt-program-name">{workout.name}</div>
          <div className="wt-program-meta">
            <span className={`wt-program-dot wt-program-dot--${level}`} />
            {showWhere && `${category === 'home' ? 'Home' : 'Gym'} · ${LEVEL_LABEL[level] || level} · `}
            {exList.length} exercise{exList.length === 1 ? '' : 's'}
          </div>
          {exList.length > 0 && (
            <div className="wt-program-preview">
              {exList.slice(0, 3).map(e => e.name).join(' · ')}{exList.length > 3 ? ` +${exList.length - 3}` : ''}
            </div>
          )}
        </div>
      </button>
      <button
        type="button"
        className={`wt-fav-btn${isFavorite ? ' active' : ''}`}
        aria-pressed={isFavorite}
        aria-label={isFavorite ? `Remove ${workout.name} from favorites` : `Add ${workout.name} to favorites`}
        onClick={() => onToggleFavorite(workout.id)}
      >
        {isFavorite ? '★' : '☆'}
      </button>
    </div>
  );
}
