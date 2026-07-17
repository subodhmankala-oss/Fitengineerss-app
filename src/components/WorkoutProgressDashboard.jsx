import React, { useState, useEffect } from 'react';
import databaseService from '../services/databaseService';
import ConnectCoachModal from './ConnectCoachModal';
import { getSetTypeVisual } from './SetTypeMenu';
import { getLocalDateString, shiftLocalDateString, isLocalToday, parseLocalDateString } from '../utils/dateUtils';
import { formatDuration, computeElapsedSeconds, computeLiveCalories } from '../utils/liveWorkoutTimer';
import './WorkoutProgressDashboard.css';

const WorkoutProgressDashboard = ({ handleLogout, onNavigateToWorkouts }) => {
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState('Warrior');
  const [timeframe, setTimeframe] = useState('weekly');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConnectModal, setShowConnectModal] = useState(false);
  // An in-progress workout (self-logged, or a coach logging live for this
  // client) that's still open in workout_drafts — surfaced here so it isn't
  // silently lost just because the client was away from the app/tab for a
  // while (backgrounded, switched apps, closed the browser).
  const [activeDraft, setActiveDraft] = useState(null);
  const [, forceDraftTick] = useState(0);
  const [isLinkedToCoach, setIsLinkedToCoach] = useState(
    () => localStorage.getItem('clientLinkedToCoach') === 'true'
  );
  // A cached 'true' is trusted for instant paint (low risk — disconnection is
  // a rare, deliberate action). A cached 'false' is NOT trusted the same way:
  // it can be stale from before this device ever ran a real, successful check
  // (e.g. no full logout was ever done, or it dates from before this fix
  // existed), so it's treated the same as "never checked" — pending until the
  // DB confirms it. Without this, an already-connected client could see the
  // wrong "Connect to coach" CTA indefinitely on that device, only correcting
  // itself once something else (like a tab switch) happened to remount this
  // component after the DB check had quietly finished in the background.
  const [coachStatusPending, setCoachStatusPending] = useState(
    () => localStorage.getItem('clientLinkedToCoach') !== 'true'
  );
  const [selectedDateStr, setSelectedDateStr] = useState(getLocalDateString());
  // Coach-set program length (clients.total_sessions). null = not configured
  // yet — the progress card shows a "waiting on your coach" state, never a
  // fake default denominator. localStorage is only a fast-paint cache; the
  // real value is reconciled from the DB on mount.
  const [sessionsTotal, setSessionsTotal] = useState(() => {
    const cachedLimit = parseInt(localStorage.getItem('userSessionsLimit'), 10);
    return Number.isFinite(cachedLimit) && cachedLimit > 0 ? cachedLimit : null;
  });
  const [coachName, setCoachName] = useState(() => localStorage.getItem('userCoachName') || '');

  useEffect(() => {
    const storedName = localStorage.getItem('userName');
    if (storedName) setUserName(storedName);

    // Reconcile connection status + coach-set program length from the DB.
    // The localStorage flag is only a cache and can be stale — the progress
    // card belongs to a coaching relationship, so both the header state and
    // the card gate off the client's own clients row (coach_id).
    //
    // getOwnCoachConnection() can come back with resolved:false when every
    // internal retry failed (this read competes with sign-in, profile-fetch
    // and workout-log requests all firing at once right after login). That is
    // NOT proof of disconnection — treating it as one previously wrote a false
    // "disconnected" into the cache, which then looked confirmed forever even
    // though the client stayed genuinely connected. So on resolved:false, keep
    // the pending state and retry from here too, instead of settling wrong.
    let cancelled = false;
    const reconcileCoachStatus = async (attemptsLeft = 4) => {
      const conn = await databaseService.getOwnCoachConnection();
      if (cancelled) return;

      if (!conn.resolved) {
        if (attemptsLeft > 0) {
          setTimeout(() => reconcileCoachStatus(attemptsLeft - 1), 3000);
        } else {
          // Genuinely could not get a confirmed answer after many tries. This is
          // NOT proof of disconnection — it's "we still don't know". Previously
          // this called setIsLinkedToCoach(conn.connected) here, which for an
          // already-connected client (isLinkedToCoach started true from a
          // trusted cache) would flip the UI to "Connect to coach" and hide the
          // whole Coaching Program Progress card on THIS load, even though
          // nothing was actually confirmed and nothing was persisted — a scary,
          // wrong-looking flash that self-corrected only on the next reload.
          // Never downgrade a trusted "connected" state from an unresolved
          // read; only apply conn.connected when it's the initial/never-known
          // case. `isLinkedToCoach` here is the closure-captured cache value
          // from mount (this effect runs once), so it reflects what the user
          // is already seeing: if that was already a trusted "true", it's safe
          // to stop showing "Checking…" — the visible state isn't changing.
          // Otherwise stay pending and keep quietly retrying in the background
          // instead of ever declaring a false "not connected".
          setIsLinkedToCoach(prev => (prev ? prev : conn.connected));
          if (isLinkedToCoach) setCoachStatusPending(false);
          setTimeout(() => reconcileCoachStatus(4), 15000);
        }
        return;
      }

      setIsLinkedToCoach(conn.connected);
      setCoachStatusPending(false);
      localStorage.setItem('clientLinkedToCoach', conn.connected ? 'true' : 'false');
      if (conn.coachId) localStorage.setItem('userCoachId', conn.coachId);
      if (conn.connected && Number.isFinite(conn.totalSessions) && conn.totalSessions > 0) {
        setSessionsTotal(conn.totalSessions);
        localStorage.setItem('userSessionsLimit', String(conn.totalSessions));
      } else {
        setSessionsTotal(null);
        localStorage.removeItem('userSessionsLimit');
      }
      // Header shows the coach's name — resolve it if the cache is empty
      // (e.g. the localStorage flag was stale-false so the mount backfill
      // below didn't run).
      if (conn.connected && conn.coachId && !localStorage.getItem('userCoachName')) {
        databaseService.getCoachNameById(conn.coachId).then(resolvedName => {
          const displayName = resolvedName || conn.coachId;
          localStorage.setItem('userCoachName', displayName);
          setCoachName(displayName);
        });
      }
    };
    reconcileCoachStatus();

    // Backfill the coach's name for clients who connected before this lookup
    // existed — they have userCoachId but never got a userCoachName cached.
    if (isLinkedToCoach && !coachName) {
      const storedCoachId = localStorage.getItem('userCoachId');
      if (storedCoachId) {
        databaseService.getCoachNameById(storedCoachId).then(resolvedName => {
          const displayName = resolvedName || storedCoachId;
          localStorage.setItem('userCoachName', displayName);
          setCoachName(displayName);
        });
      }
    }

    // SECURITY: never fall back to a display name here. getWorkoutLogsForUser
    // used to accept a bare name and resolve it via an ambiguous "first
    // match" DB lookup — since many clients share the literal placeholder
    // name "Warrior" (no real name set yet), a resolution failure right
    // after login could return a completely different client's private
    // workout logs. getWorkoutLogsForUser now fails closed on a non-UUID
    // input, but this loop also needs to actually retry (instead of quietly
    // showing empty forever) so a client's own data still shows up once
    // resolveUserId() succeeds.
    const loadLogs = async (attemptsLeft = 4) => {
      setLoading(true);
      try {
        const resolvedUserId = await databaseService.resolveUserId();
        if (!resolvedUserId) {
          if (attemptsLeft > 0 && !cancelled) {
            setTimeout(() => loadLogs(attemptsLeft - 1), 3000);
            return; // stay in "loading" — do not clear it while still retrying
          }
          if (!cancelled) { setLogs([]); setLoading(false); }
          return;
        }
        if (!cancelled) setUserId(resolvedUserId);
        const userLogs = await databaseService.getWorkoutLogsForUser(resolvedUserId);
        if (!cancelled) { setLogs(userLogs || []); setLoading(false); }
      } catch (err) {
        console.error('Error loading workout progress logs:', err);
        if (!cancelled) setLoading(false);
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
      cancelled = true;
      window.removeEventListener('workoutSessionsUpdated', handleWorkoutUpdate);
      window.removeEventListener('workoutUpdated', handleWorkoutUpdate);
    };
  }, []);

  // Check for an in-progress workout draft — on mount, and again whenever the
  // tab/app regains focus (the exact "was away for 15-20 min, came back"
  // moment this banner exists for).
  useEffect(() => {
    let cancelled = false;
    const checkDraft = async () => {
      const userId = await databaseService.resolveUserId();
      if (!userId || cancelled) return;
      const draft = await databaseService.getWorkoutDraft(userId);
      if (!cancelled) setActiveDraft(draft);
    };
    checkDraft();
    document.addEventListener('visibilitychange', checkDraft);
    window.addEventListener('focus', checkDraft);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', checkDraft);
      window.removeEventListener('focus', checkDraft);
    };
  }, []);

  // While an in-progress draft's timer is running, re-render the banner once a
  // second so its live duration + calories tick up (both are recomputed fresh
  // from the draft's start/pause timestamps on each render, never stored).
  useEffect(() => {
    if (activeDraft?.timerStatus !== 'running') return;
    const id = setInterval(() => forceDraftTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeDraft?.timerStatus]);

  // Helpers for date calculations
  const getStartOfWeek = (d) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const start = new Date(date.setDate(diff));
    start.setHours(0, 0, 0, 0);
    return start;
  };

  const isToday = (dateStr) => isLocalToday(dateStr);

  const getWeekDays = () => {
    const start = getStartOfWeek(new Date());
    const days = [];
    for (let i = 0; i < 7; i++) {
      const current = new Date(start);
      current.setDate(start.getDate() + i);
      days.push(getLocalDateString(current));
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
          planName: log.plan_name || log.planName || '',
          durationSeconds: null,
          caloriesBurned: null
        };
      }

      if (!grouped[date].planName && (log.plan_name || log.planName)) {
        grouped[date].planName = log.plan_name || log.planName;
      }
      // Session duration/calories are duplicated onto every row of the session
      // (workout_logs has no session-level row) — take the first non-null seen.
      if (log.duration_seconds != null && grouped[date].durationSeconds == null) {
        grouped[date].durationSeconds = log.duration_seconds;
      }
      if (log.calories_burned != null && grouped[date].caloriesBurned == null) {
        grouped[date].caloriesBurned = log.calories_burned;
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
        weight,
        setType: log.set_type || null,
        isWarmup: log.set_type === 'warmup'
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
    let totalCalories = 0;
    let totalDurationSeconds = 0;
    const dailySets = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    weekDays.forEach(day => {
      if (groupedLogs[day]) {
        totalVolume += groupedLogs[day].volume;
        totalSets += groupedLogs[day].sets;
        workoutsCount += 1;
        totalCalories += groupedLogs[day].caloriesBurned || 0;
        totalDurationSeconds += groupedLogs[day].durationSeconds || 0;

        const dateObj = parseLocalDateString(day);
        const dayOfWeekStr = dayNames[dateObj.getDay() === 0 ? 0 : dateObj.getDay()];
        // Map Sun -> Sun, Mon -> Mon, etc.
        const mappedName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        dailySets[mappedName] = groupedLogs[day].sets;
      }
    });

    return { totalVolume, totalSets, workoutsCount, dailySets, totalCalories: Math.round(totalCalories * 10) / 10, totalDurationSeconds };
  };

  const weeklyStats = getWeeklyStats();

  // 2. Daily stats
  const getDailyStats = () => {
    const dayData = groupedLogs[selectedDateStr];
    if (!dayData) {
      return { volume: 0, sets: 0, exercises: [], calories: null, durationSeconds: null };
    }
    const exercisesList = Object.keys(dayData.exercises).map(name => ({
      name,
      sets: dayData.exercises[name]
    }));
    return {
      volume: dayData.volume,
      sets: dayData.sets,
      exercises: exercisesList,
      calories: dayData.caloriesBurned,
      durationSeconds: dayData.durationSeconds
    };
  };

  const dailyStats = getDailyStats();

  // 3. Monthly stats (last 30 days)
  const getMonthlyStats = () => {
    let totalVolume = 0;
    let totalSets = 0;
    let workoutsCount = 0;
    let totalCalories = 0;
    const dailyVolumeHistory = []; // list of last 30 days volumes for graph
    const activeDates = new Set();

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);
      const volume = groupedLogs[dateStr] ? groupedLogs[dateStr].volume : 0;
      const sets = groupedLogs[dateStr] ? groupedLogs[dateStr].sets : 0;

      if (groupedLogs[dateStr]) {
        totalVolume += volume;
        totalSets += sets;
        workoutsCount += 1;
        totalCalories += groupedLogs[dateStr].caloriesBurned || 0;
        activeDates.add(dateStr);
      }

      dailyVolumeHistory.push({
        date: dateStr,
        dayNum: d.getDate(),
        volume: volume
      });
    }

    return { totalVolume, totalSets, workoutsCount, dailyVolumeHistory, activeDates, totalCalories: Math.round(totalCalories * 10) / 10 };
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
    const dayName = parseLocalDateString(bestDay).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
      const dateStr = getLocalDateString(d);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => { if (!coachStatusPending) setShowConnectModal(true); }}
            disabled={coachStatusPending}
            title={coachStatusPending ? 'Checking coach status…' : (isLinkedToCoach ? `Connected to Coach: ${coachName || ''}` : 'Connect to coach')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: coachStatusPending ? 'rgba(255,255,255,0.03)' : (isLinkedToCoach ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)'),
              border: coachStatusPending ? '1px solid rgba(255,255,255,0.06)' : (isLinkedToCoach ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.12)'),
              color: coachStatusPending ? 'rgba(255,255,255,0.4)' : (isLinkedToCoach ? 'var(--primary-accent-light)' : '#fff'),
              borderRadius: '20px', padding: '7px 12px', fontSize: '0.75rem', fontWeight: 700,
              cursor: coachStatusPending ? 'default' : 'pointer', whiteSpace: 'nowrap'
            }}
          >
            {coachStatusPending ? (
              'Checking…'
            ) : isLinkedToCoach ? (
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.25 }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 600, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Coach:</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 800 }}>{coachName || 'Coach'}</span>
              </span>
            ) : '🔗 Connect to coach'}
          </button>
          <button className="btn-logout" onClick={handleLogout} title="Reset Profile/Log Out">
            <svg className="logout-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v7" />
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            </svg>
          </button>
        </div>
      </div>

      {/* Resume in-progress workout — a draft survives being away from the
          app/device (backgrounded, closed the tab, switched apps) via
          workout_drafts, so it's never silently lost. A 'coach' draft means
          the coach is live-logging this session right now — shown as
          read-only status, not a resume button, so the client can't edit the
          same session concurrently with the coach. */}
      {activeDraft && (
        <div
          onClick={activeDraft.source === 'coach' ? undefined : () => onNavigateToWorkouts && onNavigateToWorkouts()}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 0, padding: '12px 14px', marginBottom: '4px',
            cursor: activeDraft.source === 'coach' ? 'default' : 'pointer'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <span style={{ fontSize: '1.4rem' }}>⏱️</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fbbf24' }}>
                {activeDraft.source === 'coach' ? 'Your coach is logging a session for you' : 'Workout in progress'}
              </div>
              {/* Live duration + calories, recomputed from the draft's timer
                  timestamps (idle = timer not started yet, so no clock shown). */}
              {activeDraft.timerStatus !== 'idle' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '3px 0 2px' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fbbf24', fontFamily: "'Courier New', monospace" }}>
                    {formatDuration(computeElapsedSeconds(activeDraft.timerStartedAt, activeDraft.pauseIntervals || []))}
                    {activeDraft.timerStatus === 'paused' && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', marginLeft: '5px' }}>PAUSED</span>}
                  </span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fbbf24', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', padding: '1px 7px', borderRadius: '20px' }}>
                    🔥 {computeLiveCalories(activeDraft.exercises || [], activeDraft.timerStartedAt, activeDraft.pauseIntervals || []).totalKcal} kcal
                  </span>
                </div>
              )}
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeDraft.planName || 'Workout'} · {(activeDraft.exercises || []).reduce((sum, ex) => sum + ex.sets.filter(s => s.isCompleted).length, 0)} sets logged
              </div>
            </div>
          </div>
          {activeDraft.source !== 'coach' && (
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button type="button" style={{
                background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff',
                border: 'none', borderRadius: '20px', padding: '8px 14px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer'
              }}
              onClick={() => onNavigateToWorkouts && onNavigateToWorkouts()}
              >
                Resume ▶
              </button>
              <button type="button" style={{
                background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff',
                border: 'none', borderRadius: '20px', padding: '8px 14px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer'
              }}
              onClick={async (e) => {
                e.stopPropagation();
                if (userId) {
                  await databaseService.deleteWorkoutDraft(userId);
                  // The Workout tab mirrors its in-progress session into a
                  // localStorage draft (workoutDraft_<userId>) so it survives
                  // an unmount. That mirror is separate from the DB row we
                  // just deleted — without clearing it too, WorkoutTracker
                  // reloads this stale local copy the next time it mounts
                  // (e.g. the client switches to the Workout tab) and the
                  // "discarded" session reappears as if nothing happened.
                  localStorage.removeItem(`workoutDraft_${userId}`);
                  setActiveDraft(null);
                }
              }}
              title="Discard this workout session"
              >
                ✕ Discard
              </button>
            </div>
          )}
        </div>
      )}

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
              {/* Single Prominent Sessions Done Progress Card — belongs to the
                  coaching relationship, so it only renders for clients actually
                  connected to a coach via invite code. */}
              {isLinkedToCoach && (() => {
                const hasConfiguredTotal = Number.isFinite(sessionsTotal) && sessionsTotal > 0;
                if (!hasConfiguredTotal) {
                  // Connected, but the coach hasn't set a program length yet —
                  // show an honest waiting state instead of fake numbers.
                  return (
                    <div className="sessions-progress-card glass-panel animate-scale-in" style={{
                      background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(16, 185, 129, 0.05))',
                      border: '1px solid rgba(139, 92, 246, 0.25)',
                      borderRadius: 0,
                      padding: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)'
                    }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coaching Program Progress</span>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-subtle)' }}>
                        Your coach hasn't set your program length yet. Your session progress will appear here once they do. 🗓️
                      </p>
                    </div>
                  );
                }
                const percentComplete = Math.min(100, Math.round((totalSessionsDone / sessionsTotal) * 100));
                return (
                  <div className="sessions-progress-card glass-panel animate-scale-in" style={{
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(16, 185, 129, 0.05))',
                    border: '1px solid rgba(139, 92, 246, 0.25)',
                    borderRadius: 0,
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
                  <span className="trend-badge">
                    {weeklyStats.workoutsCount} days active{weeklyStats.totalCalories > 0 ? ` · 🔥 ${weeklyStats.totalCalories} kcal` : ''}
                  </span>
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
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <span style={{ fontSize: '0.68rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--primary-accent-light)', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                {session.sets} sets
                              </span>
                              <span style={{ fontSize: '0.68rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                {session.volume.toLocaleString('en-IN')} kg
                              </span>
                              {session.caloriesBurned != null && (
                                <span style={{ fontSize: '0.68rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                  🔥 {session.caloriesBurned} kcal
                                </span>
                              )}
                              {session.durationSeconds != null && (
                                <span style={{ fontSize: '0.68rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                  ⏱ {formatDuration(session.durationSeconds)}
                                </span>
                              )}
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
                    setSelectedDateStr(shiftLocalDateString(selectedDateStr, -1));
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
                    const next = shiftLocalDateString(selectedDateStr, 1);
                    if (next <= getLocalDateString()) {
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
                  <div>
                    <h3>
                      {groupedLogs[selectedDateStr]?.planName
                        || (isToday(selectedDateStr) ? "Today's Progress" : new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }))}
                    </h3>
                    {groupedLogs[selectedDateStr]?.planName && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2px' }}>
                        {isToday(selectedDateStr) ? 'Today' : new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                      </div>
                    )}
                  </div>
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
                  {dailyStats.calories != null && (
                    <div className="stat-card inline">
                      <span className="lbl">🔥 Calories:</span>
                      <strong className="val" style={{ color: '#fbbf24' }}>{dailyStats.calories} kcal</strong>
                    </div>
                  )}
                  {dailyStats.durationSeconds != null && (
                    <div className="stat-card inline">
                      <span className="lbl">⏱ Time:</span>
                      <strong className="val" style={{ color: '#e5e7eb' }}>{formatDuration(dailyStats.durationSeconds)}</strong>
                    </div>
                  )}
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
                              {ex.sets.map((set, sIdx) => {
                                // Sequential number among normal working sets only —
                                // matches the logger's own Warmup/Dropset/Failure badges.
                                const workingNum = ex.sets.slice(0, sIdx + 1)
                                  .filter(s => !s.isWarmup && s.setType !== 'failure' && s.setType !== 'drop').length;
                                const visual = getSetTypeVisual(set, workingNum);
                                return (
                                  <tr key={sIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ padding: '5px 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                      <span style={{
                                        display:'inline-flex', alignItems:'center', justifyContent:'center', width:'20px', height:'20px', borderRadius:'50%',
                                        background: visual.color ? `${visual.color}22` : 'rgba(255,255,255,0.06)',
                                        fontSize:'0.68rem', fontWeight:800,
                                        color: visual.color || '#fff'
                                      }}>{visual.label}</span>
                                    </td>
                                    <td style={{ padding: '5px 0', fontSize: '0.82rem', color: '#fff', fontWeight: 600 }}>{set.weight} kg</td>
                                    <td style={{ padding: '5px 0', fontSize: '0.82rem', color: '#fff' }}>{set.reps} reps</td>
                                    <td style={{ padding: '5px 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{(set.weight * set.reps).toFixed(0)} kg</td>
                                  </tr>
                                );
                              })}
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
                <div className="stat-card glass-panel">
                  <span className="card-label">🔥 Calories</span>
                  <strong className="card-value" style={{ color: '#fbbf24' }}>{monthlyStats.totalCalories.toLocaleString('en-IN')} <span className="value-unit">kcal</span></strong>
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
                                  📅 {parseLocalDateString(date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                </div>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '2.5px' }}>
                                  📋 {session.planName || 'Custom Routine'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <span style={{ fontSize: '0.68rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--primary-accent-light)', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                  {session.sets} sets
                                </span>
                                <span style={{ fontSize: '0.68rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                  {session.volume.toLocaleString('en-IN')} kg
                                </span>
                                {session.caloriesBurned != null && (
                                  <span style={{ fontSize: '0.68rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                    🔥 {session.caloriesBurned} kcal
                                  </span>
                                )}
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
      {showConnectModal && (
        <ConnectCoachModal
          onClose={() => setShowConnectModal(false)}
          onSuccess={async (coachId) => {
            localStorage.setItem('clientLinkedToCoach', 'true');
            if (coachId) {
              localStorage.setItem('userCoachId', coachId);
              const resolvedName = await databaseService.getCoachNameById(coachId);
              const displayName = resolvedName || coachId;
              localStorage.setItem('userCoachName', displayName);
              setCoachName(displayName);
            }
            setIsLinkedToCoach(true);
            setShowConnectModal(false);
          }}
        />
      )}
    </div>
  );
};

export default WorkoutProgressDashboard;
