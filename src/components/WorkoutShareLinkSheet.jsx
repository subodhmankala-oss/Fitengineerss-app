import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import databaseService from '../services/databaseService';
import { DEFAULT_SHARE_FLAGS, newShareToken, shareMessage, shareUrl } from '../utils/workoutShare';
import { ShareIcon } from './TimerIcons';
import './WorkoutShareLinkSheet.css';

const Icon = ({ size = 19, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const EyeIcon = () => <Icon size={14}><path d="M2 12c2.5-4.7 5.8-7 10-7s7.500 2.300 10 7c-2.500 4.700-5.800 7-10 7s-7.500-2.300-10-7" /><circle cx="12" cy="12" r="3" /></Icon>;

const SWITCHES = [
  { key: 'showName', label: 'Show my first name', icon: <><circle cx="12" cy="7" r="4" /><path d="M5 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" /></> },
  { key: 'showMap', label: 'Show muscle map', icon: <><circle cx="12" cy="5" r="2" /><path d="M5 9l4 1h6l4-1M9 10l1 5-2 6M15 10l-1 5 2 6" /></> },
  { key: 'showWeights', label: 'Show weights', icon: <path d="M2 12h4M6 7v10M9 5v14M9 12h6M15 5v14M18 7v10M18 12h4" /> },
  { key: 'showCalories', label: 'Show calories', icon: <path d="M12 12c2-2.960 0-7-1-8 0 3.040-1.770 4.740-3 6-1.230 1.260-2 3.240-2 5a6 6 0 1 0 12 0c0-1.530-1.060-3.940-2-5-1.790 3-2.790 3-4 2z" /> },
];

/**
 * "Share this workout": a read-only link to one saved workout (/w/<token>,
 * see sql/workout_shares.sql). The link only exists once it is sent or
 * copied; the switches then change what it shows, and "Stop sharing" ends it.
 * `workout`: { title, logDate, sets, durationSeconds, sessionId? } — sessionId
 * only right after Save, when the rows may not have reached the server yet.
 * `onChange(shares)` reports the owner's live links after every change.
 */
export default function WorkoutShareLinkSheet({ workout, onClose, onChange }) {
  const { title, logDate, sets, durationSeconds, sessionId } = workout;
  const [share, setShare] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [flags, setFlags] = useState(DEFAULT_SHARE_FLAGS);
  const [newToken, setNewToken] = useState(newShareToken);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const token = share?.token || newToken;
  const url = shareUrl(token, window.location.origin);
  const text = shareMessage({ title, sets, durationSeconds, url });

  const apply = (shares) => {
    const mine = shares.find(s => s.logDate === logDate) || null;
    setShare(mine);
    if (mine) setFlags({ showName: mine.showName, showMap: mine.showMap, showWeights: mine.showWeights, showCalories: mine.showCalories });
    onChange?.(shares);
  };

  useEffect(() => {
    let cancelled = false;
    databaseService.workoutShare('list')
      .then(({ shares }) => {
        if (cancelled) return;
        const mine = shares.find(s => s.logDate === logDate) || null;
        setShare(mine);
        if (mine) setFlags({ showName: mine.showName, showMap: mine.showMap, showWeights: mine.showWeights, showCalories: mine.showCalories });
        setLoaded(true);
      })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not reach the server. Try again.'); });
    return () => { cancelled = true; };
  }, [logDate]);

  const run = async (op, payload, failed) => {
    setBusy(true);
    setError('');
    try {
      apply((await databaseService.workoutShare(op, { logDate, ...payload })).shares);
      return true;
    } catch (e) {
      setNote('');
      setError(e.message || 'Could not reach the server. Try again.');
      failed?.();
      return false;
    } finally {
      setBusy(false);
    }
  };

  const turnOn = () => {
    let bodySex = null;
    try { bodySex = localStorage.getItem('userSex'); } catch { /* storage blocked */ }
    return run('save', { token, sessionId, flags, bodySex });
  };

  const toggle = (key) => {
    const before = flags;
    const next = { ...flags, [key]: !flags[key] };
    setFlags(next);
    if (share) run('flags', { flags: next }, () => setFlags(before));
  };

  const copy = async () => {
    // Copied in the same tap; a network wait first would lose permission on iPhone.
    const copied = navigator.clipboard?.writeText(url).then(() => true, () => false);
    const [didCopy, on] = await Promise.all([copied, turnOn()]);
    if (on) setNote(didCopy ? 'Link copied' : 'Link is on. Press and hold the link to copy it.');
  };

  // The phone's own list: Instagram messages, Facebook, Telegram, SMS…
  const canShareMore = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shareMore = async () => {
    const wasOn = !!share;
    const [line] = text.split('\n');
    const picked = navigator.share({ title, text: line, url }).then(() => true, e => e?.name !== 'AbortError');
    const [kept, on] = await Promise.all([picked, turnOn()]);
    // Closed without picking anyone: don't leave a link on that wasn't before.
    if (on && !kept && !wasOn && await run('stop', {})) setNewToken(newShareToken());
  };

  const stop = async () => {
    if (!(await run('stop', {}))) return;
    // The stopped link must stay dead: sharing again makes a new one.
    setNewToken(newShareToken());
    setNote('Sharing stopped');
  };

  const ready = loaded && !busy;

  return createPortal(
    <div className="wsl-backdrop" onClick={onClose}>
      <div className="wsl-sheet" role="dialog" aria-modal="true" aria-labelledby="wsl-title" onClick={e => e.stopPropagation()}>
        <div className="wsl-grip" aria-hidden="true" />
        {share && (
          <div className="wsl-live">
            <Icon><path d="M9 15l6-6M11 6l.5-.5a5 5 0 0 1 7 7L18 13M13 18l-.5.5a5 5 0 0 1-7-7L6 11" /></Icon>
            <span className="wsl-live-text">Link is on<small>{url.replace(/^https?:\/\//, '')}</small></span>
            <button type="button" onClick={stop} disabled={busy}>Stop sharing</button>
          </div>
        )}
        <h3 id="wsl-title" className="wsl-title">Share {title}</h3>
        <p className="wsl-sub"><EyeIcon /> Anyone with the link can look. They can’t change it.</p>

        {SWITCHES.map(s => (
          <button key={s.key} type="button" role="switch" aria-checked={flags[s.key]} className={`wsl-switch${flags[s.key] ? ' on' : ''}`} onClick={() => toggle(s.key)} disabled={!ready}>
            <Icon>{s.icon}</Icon>{s.label}<span className="wsl-knob" aria-hidden="true" />
          </button>
        ))}

        <div className={`wsl-ways${canShareMore ? ' three' : ''}`}>
          {/* Stays a link while saving: the tap itself starts the save, and
              React re-renders before the browser follows the link, so taking
              href away when busy meant WhatsApp never opened. */}
          <a
            className={`wsl-way wa${loaded ? '' : ' is-off'}`}
            href={loaded ? `https://wa.me/?text=${encodeURIComponent(text)}` : undefined}
            target="_blank" rel="noopener noreferrer" aria-disabled={!loaded}
            onClick={() => { if (ready) turnOn(); }}
          >
            <Icon><path d="M3 21l1.900-5.700a8.500 8.500 0 1 1 3.800 3.800z" /></Icon>WhatsApp
          </a>
          <button type="button" className="wsl-way" onClick={copy} disabled={!ready}>
            <Icon><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Icon>Copy link
          </button>
          {canShareMore && (
            <button type="button" className="wsl-way" onClick={shareMore} disabled={!ready}>
              <ShareIcon size={19} />More apps
            </button>
          )}
        </div>
        {error ? <p className="wsl-note err" role="alert">{error}</p> : note ? <p className="wsl-note" role="status">{note}</p> : null}
      </div>
    </div>,
    document.body
  );
}

/** Share on the Daily card; a green dot means this workout's link is on. */
export function ShareWorkoutButton({ live, onClick }) {
  return (
    <button type="button" className={`missed-ex-entry-btn icon-only wsl-entry${live ? ' live' : ''}`} onClick={onClick} aria-label={live ? 'Share workout, link is on' : 'Share workout'} title="Share workout">
      <ShareIcon size={14} />
    </button>
  );
}
