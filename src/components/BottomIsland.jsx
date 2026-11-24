import './BottomIsland.css';

// `duo` shapes get a light fill while their tab is open.
const CLIENT_TABS = [
  {
    id: 'home',
    label: 'Home',
    icon: (
      <>
        <path className="duo" d="M3 9.5 12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M9.5 22v-8h5v8" />
      </>
    ),
  },
  {
    id: 'workouts',
    label: 'Workout',
    icon: (
      <>
        <path className="duo" d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" />
        <path className="duo" d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" />
        <path d="m2.5 21.5 1.4-1.4M20.1 3.9l1.4-1.4M9.6 14.4l4.8-4.8" />
      </>
    ),
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <>
        <circle className="duo" cx="12" cy="8" r="4" />
        <path className="duo" d="M20 21a8 8 0 1 0-16 0" />
      </>
    ),
  },
];

/**
 * Floating bottom tabs: a small capsule. Only the open tab shows its name; the
 * tinted, ringed pill slides and the tab widens together. The client app's main
 * tabs by default; the coach's client screen passes its own (CoachDetailTabs).
 * `isLive` marks a tab whose clock is running.
 */
export default function BottomIsland({
  activeTab, onSelect, hasDot = () => false, isLive = () => false,
  tabs = CLIENT_TABS, label: navLabel = 'Main', className = '',
}) {
  const activeIndex = tabs.findIndex((t) => t.id === activeTab);
  return (
    <nav className={`bottom-nav ${className}`.trim()} aria-label={navLabel}>
      <div className="bottom-island" style={{ '--count': tabs.length }}>
        {activeIndex >= 0 && (
          <span className="bottom-island-pill" style={{ '--i': activeIndex }} aria-hidden="true" />
        )}
        {tabs.map(({ id, label, icon, tour }) => {
          const active = id === activeTab;
          const dot = !active && hasDot(id);
          const live = isLive(id);
          return (
            <button
              key={id}
              type="button"
              className={`nav-item ${active ? 'active' : ''}`}
              aria-label={`${label}${live ? ', running' : ''}${dot ? ', new' : ''}`}
              aria-current={active ? 'page' : undefined}
              data-tour={tour}
              onClick={() => onSelect(id)}
            >
              <span className="icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>
                {live && <span className="nav-live-dot" aria-hidden="true" />}
                {dot && !live && <span className="unread-dot nav-unread-dot" aria-hidden="true" />}
              </span>
              <span className="nav-item-label" aria-hidden="true">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
