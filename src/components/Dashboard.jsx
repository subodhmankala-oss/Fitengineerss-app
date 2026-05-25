import './Dashboard.css';
import QuickTracker from './QuickTracker';

const Dashboard = ({ setActiveTab }) => {
  return (
    <div className="dashboard-container">
      {/* Background Gradient Area mimicking the top of the reference image */}
      <div className="top-gradient-bg"></div>

      <div className="dashboard-content">
        <header className="dashboard-header light-mode">
          <h1 className="greeting-large dark-text">Good Morning</h1>
        </header>

        {/* The Exact Reference Widget */}
        <div className="widget-overlay">
          <QuickTracker />
          
          <div className="logs-header-container">
            <h2 className="logs-title">Today's Logs</h2>
          </div>
        </div>

        <div className="overview-grid mt-4">
        {/* Nutrition Summary Card */}
        <div className="glass-panel summary-card" onClick={() => setActiveTab('nutrition')}>
          <div className="card-header">
            <h3>Nutrition Summary</h3>
            <span className="card-icon">🥗</span>
          </div>
          <div className="progress-circle">
            <div className="chart-container">
              <svg viewBox="0 0 36 36" className="circular-chart primary">
                <path className="circle-bg" fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path className="circle" fill="none" strokeDasharray="65, 100"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="chart-content">
                <span className="cals-number">850</span>
                <span className="cals-label">kcal</span>
              </div>
            </div>
            <div className="target-text">Goal: 1300</div>
          </div>
          <p className="card-action-text" onClick={(e) => { e.stopPropagation(); setActiveTab('nutrition'); }}>Log Meals ➔</p>
        </div>

        {/* Training Summary Card */}
        <div className="glass-panel summary-card" onClick={() => setActiveTab('training')}>
          <div className="card-header">
            <h3>Today's Training</h3>
            <span className="card-icon">🏋️</span>
          </div>
          <div className="training-preview">
            <div className="activity-item">
              <div className="dot in-person"></div>
              <span>Face-to-Face: Upper Body</span>
            </div>
            <div className="activity-item">
              <div className="dot remote"></div>
              <span>Mobility: 15min Flow</span>
            </div>
          </div>
          <button className="btn-primary start-workout-btn">View Plan</button>
        </div>

        {/* Content Highlights Card */}
        <div className="glass-panel summary-card content-highlight" onClick={() => setActiveTab('content')}>
          <div className="card-header">
            <h3>Coach's Corner</h3>
            <span className="card-icon">📱</span>
          </div>
          <div className="content-hero">
            <div className="thumb-placeholder custom-comic"></div>
            <div className="content-title">Why Form Matters: Deadlift Comic #4</div>
          </div>
          <p className="card-action-text">Read More ➔</p>
        </div>
      </div>

      </div>

      {/* Floating Action Button (Sparkle icon reference) */}
      <div className="fab-sparkle">✨</div>
    </div>
  );
};

export default Dashboard;
