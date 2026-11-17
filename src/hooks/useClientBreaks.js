import { useEffect, useCallback, useSyncExternalStore } from 'react';
import databaseService from '../services/databaseService';
import { normalizeBreak } from '../utils/clientBreaks';
import { notifyEvent } from '../utils/pushNotify';
import { getLocalDateString } from '../utils/dateUtils';

// The signed-in user's breaks ("Taking a break"), shared by every screen
// that shows them (Profile sheet, home card, Training Level, coach list)
// through one module-level store: a change on one screen shows on the
// others at once, and only one list request goes out per app open.
//
// For a client: their own breaks. For a coach: their clients' breaks.

// Tied to the account that loaded it: another sign-in on this tab starts fresh.
const currentUid = () => { try { return localStorage.getItem('userId') || null; } catch { return null; } };
const EMPTY = { breaks: null, role: null, error: null, uid: null };
let store = EMPTY;
let inflight = null;
const listeners = new Set();
const emit = () => listeners.forEach(l => l());
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const getSnapshot = () => store;

function set(body) {
  store = { breaks: (body?.breaks || []).map(normalizeBreak), role: body?.role || null, error: null, uid: currentUid() };
  emit();
}

function load(force = false) {
  if (store.uid && store.uid !== currentUid()) { store = EMPTY; inflight = null; }
  if (inflight) return inflight;
  if (store.breaks && !force) return Promise.resolve(store);
  inflight = Promise.resolve()
    .then(() => databaseService.clientBreaks('list'))
    .then(set)
    .catch(e => {
      // Keep whatever was on screen; an empty list means "no breaks" so the
      // rest of the app works exactly as before.
      store = { ...store, breaks: store.breaks || [], error: e.message, uid: currentUid() };
      emit();
    })
    .finally(() => { inflight = null; });
  return inflight;
}

// Test hook.
export function __resetClientBreaksStore() {
  store = EMPTY;
  inflight = null;
}

export default function useClientBreaks({ enabled = true } = {}) {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => { if (enabled) load(); }, [enabled]);

  // Client-only writes. Each tells the coach (client_break push — the
  // server writes the text from the saved row) and refreshes every screen.
  const run = useCallback(async (op, payload, breakOp) => {
    const body = await databaseService.clientBreaks(op, payload);
    set(body);
    const clientUserId = currentUid();
    if (clientUserId) notifyEvent('client_break', { clientUserId, breakOp });
    return store.breaks;
  }, []);

  const startBreak = useCallback((input) => run('start', input, 'start'), [run]);
  const updateBreak = useCallback((input) => run('update', input, 'update'), [run]);
  const endBreak = useCallback((id) => run('end', { id, today: getLocalDateString() }, 'end'), [run]);
  const refresh = useCallback(() => load(true), []);

  // The signed-in person's own breaks — never a coach's view of a client's.
  const ownBreaks = state.breaks ? state.breaks.filter(b => b.clientUserId === state.uid) : null;

  return { breaks: state.breaks, ownBreaks, role: state.role, error: state.error, startBreak, updateBreak, endBreak, refresh };
}
