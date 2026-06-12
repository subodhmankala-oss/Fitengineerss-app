import React, { useState, useEffect } from 'react';
import databaseService from '../services/databaseService';
import './TrainerDashboard.css';

const TrainerDashboard = ({ handleLogout }) => {
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [goalFilter, setGoalFilter] = useState('All');
  
  // Selected client detail view states
  const [selectedClient, setSelectedClient] = useState(null);
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Fetch all clients on mount
  useEffect(() => {
    const fetchClients = async () => {
      setLoadingClients(true);
      try {
        const data = await databaseService.getAllUsers();
        // Exclude trainer emails from the clients listing to avoid noise
        const filteredData = data.filter(u => 
          u.email !== 'trainer@fitengineers.com' && 
          u.email !== 'subodhmankala@gmail.com' && 
          u.email !== 'coach@fitengineers.com'
        );
        setClients(filteredData);
      } catch (err) {
        console.error('Error fetching clients:', err);
      } finally {
        setLoadingClients(false);
      }
    };
    fetchClients();
  }, []);

  // Fetch client workout logs when a client is selected
  const handleSelectClient = async (client) => {
    setSelectedClient(client);
    setLoadingLogs(true);
    setWorkoutLogs([]);
    try {
      const logs = await databaseService.getWorkoutLogsForUser(client.id);
      
      // Group flat logs array by Date and then by Exercise Name
      const grouped = groupLogs(logs);
      setWorkoutLogs(grouped);
    } catch (err) {
      console.error('Error fetching client logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const groupLogs = (logs) => {
    const datesMap = {};
    
    logs.forEach(log => {
      const date = log.log_date;
      if (!datesMap[date]) {
        datesMap[date] = {};
      }
      
      const exercise = log.exercise_name;
      if (!datesMap[date][exercise]) {
        datesMap[date][exercise] = [];
      }
      
      datesMap[date][exercise].push({
        setNumber: log.set_number,
        reps: log.reps,
        weight: log.weight_kg
      });
    });

    // Convert to a sorted array structure
    const sortedDatesList = Object.keys(datesMap)
      .sort((a, b) => new Date(b) - new Date(a)) // Latest sessions first
      .map(dateStr => {
        const exercisesList = Object.keys(datesMap[dateStr]).map(exName => {
          // Sort sets by set number ascending
          const sortedSets = datesMap[dateStr][exName].sort((a, b) => a.setNumber - b.setNumber);
          return {
            name: exName,
            sets: sortedSets
          };
        });
        
        return {
          date: dateStr,
          exercises: exercisesList
        };
      });

    return sortedDatesList;
  };

  const getAvatarInitials = (name) => {
    if (!name) return 'W';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  };

  const getAvatarColor = (name) => {
    const colors = ['#ea4335', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];
    if (!name) return colors[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  // Filter clients list
  const filteredClients = clients.filter(c => {
    const matchesSearch = 
      c.userName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.email.toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesGoal = goalFilter === 'All' || c.userGoal === goalFilter;
    
    return matchesSearch && matchesGoal;
  });

  return (
    <div className="trainer-dashboard-container animate-scale-in">
      {/* Top Header */}
      <div className="trainer-header">
        <div className="trainer-title-group">
          <h3>Fitengineers Portal</h3>
          <div className="trainer-subtitle">Coach Dashboard</div>
        </div>
        <button className="logout-btn-trainer" onClick={handleLogout}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Logout
        </button>
      </div>

      {!selectedClient ? (
        // Client Directory Screen
        <div className="client-directory-view">
          {/* Search bar & filter pills */}
          <div className="search-filter-box">
            <input
              type="text"
              className="trainer-search-input"
              placeholder="🔍 Search client by name or email..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <div className="filter-tags">
              {['All', 'Fat Loss', 'Muscle Building', 'Gut Fix'].map(goal => (
                <button
                  key={goal}
                  className={`filter-tag ${goalFilter === goal ? 'active' : ''}`}
                  onClick={() => setGoalFilter(goal)}
                >
                  {goal}
                </button>
              ))}
            </div>
          </div>

          <h4 className="client-directory-title">
            Clients ({filteredClients.length})
          </h4>

          {loadingClients ? (
            <div className="trainer-loading-container">
              <div className="trainer-spinner"></div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading client directory...</p>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="trainer-empty-state">
              <div className="trainer-empty-icon">👥</div>
              <h5>No Clients Found</h5>
              <p>Try refining your search query or selecting a different goal category tag filter.</p>
            </div>
          ) : (
            <div className="clients-list">
              {filteredClients.map(client => (
                <div 
                  key={client.id} 
                  className="client-card"
                  onClick={() => handleSelectClient(client)}
                >
                  <div className="client-main-info">
                    <div 
                      className="client-avatar"
                      style={{ backgroundColor: getAvatarColor(client.userName) }}
                    >
                      {getAvatarInitials(client.userName)}
                    </div>
                    <div>
                      <div className="client-name">{client.userName}</div>
                      <div className="client-email">{client.email}</div>
                      {client.userGoal && (
                        <span className={`client-goal-badge ${client.userGoal.toLowerCase().replace(/\s+/g, '-')}`}>
                          {client.userGoal}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="client-card-chevron">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        // Client Detail & Workout Logs Screen
        <div className="client-detail-view animate-scale-in">
          {/* Back button and profile title */}
          <div className="client-detail-header">
            <button className="back-btn-trainer" onClick={() => setSelectedClient(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
            <div className="client-detail-header-info">
              <h4>{selectedClient.userName}</h4>
              <span>{selectedClient.email}</span>
            </div>
          </div>

          {/* Client Targets Grid */}
          <div className="client-metrics-grid">
            <div className="metric-mini-card">
              <div className="metric-mini-label">Fitness Goal</div>
              <div className="metric-mini-value" style={{ fontSize: '0.8rem', color: 'var(--primary-accent-light)' }}>
                {selectedClient.userGoal || 'Not set'}
              </div>
            </div>
            <div className="metric-mini-card">
              <div className="metric-mini-label">Weight (kg)</div>
              <div className="metric-mini-value">{selectedClient.userWeight || '--'}</div>
            </div>
            <div className="metric-mini-card">
              <div className="metric-mini-label">Calories</div>
              <div className="metric-mini-value">{selectedClient.userCalorieTarget || '--'} kcal</div>
            </div>
            <div className="metric-mini-card">
              <div className="metric-mini-label">Age</div>
              <div className="metric-mini-value">{selectedClient.userAge || '--'} yrs</div>
            </div>
            <div className="metric-mini-card">
              <div className="metric-mini-label">Height</div>
              <div className="metric-mini-value">{selectedClient.userHeight || '--'} cm</div>
            </div>
            <div className="metric-mini-card">
              <div className="metric-mini-label">Protein</div>
              <div className="metric-mini-value">{selectedClient.userProteinTarget || '--'}g</div>
            </div>
          </div>

          <h4 className="history-section-title">Workout History</h4>

          {loadingLogs ? (
            <div className="trainer-loading-container">
              <div className="trainer-spinner"></div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading workout history logs...</p>
            </div>
          ) : workoutLogs.length === 0 ? (
            <div className="trainer-empty-state">
              <div className="trainer-empty-icon">🏋️‍♂️</div>
              <h5>No Workouts Logged</h5>
              <p>This client has not logged or synchronized any workout sessions to the database yet.</p>
            </div>
          ) : (
            <div className="workout-sessions-list">
              {workoutLogs.map((session, sIdx) => (
                <div key={sIdx} className="session-block">
                  <div className="session-date-header">
                    <span className="session-date-icon">📅</span>
                    {new Date(session.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>

                  <div className="session-exercises-list">
                    {session.exercises.map((exercise, eIdx) => (
                      <div key={eIdx} className="exercise-log-card">
                        <div className="exercise-log-name">{exercise.name}</div>
                        
                        <table className="sets-table">
                          <thead>
                            <tr>
                              <th style={{ width: '25%' }}>Set</th>
                              <th style={{ width: '40%' }}>Weight</th>
                              <th style={{ width: '35%' }}>Reps</th>
                            </tr>
                          </thead>
                          <tbody>
                            {exercise.sets.map((set, setIdx) => (
                              <tr key={setIdx}>
                                <td>
                                  <span className="set-num-badge">{set.setNumber}</span>
                                </td>
                                <td>{set.weight} kg</td>
                                <td>{set.reps} reps</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TrainerDashboard;
