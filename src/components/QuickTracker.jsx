import './QuickTracker.css';

// Using SVG paths to match the exact minimalist line-art icons from the image
const icons = {
  weight: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="4" width="14" height="16" rx="3" ry="3"></rect>
      <circle cx="12" cy="9" r="2"></circle>
      <line x1="8" y1="16" x2="16" y2="16"></line>
    </svg>
  ),
  workout: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c-2.26-1.59-3-5-3-5s6 1.3 6 6a4.5 4.5 0 0 1-9 0c0-1.87 1.25-3.32 2.5-4z"></path>
    </svg>
  ),
  steps: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 10a4 4 0 0 0-8 0c0 4 8 11 8 11s8-7 8-11a4 4 0 0 0-8 0z"></path>
      <path d="M12 10v4"></path>
      <path d="M8 10v2"></path>
      <path d="M16 10v2"></path>
    </svg>
  ),
  sleep: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>
  ),
  water: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4h8"></path>
      <path d="M9 4v13a3 3 0 0 0 6 0V4"></path>
      <line x1="12" y1="11" x2="12" y2="17"></line>
    </svg>
  )
};

const QuickTracker = () => {
  return (
    <div className="quick-tracker-wrapper">
      <div className="drag-handle"></div>

      <div className="tracker-list">
        {/* Weight */}
        <div className="tracker-item">
          <div className="tracker-icon-bg bg-weight">{icons.weight}</div>
          <div className="tracker-info">
            <span className="tracker-title">Weight</span>
            <span className="tracker-subtitle">0 kg gained</span>
          </div>
          <div className="tracker-action">
            <button className="action-circle-btn">+</button>
          </div>
        </div>

        {/* Workout */}
        <div className="tracker-item">
          <div className="tracker-icon-bg bg-workout">{icons.workout}</div>
          <div className="tracker-info">
            <span className="tracker-title">Workout</span>
            <span className="tracker-subtitle">Goal: 468 cal</span>
          </div>
          <div className="tracker-action">
            <button className="action-circle-btn">+</button>
          </div>
        </div>

        {/* Steps */}
        <div className="tracker-item">
          <div className="tracker-icon-bg bg-steps">{icons.steps}</div>
          <div className="tracker-info">
            <span className="tracker-title">Steps</span>
            <span className="tracker-subtitle">Set Up Auto-Tracking</span>
          </div>
          <div className="tracker-action">
            <span className="action-arrow">›</span>
          </div>
        </div>

        {/* Sleep */}
        <div className="tracker-item">
          <div className="tracker-icon-bg bg-sleep">{icons.sleep}</div>
          <div className="tracker-info">
            <span className="tracker-title">Sleep</span>
            <span className="tracker-subtitle">Goal: 8hr</span>
          </div>
          <div className="tracker-action">
            <span className="action-sync">↻</span>
          </div>
        </div>

        {/* Water */}
        <div className="tracker-item">
          <div className="tracker-icon-bg bg-water">{icons.water}</div>
          <div className="tracker-info">
            <span className="tracker-title">Water</span>
            <span className="tracker-subtitle">Goal: 8 glasses</span>
          </div>
          <div className="tracker-action">
            <button className="action-circle-btn">+</button>
          </div>
        </div>

        {/* Track More */}
        <div className="tracker-item">
          <div className="tracker-icon-bg bg-track-more">
            <span className="green-plus">+</span>
          </div>
          <div className="tracker-info">
            <span className="tracker-title green-text">Track More</span>
          </div>
        </div>
      </div>

      <div className="collapse-arrow-container">
        <div className="collapse-arrow"></div>
      </div>
    </div>
  );
};

export default QuickTracker;
