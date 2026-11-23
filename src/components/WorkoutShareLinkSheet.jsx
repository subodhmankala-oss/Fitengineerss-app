import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import databaseService from '../services/databaseService';
import { drawSharePreview } from '../utils/sharePreviewImage';
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

// Computers without a share list get these instead. Instagram takes no link
// from a web page, so its button copies the message and opens the chats.
const enc = encodeURIComponent;
const WEB_APPS = [
  { name: 'Instagram', color: '#e1306c', href: () => 'https://www.instagram.com/direct/inbox/', copies: true, icon: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M16.500 7.500h.01" /></> },
  { name: 'Facebook', color: '#1877f2', href: ({ url }) => `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`, icon: <path d="M7 10v4h3v7h4v-7h3l1-4h-4V8a1 1 0 0 1 1-1h3V3h-3a5 5 0 0 0-5 5v2z" /> },
  { name: 'Telegram', color: '#229ed9', href: ({ url, line }) => `https://t.me/share/url?url=${enc(url)}&text=${enc(line)}`, icon: <path d="M15 10l-4 4 6 6 4-16-18 7 4 2 2 6 3-4" /> },
  { name: 'Email', color: 'var(--text-muted)', href: ({ title, text }) => `mailto:?subject=${enc(`My ${title} workout`)}&body=${enc(text)}`, icon: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></> },
];

// Longest the buttons wait for the message picture to be stored.
const PICTURE_WAIT_MS = 5000;

// Loads the message picture once, at the very address chat apps use, so it is
// waiting at the edge for them (2 s from the server, 0.1 s from there).
const warmPicture = (token) => fetch(`/w/${token}/preview.jpg`, { keepalive: true }).catch(() => {});

const bodySexOf = () => {
  try { return localStorage.getItem('userSex'); } catch { return null; /* storage blocked */ }
};

/**
 * "Share this workout": a read-only link to one saved workout (/w/<token>,
 * see sql/workout_shares.sql). The link only exists once it is sent or
 * copied; the switches then change what it shows, and "Stop sharing" ends it.
 * `workouts`: that day's workouts (shareableWorkout), one link each — more
 * than one shows a choice. `onChange(shares)` reports the owner's live links
 * after every change.
 */
export default function WorkoutShareLinkSheet({ workouts, onClose, onChange }) {
  const [pickedKey, setPickedKey] = useState(null);
  const workout = workouts.find(w => w.key === pickedKey) || workouts[0];
  return createPortal(
    <div className="wsl-backdrop" onClick={onClose}>
      <div className="wsl-sheet" role="dialog" aria-modal="true" aria-labelledby="wsl-title" onClick={e => e.stopPropagation()}>
        <div className="wsl-grip" aria-hidden="true" />
        {workouts.length > 1 && (
          <div className="wsl-pick" role="radiogroup" aria-label="Which workout">
            {workouts.map(w => (
              <button key={w.key} type="button" role="radio" aria-checked={w.key === workout.key} className={w.key === workout.key ? 'on' : ''} onClick={() => setPickedKey(w.key)}>{w.title}</button>
            ))}
          </div>
        )}
        <ShareOneWorkout key={workout.key} workout={workout} onChange={onChange} />
      </div>
    </div>,
    document.body
  );
}

function ShareOneWorkout({ workout, onChange }) {
  const { key: workoutKey, title, logDate, sets, durationSeconds, muscles } = workout;
  const [share, setShare] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [pictured, setPictured] = useState(() => !muscles?.length);
  const [flags, setFlags] = useState(DEFAULT_SHARE_FLAGS);
  const [newToken, setNewToken] = useState(newShareToken);
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const token = share?.token || newToken;
  const url = shareUrl(token, window.location.origin);
  const text = shareMessage({ title, sets, durationSeconds, url });
  const [line] = text.split('\n');

  const apply = (shares) => {
    const mine = shares.find(s => s.key === workoutKey) || null;
    setShare(mine);
    if (mine) setFlags({ showName: mine.showName, showMap: mine.showMap, showWeights: mine.showWeights, showCalories: mine.showCalories });
    onChange?.(shares);
  };

  useEffect(() => {
    let cancelled = false;
    databaseService.workoutShare('list')
      .then(({ shares }) => {
        if (cancelled) return;
        const mine = shares.find(s => s.key === workoutKey) || null;
        setShare(mine);
        if (mine) setFlags({ showName: mine.showName, showMap: mine.showMap, showWeights: mine.showWeights, showCalories: mine.showCalories });
        setLoaded(true);
      })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not reach the server. Try again.'); });
    return () => { cancelled = true; };
  }, [workoutKey]);

  // The message picture: drawn as soon as the sheet opens, stored once the
  // link's token is known. The buttons wait for it (a few seconds at most),
  // or the chat app looks before it is there and shows none.
  const flagsRef = useRef(flags);
  useEffect(() => { flagsRef.current = flags; }, [flags]);
  const drawing = useRef(null);
  const storedFor = useRef(null);
  useEffect(() => {
    if (!muscles?.length) return undefined;
    if (!drawing.current) drawing.current = drawSharePreview({ title, sets, durationSeconds, muscles, sex: bodySexOf() });
    if (!loaded || storedFor.current === token) return undefined;
    storedFor.current = token;
    const ready = () => setPictured(true);
    const timer = setTimeout(ready, PICTURE_WAIT_MS);
    drawing.current
      .then(async (image) => {
        if (!image) return;
        await databaseService.workoutShare('prepare', { logDate, key: workoutKey, token, image, flags: flagsRef.current, bodySex: bodySexOf(), title, sets, durationSeconds });
        await warmPicture(token);
      })
      .catch(e => console.warn('share preview:', e?.message || e))
      .then(() => { clearTimeout(timer); ready(); });
    return undefined;
  }, [loaded, token, muscles, title, sets, durationSeconds, logDate, workoutKey]);

  const run = async (op, payload, failed) => {
    setBusy(true);
    setError('');
    try {
      apply((await databaseService.workoutShare(op, { logDate, key: workoutKey, ...payload })).shares);
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

  const turnOn = async () => {
    const on = await run('save', { token, flags, bodySex: bodySexOf(), title, sets, durationSeconds });
    if (on && flags.showMap) warmPicture(token);
    return on;
  };

  const toggle = (key) => {
    const before = flags;
    const next = { ...flags, [key]: !flags[key] };
    setFlags(next);
    if (share) { run('flags', { flags: next }, () => setFlags(before)); return; }
    // Not sent yet: keep the prepared message preview in step (best effort;
    // sending saves these again).
    databaseService.workoutShare('flags', { logDate, key: workoutKey, flags: next }).catch(() => {});
  };

  const copy = async () => {
    // Copied in the same tap; a network wait first would lose permission on iPhone.
    const copied = navigator.clipboard?.writeText(text).then(() => true, () => false);
    const [didCopy, on] = await Promise.all([copied, turnOn()]);
    if (on) setNote(didCopy ? 'Copied. Paste it in any chat.' : 'Link is on. Press and hold the link to copy it.');
  };

  // The phone's own list: Instagram messages, Facebook, Telegram, SMS…
  const hasShareList = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shareMore = async () => {
    if (!hasShareList) { setMoreOpen(o => !o); return; }
    const wasOn = !!share;
    const picked = navigator.share({ title, text: line, url }).then(() => true, e => e?.name !== 'AbortError');
    const [kept, on] = await Promise.all([picked, turnOn()]);
    // Closed without picking anyone: don't leave a link on that wasn't before.
    if (on && !kept && !wasOn && await run('stop', {})) { setPictured(!muscles?.length); setNewToken(newShareToken()); }
  };

  const openWebApp = async (app) => {
    const copied = app.copies ? navigator.clipboard?.writeText(text).then(() => true, () => false) : null;
    const [didCopy, on] = await Promise.all([copied, turnOn()]);
    if (on && app.copies) setNote(didCopy ? `Copied. Paste it in a ${app.name} chat.` : 'Link is on. Copy it into a chat.');
  };

  const stop = async () => {
    if (!(await run('stop', {}))) return;
    // The stopped link must stay dead: sharing again makes a new one.
    setPictured(!muscles?.length);
    setNewToken(newShareToken());
    setNote('Sharing stopped');
  };

  const settled = loaded && !busy;
  const canSend = loaded && pictured;
  const ready = settled && pictured;

  return (
    <>
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
          <button key={s.key} type="button" role="switch" aria-checked={flags[s.key]} className={`wsl-switch${flags[s.key] ? ' on' : ''}`} onClick={() => toggle(s.key)} disabled={!settled}>
            <Icon>{s.icon}</Icon>{s.label}<span className="wsl-knob" aria-hidden="true" />
          </button>
        ))}

        <div className="wsl-ways three">
          {/* Stays a link while saving: the tap itself starts the save, and
              React re-renders before the browser follows the link, so taking
              href away when busy meant WhatsApp never opened. */}
          <a
            className={`wsl-way wa${canSend ? '' : ' is-off'}`}
            href={canSend ? `https://wa.me/?text=${enc(text)}` : undefined}
            target="_blank" rel="noopener noreferrer" aria-disabled={!canSend}
            onClick={() => { if (ready) turnOn(); }}
          >
            <Icon><path d="M3 21l1.900-5.700a8.500 8.500 0 1 1 3.800 3.800z" /></Icon>WhatsApp
          </a>
          <button type="button" className="wsl-way" onClick={copy} disabled={!ready}>
            <Icon><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Icon>Copy link
          </button>
          <button type="button" className="wsl-way" onClick={shareMore} disabled={!ready} aria-expanded={hasShareList ? undefined : moreOpen}>
            <ShareIcon size={19} />More apps
          </button>
        </div>
        {moreOpen && (
          <div className="wsl-apps">
            {WEB_APPS.map(app => (
              <a key={app.name} href={app.href({ url, line, text, title })} target="_blank" rel="noopener noreferrer" onClick={() => { if (ready) openWebApp(app); }}>
                <span style={{ color: app.color }}><Icon size={22}>{app.icon}</Icon></span>{app.name}
              </a>
            ))}
          </div>
        )}
        {error ? <p className="wsl-note err" role="alert">{error}</p>
          : note ? <p className="wsl-note" role="status">{note}</p>
            : loaded && !pictured ? <p className="wsl-note" role="status">Getting the picture ready…</p> : null}
    </>
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
