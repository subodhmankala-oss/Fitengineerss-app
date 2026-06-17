import React, { useState, useEffect } from 'react';
import databaseService from '../services/databaseService';
import './WorkoutProgressDashboard.css';

const WorkoutProgressDashboard = ({ handleLogout }) => {
  const [userName, setUserName] = useState('Warrior');
  const [timeframe, setTimeframe] = useState('weekly'); // 'weekly', 'daily', 'monthly'
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDateStr, setSelectedDateStr] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const storedName = localStorage.getItem('userName');
    if (storedName) setUserName(storedName);

    const loadLogs = async () => {
      setLoading(true);
      try {
        const userKey = storedName || localStorage.getItem('userName') || 'Warrior';
        const userLogs = await databaseService.getWorkoutLogsForUser(userKey);
        setLogs(userLogs || []);
      } catch (err) {
        console.error('Error loading workout progress logs:', err);
      } finally {
        setLoading(false);
      }
    };

    loadLogs();

    // Event listener for workout updates
    const handleWorkoutUpdate = () => {
      loadLogs();
    };
    window.addEventListener('workoutSessionsUpdated', handleWorkoutUpdate);
    window.addEventListener('workoutUpdated', handleWorkoutUpdate);

    return () => {
      window.removeEventListener('workoutSessionsUpdated', handleWorkoutUpdate);
      window.removeEventListener('workoutUpdated', handleWorkoutUpdate);
    };
  }, []);

  // Helpers for date calculations
  const getStartOfWeek = (d) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const start = new Date(date.setDate(diff));
    start.setHours(0, 0, 0, 0);
    return start;
  };

  const isToday = (dateStr) => {
    const today = new Date().toISOString().split('T')[0];
    return dateStr === today;
  };

  const getWeekDays = () => {
    const start = getStartOfWeek(new Date());
    const days = [];
    for (let i = 0; i < 7; i++) {
      const current = new Date(start);
      current.setDate(start.getDate() + i);
      days.push(current.toISOString().split('T')[0]);
    }
    return days;
  };

  const weekDays = getWeekDays();

  // Grouping logs by date
  const groupLogsByDate = (targetLogs) => {
    const grouped = {};
    targetLogs.forEach(log => {
      const date = log.log_date;
      if (!grouped[date]) {
        grouped[date] = {
          date: date,
          volume: 0,
          sets: 0,
          exercises: {}
        };
      }
      const weight = parseFloat(log.weight_kg) || 0;
      const reps = parseInt(log.reps) || 0;
      grouped[date].volume += weight * reps;
      grouped[date].sets += 1;

      if (!grouped[date].exercises[log.exercise_name]) {
        grouped[date].exercises[log.exercise_name] = [];
      }
      grouped[date].exercises[log.exercise_name].push({
        reps,
        weight
      });
    });
    return grouped;
  };

  const groupedLogs = groupLogsByDate(logs);

  // --- STATS CALCULATION ---
  // 1. Weekly stats
  const getWeeklyStats = () => {
    let totalVolume = 0;
    let totalSets = 0;
    let workoutsCount = 0;
    const dailySets = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    weekDays.forEach(day => {
      if (groupedLogs[day]) {
        totalVolume += groupedLogs[day].volume;
        totalSets += groupedLogs[day].sets;
        workoutsCount += 1;

        const dateObj = new Date(day);
        const dayOfWeekStr = dayNames[dateObj.getDay() === 0 ? 0 : dateObj.getDay()];
        // Map Sun -> Sun, Mon -> Mon, etc.
        const mappedName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        dailySets[mappedName] = groupedLogs[day].sets;
      }
    });

    return { totalVolume, totalSets, workoutsCount, dailySets };
  };

  const weeklyStats = getWeeklyStats();

  // 2. Daily stats
  const getDailyStats = () => {
    const dayData = groupedLogs[selectedDateStr];
    if (!dayData) {
      return { volume: 0, sets: 0, exercises: [] };
    }
    const exercisesList = Object.keys(dayData.exercises).map(name => ({
      name,
      sets: dayData.exercises[name]
    }));
    return {
      volume: dayData.volume,
      sets: dayData.sets,
      exercises: exercisesList
    };
  };

  const dailyStats = getDailyStats();

  // 3. Monthly stats (last 30 days)
  const getMonthlyStats = () => {
    let totalVolume = 0;
    let totalSets = 0;
    let workoutsCount = 0;
    const dailyVolumeHistory = []; // list of last 30 days volumes for graph
    const activeDates = new Set();

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const volume = groupedLogs[dateStr] ? groupedLogs[dateStr].volume : 0;
      const sets = groupedLogs[dateStr] ? groupedLogs[dateStr].sets : 0;

      if (groupedLogs[dateStr]) {
        totalVolume += volume;
        totalSets += sets;
        workoutsCount += 1;
        activeDates.add(dateStr);
      }

      dailyVolumeHistory.push({
        date: dateStr,
        dayNum: d.getDate(),
        volume: volume
      });
    }

    return { totalVolume, totalSets, workoutsCount, dailyVolumeHistory, activeDates };
  };

  const monthlyStats = getMonthlyStats();

  // --- SVG Charts Calculations ---
  // 1. Weekly Bar Chart Coordinates
  const renderWeeklyChart = () => {
    const keys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const values = keys.map(k => weeklyStats.dailySets[k]);
    const maxVal = Math.max(...values, 5); // floor of 5 sets for scale
    const height = 120;
    const width = 320;
    const barWidth = 24;
    const gap = 16;
    const paddingLeft = 25;
    
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="weekly-bar-chart-svg">
        {/* Grid lines */}
        <line x1="20" y1="20" x2={width} y2="20" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        <line x1="20" y1="60" x2={width} y2="60" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        <line x1="20" y1="100" x2={width} y2="100" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />

        {keys.map((day, idx) => {
          const val = weeklyStats.dailySets[day];
          const barHeight = (val / maxVal) * 80;
          const x = paddingLeft + idx * (barWidth + gap);
          const y = 100 - barHeight;

          return (
            <g key={day} className="bar-group">
              {/* Glowing Background */}
              {val > 0 && (
                <rect 
                  x={x} 
                  y={y} 
                  width={barWidth} 
                  height={barHeight} 
                  rx="4" 
                  fill="url(#emeraldGradient)" 
                  opacity="0.15" 
                  style={{ filter: 'blur(4px)' }}
                />
              )}
              {/* Front Bar */}
              <rect 
                x={x} 
                y={y} 
                width={barWidth} 
                height={barHeight} 
                rx="4" 
                fill={val > 0 ? 'url(#emeraldGradient)' : 'rgba(255,255,255,0.03)'} 
                className="chart-bar"
              />
              {/* Value Label */}
              {val > 0 && (
                <text x={x + barWidth/2} y={y - 6} textAnchor="middle" fill="var(--primary-accent-light)" fontSize="9" fontWeight="800">
                  {val}
                </text>
              )}
              {/* Day Label */}
              <text x={x + barWidth/2} y="115" textAnchor="middle" fill={val > 0 ? '#fff' : 'var(--text-muted)'} fontSize="9" fontWeight="600">
                {day}
              </text>
            </g>
          );
        })}
        
        <defs>
          <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
      </svg>
    );
  };

  // 2. Monthly Line Chart Coordinates
  const renderMonthlyChart = () => {
    const history = monthlyStats.dailyVolumeHistory;
    const values = history.map(h => h.volume);
    const maxVal = Math.max(...values, 100);
    const minVal = 0;
    const width = 320;
    const height = 120;
    const padding = 20;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const getX = (idx) => padding + (idx / 29) * chartWidth;
    const getY = (val) => padding + chartHeight - (val / maxVal) * chartHeight;

    let pathD = '';
    let areaD = `M ${getX(0)} ${padding + chartHeight}`;

    history.forEach((h, idx) => {
      const x = getX(idx);
      const y = getY(h.volume);
      if (idx === 0) {
        pathD += `M ${x} ${y}`;
      } else {
        pathD += ` L ${x} ${y}`;
      }
      areaD += ` L ${x} ${y}`;
    });
    areaD += ` L ${getX(29)} ${padding + chartHeight} Z`;

    const activeNodes = history.filter(h => h.volume > 0);

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="monthly-chart-svg">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid line guides */}
        <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
        <line x1={padding} y1={padding + chartHeight/2} x2={width - padding} y2={padding + chartHeight/2} stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
        <line x1={padding} y1={padding + chartHeight} x2={width - padding} y2={padding + chartHeight} stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />

        {/* Fill Area */}
        {values.some(v => v > 0) && (
          <path d={areaD} fill="url(#areaGradient)" />
        )}

        {/* Line */}
        {values.some(v => v > 0) ? (
          <path d={pathD} fill="none" stroke="var(--primary-accent-light)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <line x1={padding} y1={padding + chartHeight} x2={width - padding} y2={padding + chartHeight} stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" strokeDasharray="3 3" />
        )}

        {/* Highlight points on active days */}
        {activeNodes.map((node, idx) => {
          const origIdx = history.findIndex(h => h.date === node.date);
          const x = getX(origIdx);
          const y = getY(node.volume);
          return (
            <g key={node.date} className="node-group">
              <circle cx={x} cy={y} r="4" fill="var(--primary-accent-light)" stroke="var(--bg-card)" strokeWidth="1" />
            </g>
          );
        })}
      </svg>
    );
  };

  // 3. Calendar Grid (Hevy style)
  const renderCalendarHeatmap = () => {
    const cells = [];
    const activeDates = monthlyStats.activeDates;

    // Draw grid of last 30 days
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const isActive = activeDates.has(dateStr);
      const isSelected = dateStr === selectedDateStr;

      cells.push(
        <div 
          key={dateStr}
          className={`heatmap-cell ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
          onClick={() => {
            setSelectedDateStr(dateStr);
            setTimeframe('daily');
          }}
          title={`${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${isActive ? 'Workout logged 🏋️‍♂️' : 'Rest day ☕'}`}
        >
          <span className="cell-num">{d.getDate()}</span>
          {isActive && <span className="cell-dot">●</span>}
        </div>
      );
    }

    return (
      <div className="heatmap-grid-wrapper">
        <h4 className="heatmap-title">📅 30-Day Workout Frequency</h4>
        <div className="heatmap-grid">
          {cells}
        </div>
      </div>
    );
  };

  return (
    <div className="workout-progress-container animate-slide-up">
      {/* Top Header Panel */}
      <div className="dashboard-header-panel">
        <div className="profile-group">
          <div className="avatar-shield">🏋️‍♂️</div>
          <div className="profile-titles">
            <span className="welcome-span">Welcome back,</span>
            <h2 className="profile-name-text">{userName}</h2>
          </div>
        </div>
        <button className="btn-logout" onClick={handleLogout} title="Reset Profile/Log Out">
          <span className="logout-icon">⚙️</span>
        </button>
      </div>

      {/* Segment Timeframe Tab Switches */}
      <div className="timeframe-navigation">
        <button 
          className={`timeframe-btn ${timeframe === 'weekly' ? 'active' : ''}`} 
          onClick={() => setTimeframe('weekly')}
        >
          Weekly
        </button>
        <button 
          className={`timeframe-btn ${timeframe === 'daily' ? 'active' : ''}`} 
          onClick={() => setTimeframe('daily')}
        >
          Daily
        </button>
        <button 
          className={`timeframe-btn ${timeframe === 'monthly' ? 'active' : ''}`} 
          onClick={() => setTimeframe('monthly')}
        >
          Monthly
        </button>
      </div>

      {loading ? (
        <div className="dashboard-loading-box">
          <div className="loading-spinner"></div>
          <p>Analyzing progress history...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="empty-progress-card glass-panel">
          <div className="empty-icon">📊</div>
          <h3>Start Your Fitness Journey</h3>
          <p>No workout sessions logged yet. Head over to the Workout tab to log your first session!</p>
        </div>
      ) : (
        <div className="dashboard-content-scroll flex-col gap-4">
          
          {/* ─── WEEKLY VIEW CONTENT ─── */}
          {timeframe === 'weekly' && (
            <div className="timeframe-content flex-col gap-4">
              {/* Highlight Stats Row */}
              <div className="stats-row-cards">
                <div className="stat-card glass-panel">
                  <span className="card-label">Volume Lifted</span>
                  <strong className="card-value text-emerald">{weeklyStats.totalVolume.toLocaleString('en-IN')} <span className="value-unit">kg</span></strong>
                  <p className="card-sub">This week</p>
                </div>
                <div className="stat-card glass-panel">
                  <span className="card-label">Total Sets</span>
                  <strong className="card-value text-blue">{weeklyStats.totalSets} <span className="value-unit">sets</span></strong>
                  <p className="card-sub">This week</p>
                </div>
                <div className="stat-card glass-panel">
                  <span className="card-label">Workouts</span>
                  <strong className="card-value text-amber">{weeklyStats.workoutsCount} <span className="value-unit">done</span></strong>
                  <p className="card-sub">This week</p>
                </div>
              </div>

              {/* Weekly SVG Chart Widget */}
              <div className="chart-widget-card glass-panel">
                <div className="widget-header justify-between">
                  <h4>📊 Sets Completed per Weekday</h4>
                  <span className="trend-badge">Mon - Sun</span>
                </div>
                <div className="chart-wrapper">
                  {renderWeeklyChart()}
                </div>
              </div>
            </div>
          )}

          {/* ─── DAILY VIEW CONTENT ─── */}
          {timeframe === 'daily' && (
            <div className="timeframe-content flex-col gap-4">
              {/* Date selection bar */}
              <div className="date-picker-bar glass-panel">
                <label>Viewing stats for date:</label>
                <input 
                  type="date" 
                  value={selectedDateStr} 
                  onChange={(e) => setSelectedDateStr(e.target.value)}
                  className="progress-date-input"
                />
              </div>

              {/* Day stats card */}
              <div className="day-stats-overview glass-panel">
                <div className="overview-header justify-between">
                  <h3>
                    {isToday(selectedDateStr) ? 'Today\'s Progress' : new Date(selectedDateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </h3>
                  <span className="active-badge">{groupedLogs[selectedDateStr] ? '🏋️‍♂️ Workout Done' : '☕ Rest Day'}</span>
                </div>
                <div className="stats-row-cards mini mt-2">
                  <div className="stat-card inline">
                    <span className="lbl">Volume:</span>
                    <strong className="val text-emerald">{dailyStats.volume.toLocaleString('en-IN')} kg</strong>
                  </div>
                  <div className="stat-card inline">
                    <span className="lbl">Sets:</span>
                    <strong className="val text-blue">{dailyStats.sets} sets</strong>
                  </div>
                </div>

                {/* Day Exercise Breakdown */}
                {dailyStats.exercises.length > 0 ? (
                  <div className="daily-exercises-list mt-3">
                    <h4 className="section-subtitle">Exercise Sets Logged</h4>
                    <div className="ex-list-wrapper mt-2">
                      {dailyStats.exercises.map((ex, exIdx) => (
                        <div key={exIdx} className="daily-ex-card">
                          <div className="ex-title">{ex.name}</div>
                          <div className="ex-sets-badges mt-1">
                            {ex.sets.map((set, sIdx) => (
                              <span key={sIdx} className="ex-set-badge">
                                {set.weight}kg x {set.reps}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="no-daily-workouts mt-3">
                    <p>No workout session found on this date. Click on active green days in the monthly heatmap calendar to inspect previous workouts!</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── MONTHLY VIEW CONTENT ─── */}
          {timeframe === 'monthly' && (
            <div className="timeframe-content flex-col gap-4">
              {/* Highlight Stats Row */}
              <div className="stats-row-cards">
                <div className="stat-card glass-panel">
                  <span className="card-label">Monthly Volume</span>
                  <strong className="card-value text-emerald">{monthlyStats.totalVolume.toLocaleString('en-IN')} <span className="value-unit">kg</span></strong>
                  <p className="card-sub">Last 30 days</p>
                </div>
                <div className="stat-card glass-panel">
                  <span className="card-label">Monthly Sets</span>
                  <strong className="card-value text-blue">{monthlyStats.totalSets} <span className="value-unit">sets</span></strong>
                  <p className="card-sub">Last 30 days</p>
                </div>
                <div className="stat-card glass-panel">
                  <span className="card-label">Completed</span>
                  <strong className="card-value text-amber">{monthlyStats.workoutsCount} <span className="value-unit">workouts</span></strong>
                  <p className="card-sub">Last 30 days</p>
                </div>
              </div>

              {/* Heatmap Grid */}
              <div className="heatmap-widget-card glass-panel">
                {renderCalendarHeatmap()}
              </div>

              {/* Monthly Volume progression Line Chart */}
              <div className="chart-widget-card glass-panel">
                <div className="widget-header justify-between">
                  <h4>📈 Monthly Volume Overload Trend</h4>
                  <span className="trend-badge">Progression</span>
                </div>
                <div className="chart-wrapper">
                  {renderMonthlyChart()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkoutProgressDashboard;
