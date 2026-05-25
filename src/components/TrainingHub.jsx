import './TrainingHub.css';

const TrainingHub = () => {
  const sessions = [
    {
      id: 1,
      type: 'in-person',
      title: 'Face-to-Face: Heavy Lower Body',
      date: 'Today',
      details: [
        'Squats: 4 x 8 @ 100kg (Form looks solid, push knees out more)',
        'Romanian Deadlifts: 3 x 10 @ 80kg',
        'Leg Press: 3 x 12 @ 150kg'
      ]
    },
    {
      id: 2,
      type: 'remote',
      title: 'Active Recovery & Mobility',
      date: 'Tomorrow',
      details: [
        '15 min dynamic stretching flow (Focus on hips)',
        '20 min light zone 2 cardio (Cycling or walking)'
      ]
    }
  ];

  return (
    <div className="training-container">
      <header className="training-header">
        <h2 className="section-title">Hybrid Training Hub</h2>
        <p className="section-desc">Your central hub for logged heavy lifts during in-person sessions and assigned remote mobility work.</p>
      </header>
      
      <div className="sessions-list">
        {sessions.map(session => (
          <div key={session.id} className={`glass-panel session-card ${session.type}`}>
            <div className="session-header">
              <div className="session-title-group">
                <span className={`status-dot ${session.type}`}></span>
                <h3>{session.title}</h3>
              </div>
              <span className="session-date">{session.date}</span>
            </div>
            
            <ul className="session-details">
              {session.details.map((detail, idx) => (
                <li key={idx} className="detail-item">
                  <span className="check-icon">✓</span>
                  {detail}
                </li>
              ))}
            </ul>

            {session.type === 'remote' ? (
              <button className="btn-secondary mark-complete-btn">Mark as Completed</button>
            ) : (
              <div className="coach-feedback">
                <strong>Coach Note:</strong> Great intensity today! Keep prioritizing the eccentric phase.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TrainingHub;
