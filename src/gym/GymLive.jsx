import { useCallback, useEffect, useRef, useState } from 'react';
import Avatar from '../components/Avatar';
import { LIVE_METRICS, liveBoard, liveMonthBoard, liveSexCounts } from './gymView';

const FULL_REFRESH_MS = 30000; // saved workouts for the day / week
// Who is mid-workout, and their calories so far: every 2 s while anyone is
// training, every 5 s while nobody is. Nothing runs while the page is hidden.
const ACTIVE_REFRESH_MS = 2000;
const IDLE_REFRESH_MS = 5000;
const ROW_H = 64;
const PODIUM_ORDER = [1, 0, 2]; // 2nd, 1st, 3rd

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

// Live calorie board: members ranked by calories burned (today or this week),
// refreshed every few seconds. Rows slide to their new place when someone moves up.
// Made to be left open on a gym TV (Full screen).
// publicView = the shared no-login page (GymPublicBoard): no owner controls.
export default function GymLive({ service, publicView = false, fullMs = FULL_REFRESH_MS, activeMs = ACTIVE_REFRESH_MS, idleMs = IDLE_REFRESH_MS }) {
  const [live, setLive] = useState(null);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('today');
  const [sex, setSex] = useState('all');
  const [metric, setMetric] = useState('kcal');
  const [updatedAt, setUpdatedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [moves, setMoves] = useState({});
  const [shareMsg, setShareMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const prevRanks = useRef({});
  const boardRef = useRef(null);
  const moveTimer = useRef(null);
  const liveRef = useRef(null);
  const inFlight = useRef({});

  // light = only the open workouts (every few seconds); otherwise everything.
  // A set ticked in the app is saved to the member's open workout within a second,
  // so it shows up here on the next light refresh.
  const load = useCallback(async (light = false) => {
    const kind = light ? 'light' : 'full';
    if (inFlight.current[kind]) return;
    inFlight.current[kind] = true;
    let r;
    try { r = await service.getGymLive({ light }); } finally { inFlight.current[kind] = false; }
    if (!r.success) { setError(r.error); return; }
    if (light) {
      if (!liveRef.current) return;
      const stillOpen = new Set((r.inProgress || []).map((w) => w.memberId));
      const finished = (liveRef.current.inProgress || []).some((w) => !stillOpen.has(w.memberId));
      r = { ...liveRef.current, inProgress: r.inProgress || [] };
      // Someone just finished: their calories move to saved workouts, so read
      // those now or their total would dip until the next full refresh.
      if (finished) { liveRef.current = r; await load(false); return; }
    }
    liveRef.current = r;
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
    let stopped = false;
    let fast;
    const tick = async () => {
      if (!document.hidden) await load(true);
      if (stopped) return;
      fast = setTimeout(tick, liveRef.current?.inProgress?.length ? activeMs : idleMs);
    };
    const first = setTimeout(async () => { await load(false); if (!stopped) fast = setTimeout(tick, activeMs); }, 0);
    const id = setInterval(() => { if (!document.hidden) load(false); }, fullMs);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    // Back on the page: catch up at once.
    const onShow = () => { if (!document.hidden) load(false); };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      stopped = true;
      clearTimeout(first); clearTimeout(fast); clearInterval(id); clearInterval(clock); clearTimeout(moveTimer.current);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [load, fullMs, activeMs, idleMs]);

  const isKcal = metric === 'kcal';
  const metricInfo = LIVE_METRICS.find((m) => m.key === metric);
  const rows = isKcal ? liveBoard(live, period, sex) : liveMonthBoard(live, metric, sex);
  const counts = liveSexCounts(live);
  const active = rows.filter((r) => r.value > 0);
  const top = active[0]?.value || 1;
  const moved = isKcal ? (moves[period] || {}) : {};
  const unit = isKcal ? 'kcal' : metricInfo.unit;
  const plus = metric === 'improved' ? '+' : '';

  const fullScreen = () => {
    const el = boardRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.();
  };

  const ago = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const totalKcal = isKcal ? active.reduce((s, r) => s + r.kcal, 0) : 0;
  const shareUrl = live?.boardToken ? `${window.location.origin}/gym/board/${live.boardToken}` : '';

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setShareMsg('Link copied.'); } catch { setShareMsg('Could not copy. Select the link and copy it.'); }
  };
  const resetLink = async () => {
    setConfirmReset(false);
    const r = await service.gymResetBoardLink();
    setShareMsg(r.success ? 'New link made. The old one stops working within 15 seconds.' : r.error);
    if (r.success) load(false);
  };

  return (
    <div className="gx-stack">
      <div className="gx-head">
        <div>
          <h1 className="gx-h1">{publicView && live?.gym?.name ? `${live.gym.name} live board` : 'Live board'}</h1>
          <p className="gx-sub">Who is burning the most calories. A set ticked in the app shows up here within a few seconds.</p>
        </div>
        <button type="button" className="gx-btn gx-btn-soft" onClick={fullScreen}>Full screen</button>
      </div>

      {!publicView && shareUrl && (
        <section className="gx-card gx-share">
          <div>
            <h2 className="gx-h2">Share this board</h2>
            <p className="gx-sub">Anyone with this link can watch the board without logging in. It shows first name, last initial, photo and calories.</p>
          </div>
          <input className="gx-input" readOnly value={shareUrl} aria-label="Link to the live board" onFocus={(e) => e.target.select()} />
          <div className="gx-actions">
            <button type="button" className="gx-btn gx-btn-dark" onClick={copyLink}>Copy link</button>
            {confirmReset
              ? <><button type="button" className="gx-btn gx-btn-soft" onClick={resetLink}>Yes, stop the old link</button><button type="button" className="gx-link" onClick={() => setConfirmReset(false)}>Cancel</button></>
              : <button type="button" className="gx-btn gx-btn-soft" onClick={() => setConfirmReset(true)}>Change link</button>}
          </div>
          {shareMsg && <p className="gx-sub" role="status">{shareMsg}</p>}
        </section>
      )}

      <section ref={boardRef} className="gx-live">
        <div className="gx-live-top">
          <span className="gx-live-badge"><span className="gx-live-dot" aria-hidden="true" />{error ? 'PAUSED' : 'LIVE'}</span>
          <span className="gx-live-status">{error ? 'Not updating' : ago === null ? 'Connecting…' : `Updated ${ago < 3 ? 'just now' : `${ago}s ago`}`}</span>
          {isKcal ? (
            <div className="gx-live-toggle" role="group" aria-label="Period">
              {[['today', 'Today'], ['week', 'This week']].map(([k, label]) => (
                <button key={k} type="button" className={period === k ? 'on' : ''} aria-pressed={period === k} onClick={() => setPeriod(k)}>{label}</button>
              ))}
            </div>
          ) : <span className="gx-live-status">This month</span>}
        </div>

        <div className="gx-live-toggle gx-live-metrics" role="group" aria-label="Ranking">
          {LIVE_METRICS.map((m) => (
            <button key={m.key} type="button" className={metric === m.key ? 'on' : ''} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</button>
          ))}
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
            {isKcal && <div className="gx-live-summary">
              <div><b>{fmt(totalKcal)}</b><span>kcal burned {period === 'today' ? 'today' : 'this week'}</span></div>
              <div><b>{active.length}</b><span>{active.length === 1 ? 'member' : 'members'} trained{sex !== 'all' ? ` · ${sex === 'male' ? 'men' : 'women'}` : ''}</span></div>
              <div><b>{rows.reduce((s, r) => s + r.sessions, 0)}</b><span>workouts logged</span></div>
            </div>}

            {active.length === 0 ? (
              !isKcal ? <p className="gx-live-empty">{metricInfo.empty}</p> : <p className="gx-live-empty">Nobody{sex === 'all' ? '' : sex === 'male' ? ' in the men’s group' : ' in the women’s group'} has finished a workout {period === 'today' ? 'today' : 'this week'} yet. The first one to log goes straight to the top.</p>
            ) : (
              <div className="gx-live-podium">
                {PODIUM_ORDER.map((i) => {
                  const r = active[i];
                  if (!r) return <div key={`empty-${i}`} className="gx-live-pod empty" />;
                  return (
                    <div key={r.id} className={`gx-live-pod p${i + 1}${moved[r.id] ? ' moved' : ''}`}>
                      <span className="gx-live-avatar"><Avatar email={r.email} name={r.name} avatarUrl={r.avatarUrl} size={42} /></span>
                      <span className="gx-live-pod-name">{r.working && <i className="gx-live-pod-live" aria-label="working out now" />}{r.name}</span>
                      <span className="gx-live-pod-bar"><i>{i + 1}</i><b>{plus}{fmt(r.value)}</b><small>{unit}</small></span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="gx-live-head" aria-hidden="true"><span>#</span><span /><span>MEMBER</span><span className="bar" /><span>{unit.toUpperCase()}</span></div>
            <ol className="gx-live-list" style={{ height: rows.length * ROW_H }}>
              {rows.map((r, i) => (
                <li
                  key={r.id}
                  className={`gx-live-row${r.value ? '' : ' idle'}${moved[r.id] ? ' moved' : ''}${i < 3 && r.value ? ` top${i + 1}` : ''}`}
                  style={{ transform: `translateY(${i * ROW_H}px)` }}
                >
                  <span className="gx-live-rank">{i + 1}</span>
                  <span className="gx-live-avatar sm"><Avatar email={r.email} name={r.name} avatarUrl={r.avatarUrl} size={32} /></span>
                  <span className="gx-live-who">
                    <span className="gx-live-name">{r.name}</span>
                    <span className="gx-live-meta">
                      {!isKcal ? (r.value ? '' : 'None yet') : r.working ? <span className="gx-live-working"><i aria-hidden="true" />{r.withTrainer ? 'With trainer' : 'Working out'} · {r.workingSets} set{r.workingSets === 1 ? '' : 's'} done</span>
                        : r.sessions ? `${r.sessions} workout${r.sessions === 1 ? '' : 's'}` : 'No workout yet'}
                      {moved[r.id] ? <em> · up {moved[r.id]}</em> : null}
                    </span>
                  </span>
                  <span className="gx-live-bar" aria-hidden="true"><i style={{ width: `${Math.round((r.value / top) * 100)}%` }} /></span>
                  <span className="gx-live-kcal"><b key={r.value} className={r.working ? 'flash' : ''}>{plus}{fmt(r.value)}</b> {unit}</span>
                </li>
              ))}
            </ol>
            {sex !== 'all' && counts.unset > 0 && (
              <p className="gx-live-note">{counts.unset} member{counts.unset === 1 ? ' hasn’t' : 's haven’t'} said male or female yet, so {counts.unset === 1 ? 'they show' : 'they show'} only under All.</p>
            )}
            <p className="gx-live-note">{isKcal ? 'Calories climb as members tick their sets in the app.' : metric === 'consistent' ? 'Days with at least one saved workout this month.' : 'Workouts this month compared with the same days of last month. Needs a workout in that span last month.'}</p>
          </>
        )}
      </section>
    </div>
  );
}
