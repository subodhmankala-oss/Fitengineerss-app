import React, { useEffect, useState } from 'react';
import MuscleThumbnail from './MuscleThumbnail';

const MuscleCard = ({ stat, index = 0, onClick }) => {
  const { muscle, sets, volume, target, completionPercent, status } = stat;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const fillWidth = mounted ? Math.min(100, Math.max(0, completionPercent)) : 0;

  return (
    <div
      className="muscle-card muscle-card-tappable"
      style={{ animationDelay: `${Math.min(index * 45, 400)}ms` }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      aria-label={`${muscle} details`}
    >
      <div className="muscle-card-top">
        <span className={`status-${status.color}`}>
          <MuscleThumbnail muscle={muscle} color="var(--status-color)" size={40} />
        </span>
        <div className="muscle-card-title">
          <strong>{muscle}</strong>
          <span className={`muscle-status-pill status-${status.color}`}>
            {status.emoji} {status.label}
          </span>
        </div>
      </div>

      <div className="muscle-card-stats">
        <span className="muscle-sets-target">{sets} / {target} Target Sets</span>
        <span className="muscle-completion">{completionPercent}%</span>
      </div>

      <div className="muscle-progress-track">
        <div
          className={`muscle-progress-fill status-${status.color}`}
          style={{ width: `${fillWidth}%` }}
        />
      </div>

      <div className="muscle-volume-line">{volume.toLocaleString('en-IN')} kg volume this week</div>
    </div>
  );
};

export default MuscleCard;
