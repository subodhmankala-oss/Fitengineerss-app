import React, { useState, useEffect } from 'react';
import databaseService from '../services/databaseService';
import './WorkoutProgressDashboard.css';

const WorkoutProgressDashboard = ({ handleLogout }) => {
  const [userName, setUserName] = useState('Warrior');
  const [timeframe, setTimeframe] = useState('weekly'); // 'weekly', 'daily', 'monthly'
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDateStr, setSelectedDateStr] = useState(new Date().toISOString().split('T')[0]);
  const [sessionsTotal, setSessionsTotal] = useState(() => {
    const cachedLimit = localStorage.getItem('userSessionsLimit');
    return cachedLimit ? parseInt(cachedLimit) : 24;
  });

  useEffect(() => {
    const storedName = localStorage.getItem('userName');
    if (storedName) setUserName(storedName);

    const loadLogs = async () => {
      setLoading(true);
      try {
        // Prefer Supabase UUID for exact match; fallback to name
        const userId = localStorage.getItem('userId');
        const userKey = userId || storedName || localStorage.getItem('userName') || 'Warrior';
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
          exercises: {},
          planName: log.plan_name || log.planName || ''
        };
      }
      
      if (!grouped[date].planName && (log.plan_name || log.planName)) {
        grouped[date].planName = log.plan_name || log.planName;
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

    // Set fallback if still empty
    Object.keys(grouped).forEach(date => {
      if (!grouped[date].planName) {
        grouped[date].planName = 'Custom Routine';
      }
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

  // --- ADDITIONAL HOMEPAGE STATS ---
  // Total sessions done (all time)
  const getTotalSessionsDone = () => {
    const uniqueDates = new Set(logs.map(l => l.log_date));
    return uniqueDates.size;
  };

  // Best weight lifted this week
  const getBestWeightThisWeek = () => {
    let best = 0;
    let bestExercise = '';
    weekDays.forEach(day => {
      if (groupedLogs[day]) {
        Object.entries(groupedLogs[day].exercises).forEach(([exName, sets]) => {
          sets.forEach(s => {
            if (s.weight > best) {
              best = s.weight;
              bestExercise = exName;
            }
          });
        });
      }
    });
    return { weight: best, exercise: bestExercise };
  };

  // Best workout of the week (highest volume day)
  const getBestWorkoutOfWeek = () => {
    let bestDay = '';
    let bestVolume = 0;
    weekDays.forEach(day => {
      if (groupedLogs[day] && groupedLogs[day].volume > bestVolume) {
        bestVolume = groupedLogs[day].volume;
        bestDay = day;
      }
    });
    if (!bestDay) return { dayName: '—', volume: 0 };
    const dayName = new Date(bestDay).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return { dayName, volume: bestVolume };
  };

  const totalSessionsDone = getTotalSessionsDone();
  const bestWeight = getBestWeightThisWeek();
  const bestWorkout = getBestWorkoutOfWeek();

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
              {/* Single Prominent Sessions Done Progress Card */}
              {(() => {
                const percentComplete = Math.min(100, Math.round((totalSessionsDone / sessionsTotal) * 100));
                return (
                  <div className="sessions-progress-card glass-panel animate-scale-in" style={{
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(16, 185, 129, 0.05))',
                    border: '1px solid rgba(139, 92, 246, 0.25)',
                    borderRadius: '16px',
                    padding: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '20px',
                    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    {/* Decorative background glow */}
                    <div style={{
                      position: 'absolute',
                      top: '-50%',
                      right: '-10%',
                      width: '180px',
                      height: '180px',
                      borderRadius: '50%',
                      background: 'rgba(139, 92, 246, 0.25)',
                      filter: 'blur(40px)',
                      pointerEvents: 'none'
                    }}></div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 1 }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coaching Program Progress</span>
                      <h3 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>
                        {totalSessionsDone} <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 500 }}>of</span> {sessionsTotal}
                      </h3>
                      <span style={{ fontSize: '0.85rem', color: 'var(--primary-accent-light)', fontWeight: 700 }}>
                        {percentComplete}% Completed
                      </span>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                        {totalSessionsDone >= sessionsTotal 
                          ? 'Congratulations! You have completed your coaching package! 🎉' 
                          : `${sessionsTotal - totalSessionsDone} sessions remaining in your active program.`}
                      </p>
                    </div>

                    {/* Circular Progress Ring */}
                    <div style={{ position: 'relative', width: '90px', height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                      <svg width="90" height="90" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                        <circle 
                          cx="50" 
                          cy="50" 
                          r="40" 
                          fill="transparent" 
                          stroke="rgba(255, 255, 255, 0.05)" 
                          strokeWidth="8" 
                        />
                        <circle 
                          cx="50" 
                          cy="50" 
                          r="40" 
                          fill="transparent" 
                          stroke="url(#progressGradient)" 
                          strokeWidth="8" 
                          strokeDasharray={`${2 * Math.PI * 40}`}
                          strokeDashoffset={`${2 * Math.PI * 40 * (1 - percentComplete / 100)}`}
                          strokeLinecap="round"
                          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
                        />
                        <defs>
                          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="var(--primary-accent-light)" />
                            <stop offset="100%" stopColor="#10b981" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div style={{ position: 'absolute', fontSize: '0.95rem', fontWeight: 800, color: '#fff' }}>
                        {percentComplete}%
                      </div>
                    </div>
                  </div>
                );
              })()}

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

              {/* ── This Week's Sessions ── */}
              <div className="chart-widget-card glass-panel">
                <div className="widget-header justify-between" style={{ marginBottom: '12px' }}>
                  <h4>🗂️ This Week's Sessions</h4>
                  <span className="trend-badge">{weeklyStats.workoutsCount} days active</span>
                </div>
                {weeklyStats.workoutsCount === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '16px 0' }}>
                    No workouts logged this week yet. Start logging! 💪
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {weekDays.filter(day => groupedLogs[day]).map(day => {
                      const session = groupedLogs[day];
                      const exercises = Object.entries(session.exercises);
                      const dateLabel = new Date(day + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                      return (
                        <div
                          key={day}
                          onClick={() => { setSelectedDateStr(day); setTimeframe('daily'); }}
                          style={{
                            background: 'rgba(0,0,0,0.15)',
                            border: isToday(day) ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 'var(--radius-md)',
                            padding: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.15)'}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: isToday(day) ? 'var(--primary-accent-light)' : '#fff' }}>
                                📅 {dateLabel}{isToday(day) ? ' · Today' : ''}
                              </div>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2.5px' }}>
                                📋 {session.planName || 'Custom Routine'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <span style={{ fontSize: '0.68rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--primary-accent-light)', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                {session.sets} sets
                              </span>
                              <span style={{ fontSize: '0.68rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                {session.volume.toLocaleString('en-IN')} kg
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                            {exercises.map(([exName, sets], exIdx) => (
                              <span key={exIdx} style={{
                                fontSize: '0.7rem',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                padding: '2px 8px',
                                borderRadius: '20px',
                                color: 'var(--text-muted)'
                              }}>
                                {exName} · {sets.length}s
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── DAILY VIEW CONTENT ─── */}
          {timeframe === 'daily' && (
            <div className="timeframe-content flex-col gap-4">
              {/* Date navigation bar */}
              <div className="date-picker-bar glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  onClick={() => {
                    const d = new Date(selectedDateStr);
                    d.setDate(d.getDate() - 1);
                    setSelectedDateStr(d.toISOString().split('T')[0]);
                  }}
                  style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '1rem' }}
                >
                  ‹
                </button>
                <input
                  type="date"
                  value={selectedDateStr}
                  onChange={(e) => setSelectedDateStr(e.target.value)}
                  className="progress-date-input"
                  style={{ flex: 1 }}
                />
                <button
                  onClick={() => {
                    const d = new Date(selectedDateStr);
                    d.setDate(d.getDate() + 1);
                    const next = d.toISOString().split('T')[0];
                    if (next <= new Date().toISOString().split('T')[0]) {
                      setSelectedDateStr(next);
                    }
                  }}
                  style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '1rem' }}
                >
                  ›
                </button>
              </div>

              {/* Day stats card */}
              <div className="day-stats-overview glass-panel">
                <div className="overview-header justify-between">
                  <h3>
                    {isToday(selectedDateStr) ? "Today's Progress" : new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
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
                  <div className="stat-card inline">
                    <span className="lbl">Exercises:</span>
                    <strong className="val" style={{ color: '#a78bfa' }}>{dailyStats.exercises.length}</strong>
                  </div>
                </div>

                {/* Day Exercise Breakdown — detailed cards */}
                {dailyStats.exercises.length > 0 ? (
                  <div className="daily-exercises-list mt-3">
                    <h4 className="section-subtitle">Exercise Sets Logged</h4>
                    <div className="ex-list-wrapper mt-2">
                      {dailyStats.exercises.map((ex, exIdx) => (
                        <div key={exIdx} className="daily-ex-card" style={{ marginBottom: '10px' }}>
                          <div className="ex-title" style={{ marginBottom: '6px' }}>{ex.name}</div>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <th style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', padding: '3px 0', textAlign: 'left' }}>Set</th>
                                <th style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', padding: '3px 0', textAlign: 'left' }}>Weight</th>
                                <th style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', padding: '3px 0', textAlign: 'left' }}>Reps</th>
                                <th style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', padding: '3px 0', textAlign: 'left' }}>Vol</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ex.sets.map((set, sIdx) => (
                                <tr key={sIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                  <td style={{ padding: '5px 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:'20px', height:'20px', borderRadius:'50%', background:'rgba(255,255,255,0.06)', fontSize:'0.68rem', fontWeight:800, color:'#fff' }}>{sIdx+1}</span>
                                  </td>
                                  <td style={{ padding: '5px 0', fontSize: '0.82rem', color: '#fff', fontWeight: 600 }}>{set.weight} kg</td>
                                  <td style={{ padding: '5px 0', fontSize: '0.82rem', color: '#fff' }}>{set.reps} reps</td>
                                  <td style={{ padding: '5px 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{(set.weight * set.reps).toFixed(0)} kg</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="no-daily-workouts mt-3">
                    <p>No workout session found on this date.<br/>Use ‹ › to navigate days, or switch to Monthly view to click on an active day.</p>
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

              {/* ── Full Workout History List ── */}
              <div className="chart-widget-card glass-panel">
                <div className="widget-header justify-between" style={{ marginBottom: '12px' }}>
                  <h4>📋 Full Workout History</h4>
                  <span className="trend-badge">{totalSessionsDone} sessions</span>
                </div>
                {(() => {
                  // Build sorted sessions list from all logs
                  const allDates = Object.keys(groupedLogs).sort((a, b) => new Date(b) - new Date(a));
                  if (allDates.length === 0) {
                    return <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '16px 0' }}>No sessions logged yet.</p>;
                  }
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {allDates.map(date => {
                        const session = groupedLogs[date];
                        const exercises = Object.entries(session.exercises);
                        return (
                          <div key={date} style={{
                            background: 'rgba(0,0,0,0.15)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 'var(--radius-md)',
                            padding: '12px'
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>
                                  📅 {new Date(date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                </div>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2.5px' }}>
                                  📋 {session.planName || 'Custom Routine'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <span style={{ fontSize: '0.68rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--primary-accent-light)', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                  {session.sets} sets
                                </span>
                                <span style={{ fontSize: '0.68rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                  {session.volume.toLocaleString('en-IN')} kg
                                </span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {exercises.map(([exName, sets], exIdx) => {
                                const maxWeight = Math.max(...sets.map(s => s.weight));
                                return (
                                  <span key={exIdx} style={{
                                    fontSize: '0.7rem',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    padding: '3px 10px',
                                    borderRadius: '20px',
                                    color: 'var(--text-muted)'
                                  }}>
                                    {exName} · {sets.length}s · {maxWeight}kg
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WorkoutProgressDashboard;
