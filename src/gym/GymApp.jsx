import { useMemo, useState } from 'react';
import GymOverview from './GymOverview';
import GymMembers from './GymMembers';
import GymTrainers from './GymTrainers';
import GymSoon from './GymSoon';
import GymPayments from './GymPayments';
import GymSettings from './GymSettings';
import GymLeads from './GymLeads';
import { GYM_COLOURS } from './gymView';
import { NAV } from './nav';

const Icon = ({ d }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map((p) => <path key={p} d={p} />)}
  </svg>
);

// The signed-in gym owner's workspace: sidebar + one page at a time. Loads the
// gym once and shares it with every page. `service` is injectable for tests.
export default function GymApp({ data, biz, bizError, service, onReload, onSignOut }) {
  const [page, setPage] = useState('overview');
  const [memberFilter, setMemberFilter] = useState('all');

  const owner = useMemo(() => data.trainers.find((t) => t.isOwner), [data]);

  // Jump to Members with a filter already chosen (tapping a card on Overview).
  const openMembers = (filter = 'all') => { setMemberFilter(filter); setPage('members'); };

  let body;
  if (page === 'overview') {
    body = <GymOverview data={data} biz={biz} service={service} onChanged={onReload} owner={owner} onOpenMembers={openMembers} />;
  } else if (page === 'members') {
    body = <GymMembers key={memberFilter} data={data} biz={biz} service={service} initialFilter={memberFilter} onChanged={onReload} />;
  } else if (page === 'trainers') {
    body = <GymTrainers data={data} biz={biz} service={service} onChanged={onReload} onOpenMembers={openMembers} />;
  } else if (page === 'payments') {
    body = <GymPayments data={data} biz={biz} bizError={bizError} service={service} onChanged={onReload} />;
  } else if (page === 'leads') {
    body = <GymLeads data={data} biz={biz} bizError={bizError} service={service} onChanged={onReload} />;
  } else if (page === 'settings') {
    body = <GymSettings biz={biz} bizError={bizError} gymName={data.gym.name} service={service} onSaved={onReload} />;
  } else {
    body = <GymSoon item={NAV.find((n) => n.key === page)} />;
  }

  return (
    <div className="gx-app" style={{ '--blue': GYM_COLOURS[biz?.settings?.brand_color] || GYM_COLOURS.blue }}>
      <aside className="gx-side">
        <div className="gx-logo">
          <span className="gx-logo-mark" aria-hidden="true" />
          <div>
            <div className="gx-logo-name">{data.gym.name}</div>
            <div className="gx-logo-sub">Gym Owner</div>
          </div>
        </div>
        <nav className="gx-nav" aria-label="Gym sections">
          {NAV.map((n) => (
            <button
              key={n.key} type="button"
              className={`gx-nav-item${page === n.key ? ' on' : ''}`}
              aria-current={page === n.key ? 'page' : undefined}
              onClick={() => setPage(n.key)}
            >
              <Icon d={n.icon} /> <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <button type="button" className="gx-signout" onClick={onSignOut}>Sign out</button>
      </aside>
      <main className="gx-main">{body}</main>
    </div>
  );
}
