import { useCallback, useEffect, useRef, useState } from 'react';
import Avatar from '../components/Avatar';
import { liveBoard, liveSexCounts } from './gymView';

const REFRESH_MS = 20000;
const ROW_H = 64;
const PODIUM_ORDER = [1, 0, 2]; // 2nd, 1st, 3rd

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

// Live calorie board: members ranked by calories burned (today or this week),
// refreshed every 20 s. Rows slide to their new place when someone moves up.
// Made to be left open on a gym TV (Full screen).
export default function GymLive({ service }) {
  const [live, setLive] = useState(null);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('today');
  const [sex, setSex] = useState('all');
  const [updatedAt, setUpdatedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [moves, setMoves] = useState({});
  const prevRanks = useRef({});
  const boardRef = useRef(null);
  const moveTimer = useRef(null);

  const load = useCallback(async () => {
    const r = await service.getGymLive();
    if (!r.success) { setError(r.error); return; }
    // Who moved up since the last refresh, per period.
    const up = {};
    for (const p of ['today', 'week']) {
      const prev = prevRanks.current[p];
      const next = {};
      liveBoard(r, p).forEach((m, i) => {
        next[m.id] = i;
        if (prev && prev[m.id] !== undefined && prev[m.id] > i && m.kcal > 0) up[p] = { ...up[p], [m.id]: prev[m.id] - i };
      });
      prevRanks.current[p] = next;
    }
    const t = Date.now();
    setLive(r); setError(''); setUpdatedAt(t); setNow(t);
    if (Object.keys(up).length) {
      setMoves(up);
      clearTimeout(moveTimer.current);
      moveTimer.current = setTimeout(() => setMoves({}), 8000);
    }
  }, [service]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, REFRESH_MS);
    const clock = setInterval(() => setNow(Date.now()), 5000);
    return () => { clearTimeout(first); clearInterval(id); clearInterval(clock); clearTimeout(moveTimer.current); };
  }, [load]);

  const rows = liveBoard(live, period, sex);
  const counts = liveSexCounts(live);
  const active = rows.filter((r) => r.kcal > 0);
  const top = active[0]?.kcal || 1;
  const moved = moves[period] || {};

  const fullScreen = () => {
    const el = boardRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.();
  };

  const ago = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const totalKcal = active.reduce((s, r) => s + r.kcal, 0);

  return (
    <div className="gx-stack">
      <div className="gx-head">
        <div>
          <h1 className="gx-h1">Live board</h1>
          <p className="gx-sub">Who is burning the most calories. Updates by itself every 20 seconds.</p>
        </div>
        <button type="button" className="gx-btn gx-btn-soft" onClick={fullScreen}>Full screen</button>
      </div>

      <section ref={boardRef} className="gx-live">
        <div className="gx-live-top">
          <span className="gx-live-badge"><span className="gx-live-dot" aria-hidden="true" />{error ? 'PAUSED' : 'LIVE'}</span>
          <span className="gx-live-status">{error ? 'Not updating' : ago === null ? 'Connecting…' : `Updated ${ago < 5 ? 'just now' : `${ago}s ago`}`}</span>
          <div className="gx-live-toggle" role="group" aria-label="Period">
            {[['today', 'Today'], ['week', 'This week']].map(([k, label]) => (
              <button key={k} type="button" className={period === k ? 'on' : ''} aria-pressed={period === k} onClick={() => setPeriod(k)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="gx-live-tabs" role="tablist" aria-label="Who to show">
          {[['all', 'All', counts.all], ['male', 'Male', counts.male], ['female', 'Female', counts.female]].map(([k, label, n]) => (
            <button key={k} type="button" role="tab" aria-selected={sex === k} className={sex === k ? 'on' : ''} onClick={() => setSex(k)}>
              {label}<span>{n}</span>
            </button>
          ))}
        </div>

        {error && !live && <p className="gx-live-empty">{error}</p>}
        {!live && !error && <p className="gx-live-empty">Loading…</p>}

        {live && (
          <>
            <div className="gx-live-summary">
              <div><b>{fmt(totalKcal)}</b><span>kcal burned {period === 'today' ? 'today' : 'this week'}</span></div>
              <div><b>{active.length}</b><span>{active.length === 1 ? 'member' : 'members'} trained{sex !== 'all' ? ` · ${sex === 'male' ? 'men' : 'women'}` : ''}</span></div>
              <div><b>{rows.reduce((s, r) => s + r.sessions, 0)}</b><span>workouts logged</span></div>
            </div>

            {active.length === 0 ? (
              <p className="gx-live-empty">Nobody{sex === 'all' ? '' : sex === 'male' ? ' in the men’s group' : ' in the women’s group'} has finished a workout {period === 'today' ? 'today' : 'this week'} yet. The first one to log goes straight to the top.</p>
            ) : (
              <div className="gx-live-podium">
                {PODIUM_ORDER.map((i) => {
                  const r = active[i];
                  if (!r) return <div key={`empty-${i}`} className="gx-live-pod empty" />;
                  return (
                    <div key={r.id} className={`gx-live-pod p${i + 1}${moved[r.id] ? ' moved' : ''}`}>
                      <span className="gx-live-avatar"><Avatar email={r.email} name={r.name} avatarUrl={r.avatarUrl} size={42} /></span>
                      <span className="gx-live-pod-name">{r.name}</span>
                      <span className="gx-live-pod-bar"><i>{i + 1}</i><b>{fmt(r.kcal)}</b><small>kcal</small></span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="gx-live-head" aria-hidden="true"><span>#</span><span /><span>MEMBER</span><span className="bar" /><span>KCAL</span></div>
            <ol className="gx-live-list" style={{ height: rows.length * ROW_H }}>
              {rows.map((r, i) => (
                <li
                  key={r.id}
                  className={`gx-live-row${r.kcal ? '' : ' idle'}${moved[r.id] ? ' moved' : ''}${i < 3 && r.kcal ? ` top${i + 1}` : ''}`}
                  style={{ transform: `translateY(${i * ROW_H}px)` }}
                >
                  <span className="gx-live-rank">{i + 1}</span>
                  <span className="gx-live-avatar sm"><Avatar email={r.email} name={r.name} avatarUrl={r.avatarUrl} size={32} /></span>
                  <span className="gx-live-who">
                    <span className="gx-live-name">{r.name}</span>
                    <span className="gx-live-meta">
                      {r.sessions ? `${r.sessions} workout${r.sessions === 1 ? '' : 's'}` : 'No workout yet'}
                      {moved[r.id] ? <em> · up {moved[r.id]}</em> : null}
                    </span>
                  </span>
                  <span className="gx-live-bar" aria-hidden="true"><i style={{ width: `${Math.round((r.kcal / top) * 100)}%` }} /></span>
                  <span className="gx-live-kcal"><b>{fmt(r.kcal)}</b> kcal</span>
                </li>
              ))}
            </ol>
            {sex !== 'all' && counts.unset > 0 && (
              <p className="gx-live-note">{counts.unset} member{counts.unset === 1 ? ' hasn’t' : 's haven’t'} said male or female yet, so {counts.unset === 1 ? 'they show' : 'they show'} only under All.</p>
            )}
            <p className="gx-live-note">Calories are counted when a member saves a workout in the app, so a workout shows up here as soon as it is finished.</p>
          </>
        )}
      </section>
    </div>
  );
}
