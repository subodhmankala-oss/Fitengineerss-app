import React, { useState, useEffect, useRef } from 'react';
import databaseService from '../services/databaseService';
import './TrainerDashboard.css';

const TrainerDashboard = ({ handleLogout }) => {
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [goalFilter, setGoalFilter] = useState('All');
  
  // Selected client detail view states
  const [selectedClient, setSelectedClient] = useState(null);
  const [detailTab, setDetailTab] = useState('workout'); // 'workout' or 'chat'
  
  // Selected client workout plans state
  const [clientPlans, setClientPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [editorPlanName, setEditorPlanName] = useState('');
  const [editorExercises, setEditorExercises] = useState([]);

  const fetchClientPlans = async (clientId) => {
    setLoadingPlans(true);
    try {
      const plans = await databaseService.getWorkoutPlansForUser(clientId);
      setClientPlans(plans || []);
    } catch (e) {
      console.error('Error fetching client plans:', e);
    } finally {
      setLoadingPlans(false);
    }
  };
  
  // Workout history states
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  
  // Chat states
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const chatEndRef = useRef(null);

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
    setDetailTab('workout');
    setLoadingLogs(true);
    setWorkoutLogs([]);
    try {
      const logs = await databaseService.getWorkoutLogsForUser(client.id);
      
      // Group flat logs array by Date and then by Exercise Name
      const grouped = groupLogs(logs || []);
      setWorkoutLogs(grouped);

      // Load client plans
      fetchClientPlans(client.id);
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

    const sortedDatesList = Object.keys(datesMap)
      .sort((a, b) => new Date(b) - new Date(a)) // Latest sessions first
      .map(dateStr => {
        const exercisesList = Object.keys(datesMap[dateStr]).map(exName => {
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

  const fetchClientChat = async (clientId) => {
    try {
      const msgs = await databaseService.getChatMessages(clientId);
      setChatMessages(msgs);
    } catch (e) {
      console.error("Error fetching client chat:", e);
    }
  };

  // Poll client chat history logs every 4 seconds when chat tab is active
  useEffect(() => {
    if (!selectedClient || detailTab !== 'chat') return;

    fetchClientChat(selectedClient.id);

    const interval = setInterval(() => {
      fetchClientChat(selectedClient.id);
    }, 4000);

    return () => clearInterval(interval);
  }, [selectedClient, detailTab]);

  // Scroll to bottom of chat when new messages loaded
  useEffect(() => {
    if (detailTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, detailTab]);

  const handleTabChange = async (tab) => {
    setDetailTab(tab);
    if (tab === 'chat' && selectedClient) {
      setLoadingChat(true);
      await fetchClientChat(selectedClient.id);
      setLoadingChat(false);
    } else if (tab === 'plans' && selectedClient) {
      await fetchClientPlans(selectedClient.id);
    }
  };

  const handleSavePlan = async () => {
    if (!editorPlanName.trim()) {
      alert("Please enter a plan name.");
      return;
    }
    if (editorExercises.length === 0) {
      alert("Please add at least one exercise.");
      return;
    }
    
    // Clean up empty sets
    const cleanExercises = editorExercises.map(ex => ({
      name: ex.name,
      sets: ex.sets.map(s => ({
        reps: parseInt(s.reps) || 10,
        weight: parseFloat(s.weight) || 0
      }))
    })).filter(ex => ex.sets.length > 0);

    const plan = {
      id: editingPlan ? editingPlan.id : null,
      userId: selectedClient.id,
      planName: editorPlanName.trim(),
      exercises: cleanExercises,
      createdBy: 'coach'
    };

    await databaseService.saveWorkoutPlan(plan);
    setShowPlanEditor(false);
    setEditingPlan(null);
    setEditorPlanName('');
    setEditorExercises([]);
    fetchClientPlans(selectedClient.id);
  };

  const handleAddExerciseToEditor = (name) => {
    setEditorExercises(prev => [
      ...prev,
      {
        name,
        sets: [{ reps: 10, weight: 20 }]
      }
    ]);
  };

  const handleAddSetToExercise = (exIdx) => {
    setEditorExercises(prev => prev.map((ex, idx) => {
      if (idx === exIdx) {
        const lastSet = ex.sets[ex.sets.length - 1] || { reps: 10, weight: 20 };
        return {
          ...ex,
          sets: [...ex.sets, { reps: lastSet.reps, weight: lastSet.weight }]
        };
      }
      return ex;
    }));
  };

  const handleRemoveSetFromExercise = (exIdx, setIdx) => {
    setEditorExercises(prev => prev.map((ex, idx) => {
      if (idx === exIdx) {
        return {
          ...ex,
          sets: ex.sets.filter((_, sIdx) => sIdx !== setIdx)
        };
      }
      return ex;
    }));
  };

  const handleUpdateSetInExercise = (exIdx, setIdx, field, val) => {
    setEditorExercises(prev => prev.map((ex, idx) => {
      if (idx === exIdx) {
        return {
          ...ex,
          sets: ex.sets.map((s, sIdx) => {
            if (sIdx === setIdx) {
              return { ...s, [field]: val };
            }
            return s;
          })
        };
      }
      return ex;
    }));
  };

  const handleRemoveExerciseFromEditor = (exIdx) => {
    setEditorExercises(prev => prev.filter((_, idx) => idx !== exIdx));
  };

  const handleSendCoachMessage = async () => {
    if (!chatInput.trim() || !selectedClient) return;
    
    const text = chatInput.trim();
    setChatInput('');

    // Save coach reply in database
    await databaseService.saveChatMessage(selectedClient.id, 'coach', text);
    
    // Refresh history
    await fetchClientChat(selectedClient.id);
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

          {/* Tab Navigation */}
          <div className="trainer-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
            <button
              className={`trainer-tab-btn ${detailTab === 'workout' ? 'active' : ''}`}
              style={{
                flex: 1,
                padding: '12px',
                textAlign: 'center',
                fontSize: '0.85rem',
                fontWeight: '700',
                borderBottom: detailTab === 'workout' ? '2px solid var(--primary-accent-light)' : 'none',
                color: detailTab === 'workout' ? 'var(--primary-accent-light)' : 'var(--text-muted)'
              }}
              onClick={() => handleTabChange('workout')}
            >
              🏋️‍♂️ Workout History
            </button>
            <button
              className={`trainer-tab-btn ${detailTab === 'plans' ? 'active' : ''}`}
              style={{
                flex: 1,
                padding: '12px',
                textAlign: 'center',
                fontSize: '0.85rem',
                fontWeight: '700',
                borderBottom: detailTab === 'plans' ? '2px solid var(--primary-accent-light)' : 'none',
                color: detailTab === 'plans' ? 'var(--primary-accent-light)' : 'var(--text-muted)'
              }}
              onClick={() => handleTabChange('plans')}
            >
              📋 Workout Plans
            </button>
            <button
              className={`trainer-tab-btn ${detailTab === 'chat' ? 'active' : ''}`}
              style={{
                flex: 1,
                padding: '12px',
                textAlign: 'center',
                fontSize: '0.85rem',
                fontWeight: '700',
                borderBottom: detailTab === 'chat' ? '2px solid var(--primary-accent-light)' : 'none',
                color: detailTab === 'chat' ? 'var(--primary-accent-light)' : 'var(--text-muted)'
              }}
              onClick={() => handleTabChange('chat')}
            >
              💬 Chat with Client
            </button>
          </div>

          {/* Condition tab rendering */}
          {detailTab === 'workout' && (
            <div className="workout-history-content">
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

          {detailTab === 'plans' && (
            <div className="workout-plans-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {showPlanEditor ? (
                /* PLAN EDITOR VIEW */
                <div className="plan-editor-card glass-panel" style={{ padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                  <h4 style={{ color: '#fff', fontSize: '1rem', fontWeight: 800, marginBottom: '16px' }}>
                    {editingPlan ? '✏️ Edit Workout Plan' : '📋 Create Workout Plan'}
                  </h4>
                  
                  <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Plan Name (e.g. Week 1 - Day 1: Upper Body)</label>
                    <input 
                      type="text"
                      value={editorPlanName}
                      onChange={(e) => setEditorPlanName(e.target.value)}
                      placeholder="e.g. Week 1 - Day 1: Push Day"
                      style={{
                        padding: '10px 14px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        color: '#fff',
                        fontSize: '0.85rem',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {/* Exercises in the editor */}
                  <div className="editor-exercises-list" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
                    <h5 style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Exercises</h5>
                    
                    {editorExercises.length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', fontStyle: 'italic' }}>No exercises added to this plan yet. Use the dropdown below to add exercises.</p>
                    ) : (
                      editorExercises.map((ex, exIdx) => (
                        <div key={exIdx} className="editor-exercise-item" style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '12px' }}>
                          <div className="ex-item-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <strong style={{ fontSize: '0.85rem', color: '#fff' }}>{ex.name}</strong>
                            <button 
                              type="button" 
                              onClick={() => handleRemoveExerciseFromEditor(exIdx)}
                              style={{ color: 'var(--danger)', fontSize: '0.78rem', fontWeight: '700', cursor: 'pointer' }}
                            >
                              🗑️ Remove Exercise
                            </button>
                          </div>

                          <table className="editor-sets-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <th style={{ padding: '6px 4px', fontSize: '0.75rem', color: 'var(--text-muted)', width: '20%' }}>Set</th>
                                <th style={{ padding: '6px 4px', fontSize: '0.75rem', color: 'var(--text-muted)', width: '40%' }}>Weight (kg)</th>
                                <th style={{ padding: '6px 4px', fontSize: '0.75rem', color: 'var(--text-muted)', width: '40%' }}>Reps</th>
                                <th style={{ width: '10%' }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {ex.sets.map((set, setIdx) => (
                                <tr key={setIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                  <td style={{ padding: '6px 4px' }}>
                                    <span style={{ display: 'inline-block', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', textAlign: 'center', fontSize: '0.75rem', color: '#fff', lineHeight: '20px' }}>{setIdx + 1}</span>
                                  </td>
                                  <td style={{ padding: '6px 4px' }}>
                                    <input 
                                      type="number"
                                      value={set.weight}
                                      onChange={(e) => handleUpdateSetInExercise(exIdx, setIdx, 'weight', e.target.value)}
                                      style={{ width: '80%', padding: '4px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '4px', color: '#fff', fontSize: '0.8rem' }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 4px' }}>
                                    <input 
                                      type="number"
                                      value={set.reps}
                                      onChange={(e) => handleUpdateSetInExercise(exIdx, setIdx, 'reps', e.target.value)}
                                      style={{ width: '80%', padding: '4px 8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '4px', color: '#fff', fontSize: '0.8rem' }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                    {ex.sets.length > 1 && (
                                      <button 
                                        type="button" 
                                        onClick={() => handleRemoveSetFromExercise(exIdx, setIdx)}
                                        style={{ color: 'var(--danger)', fontSize: '0.85rem', cursor: 'pointer' }}
                                      >
                                        🗑️
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          <button 
                            type="button" 
                            onClick={() => handleAddSetToExercise(exIdx)}
                            style={{ marginTop: '8px', padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: '#fff', fontSize: '0.75rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                          >
                            ➕ Add Set
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add Exercise Dropdown / Selector */}
                  <div className="add-exercise-selector-box" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '24px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                    <select 
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddExerciseToEditor(e.target.value);
                          e.target.value = ""; // Reset
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        color: '#fff',
                        fontSize: '0.82rem',
                        outline: 'none'
                      }}
                    >
                      <option value="" disabled>➕ Select exercise to add...</option>
                      {['Bench Press', 'Squats', 'Deadlift', 'Shoulders Press', 'Biceps Curls', 'Triceps Extensions', 'One Arm Row', 'Lat Pull Down', 'Leg Press', 'Calf Raises', 'Plank'].map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Editor actions */}
                  <div className="editor-actions-row" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button 
                      type="button"
                      onClick={() => {
                        setShowPlanEditor(false);
                        setEditingPlan(null);
                        setEditorPlanName('');
                        setEditorExercises([]);
                      }}
                      style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button 
                      type="button"
                      onClick={handleSavePlan}
                      style={{ padding: '10px 16px', background: 'var(--primary-accent-light)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
                    >
                      Save Plan
                    </button>
                  </div>
                </div>
              ) : (
                /* PLANS LIST VIEW */
                <div className="plans-list-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="list-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4 style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned Workout Plans</h4>
                    <button 
                      type="button"
                      onClick={() => {
                        setEditingPlan(null);
                        setEditorPlanName('');
                        setEditorExercises([
                          { name: 'Bench Press', sets: [{ reps: 10, weight: 40 }] }
                        ]);
                        setShowPlanEditor(true);
                      }}
                      style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', color: 'var(--primary-accent-light)', fontSize: '0.8rem', fontWeight: 700, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                    >
                      ➕ Create Workout Plan
                    </button>
                  </div>

                  {loadingPlans ? (
                    <div className="trainer-loading-container">
                      <div className="trainer-spinner"></div>
                    </div>
                  ) : clientPlans.length === 0 ? (
                    <div className="trainer-empty-state" style={{ padding: '30px' }}>
                      <span style={{ fontSize: '1.5rem' }}>📋</span>
                      <h5 style={{ marginTop: '8px' }}>No Plans Assigned</h5>
                      <p style={{ fontSize: '0.78rem' }}>Create custom routines/templates that client can start and repeat from their logger.</p>
                    </div>
                  ) : (
                    <div className="plans-cards-grid" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {clientPlans.map(plan => (
                        <div key={plan.id} className="plan-summary-card glass-panel" style={{ padding: '14px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                          <div className="plan-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <strong style={{ fontSize: '0.9rem', color: '#fff', display: 'block' }}>{plan.planName}</strong>
                              <span style={{ fontSize: '0.68rem', color: 'var(--text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>
                                Created by: {plan.createdBy === 'coach' ? '🧑‍🏫 Coach' : '👤 Client'}
                              </span>
                            </div>
                            <div className="plan-actions" style={{ display: 'flex', gap: '8px' }}>
                              <button 
                                type="button"
                                onClick={() => {
                                  setEditingPlan(plan);
                                  setEditorPlanName(plan.planName);
                                  setEditorExercises(plan.exercises);
                                  setShowPlanEditor(true);
                                }}
                                style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '4px', color: '#fff', fontSize: '0.75rem', cursor: 'pointer' }}
                              >
                                Edit
                              </button>
                              <button 
                                type="button"
                                onClick={async () => {
                                  const duplicated = {
                                    planName: `${plan.planName} (Copy)`,
                                    exercises: plan.exercises,
                                    userId: selectedClient.id,
                                    createdBy: 'coach'
                                  };
                                  await databaseService.saveWorkoutPlan(duplicated);
                                  fetchClientPlans(selectedClient.id);
                                }}
                                style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '4px', color: '#fff', fontSize: '0.75rem', cursor: 'pointer' }}
                              >
                                Duplicate
                              </button>
                              <button 
                                type="button"
                                onClick={async () => {
                                  if (confirm('Delete this workout plan?')) {
                                    await databaseService.deleteWorkoutPlan(plan.id, selectedClient.id);
                                    fetchClientPlans(selectedClient.id);
                                  }
                                }}
                                style={{ padding: '4px 8px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '4px', color: 'var(--danger)', fontSize: '0.75rem', cursor: 'pointer' }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          <div className="plan-exercises-preview" style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {plan.exercises.map((ex, idx) => (
                              <span key={idx} style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '20px', color: 'var(--text-muted)' }}>
                                {ex.name} ({ex.sets?.length || 0}s)
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {detailTab === 'chat' && (
            <div className="trainer-chat-panel" style={{ display: 'flex', flexDirection: 'column', height: '360px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <div className="trainer-chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {loadingChat ? (
                  <div className="trainer-loading-container" style={{ margin: 'auto' }}>
                    <div className="trainer-spinner"></div>
                  </div>
                ) : chatMessages.length === 0 ? (
                  <div className="trainer-empty-state" style={{ border: 'none', margin: 'auto' }}>
                    <span style={{ fontSize: '1.5rem' }}>💬</span>
                    <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>No messages exchanged yet.</p>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div
                      key={msg.id || idx}
                      style={{
                        alignSelf: msg.sender === 'coach' ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-md)',
                        background: msg.sender === 'coach' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                        border: msg.sender === 'coach' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid var(--border-color)',
                        color: '#fff',
                        fontSize: '0.82rem',
                        lineHeight: 1.4,
                        position: 'relative'
                      }}
                    >
                      <div>{msg.text}</div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: '4px' }}>{msg.time}</div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
              
              <div className="trainer-chat-input-bar" style={{ display: 'flex', gap: '8px', padding: '10px', background: 'rgba(0,0,0,0.15)', borderTop: '1px solid var(--border-color)' }}>
                <input
                  type="text"
                  placeholder="Type a message to client..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendCoachMessage()}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    color: '#fff',
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                />
                <button
                  onClick={handleSendCoachMessage}
                  disabled={!chatInput.trim()}
                  style={{
                    padding: '10px 16px',
                    background: chatInput.trim() ? 'var(--primary-accent-light)' : 'rgba(255,255,255,0.05)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    color: chatInput.trim() ? '#fff' : 'var(--text-muted)',
                    fontWeight: '700',
                    fontSize: '0.82rem',
                    cursor: chatInput.trim() ? 'pointer' : 'default',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TrainerDashboard;
