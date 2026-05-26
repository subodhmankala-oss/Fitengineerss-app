import './Navbar.css';

const Navbar = ({ activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: '◱' },
    { id: 'nutrition', label: 'Nutrition', icon: '🥗' },
    { id: 'training', label: 'Training', icon: '🏋️' },
    { id: 'content', label: 'Content Hub', icon: '📱' },
  ];

  return (
    <navbar className="navbar">
      <div className="navbar-container">
        <div className="brand" onClick={() => setActiveTab('dashboard')}>
          <img src="/logo.png" className="brand-logo-img" alt="Fitengineers Logo" />
          <span className="brand-name">Fitengineerss</span>
        </div>
        
        <div className="nav-links desktop-menu">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-btn ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        <div className="user-profile">
          <div className="avatar">JD</div>
          <span className="greeting">John Doe</span>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="mobile-menu">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`mobile-nav-btn ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            <span className="mobile-nav-icon">{item.icon}</span>
            <span className="mobile-nav-label">{item.label}</span>
          </button>
        ))}
      </div>
    </navbar>
  );
};

export default Navbar;
