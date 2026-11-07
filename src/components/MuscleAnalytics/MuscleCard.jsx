import React, { useEffect, useState } from 'react';
import MuscleThumbnail from './MuscleThumbnail';

const MuscleCard = ({ stat, index = 0, onClick, period = 'week' }) => {
  const { muscle, sets, volume, target, completionPercent, status } = stat;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const fillWidth = mounted ? Math.min(100, Math.max(0, completionPercent)) : 0;

  return (
    <div
      className={`muscle-card muscle-card-tappable status-${status.color}`}
      style={{ animationDelay: `${Math.min(index * 45, 400)}ms` }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      aria-label={`${muscle} details`}
    >
      {/* Quiet tile: picture and % on top, name, status dot, thin bar,
          sets and volume. */}
      <div className="muscle-card-top">
        <MuscleThumbnail muscle={muscle} color="var(--status-color)" size={32} />
        <span className="muscle-completion">{completionPercent}%</span>
      </div>

      <div className="muscle-card-title">
        <strong>{muscle}</strong>
        <span className="muscle-status-pill">
          <span className="muscle-status-dot" aria-hidden="true" />
          {status.label}
        </span>
      </div>

      <div className="muscle-card-bottom">
        <div className="muscle-progress-track">
          <div className="muscle-progress-fill" style={{ width: `${fillWidth}%` }} />
        </div>
        <span className="muscle-sets-target">{sets} / {target} {period === 'month' ? 'avg/wk' : 'sets'}</span>
        {/* "this week/month" doesn't fit a third-width card; the Week/Month
            chips above already say which. */}
        <span className="muscle-volume-line">{volume.toLocaleString('en-IN')} kg volume</span>
      </div>
    </div>
  );
};

export default MuscleCard;
