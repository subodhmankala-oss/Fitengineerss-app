import { useUnreadNewsCount } from './useAdminNews';

// One tab in the founder's phone bar (My Clients / News / Super-Admin) in
// TrainerDashboard.jsx: line icon on top, label below, optional corner
// bubble. Tint + ring when active (no solid fill), each tab its own hue.

const ICONS = {
  clients: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  news: (
    <>
      <path d="M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1-4 0V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a3 3 0 0 0 3 3h11" />
      <path d="M8 8h4M8 12h4M8 16h4" />
    </>
  ),
  admin: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
};

export default function RoleTab({ kind, label, active, onClick, count = 0, countTone = 'info', dot = false, dotLabel }) {
  return (
    <button
      type="button"
      className={`role-tab role-tab-${kind}${active ? ' active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="role-tab-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {ICONS[kind]}
        </svg>
        {count > 0 && (
          <span className={`role-tab-bubble role-tab-bubble-${countTone}`} aria-label={`${count}`}>{count > 99 ? '99+' : count}</span>
        )}
        {dot && <span className="role-tab-dot" aria-label={dotLabel} />}
      </span>
      <span className="role-tab-label">{label}</span>
    </button>
  );
}

// News tab with today's unread-stories bubble (red; clears once the news
// has been on screen — see markNewsSeen in useAdminNews.js).
export function NewsRoleTab({ active, onClick }) {
  const unread = useUnreadNewsCount();
  return <RoleTab kind="news" label="News" active={active} onClick={onClick} count={active ? 0 : unread} countTone="alert" />;
}
