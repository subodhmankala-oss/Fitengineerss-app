// Tracks which coach-assigned plan IDs this client has already opened (i.e.
// pressed Start on), scoped per-user via localStorage since there's no
// server-side "viewed" column on workout_plans. Shared by WorkoutTracker's
// "new" dot on plan cards and the Home screen's "New plan from your coach"
// card, which shows a plan only until it's opened.
const OPENED_PLANS_KEY_PREFIX = 'wt_opened_coach_plan_ids';

export const getOpenedPlanIds = () => {
  try {
    const userId = localStorage.getItem('userId') || 'anon';
    const raw = localStorage.getItem(`${OPENED_PLANS_KEY_PREFIX}_${userId}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};

export const markPlanOpened = (planId) => {
  if (!planId) return;
  try {
    const userId = localStorage.getItem('userId') || 'anon';
    const ids = getOpenedPlanIds();
    ids.add(planId);
    localStorage.setItem(`${OPENED_PLANS_KEY_PREFIX}_${userId}`, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
};

// Home only surfaces plans sent recently — without it, every old plan a
// client never happened to log (or opened on another device) would show up
// as "new" the day this card shipped. Older ones stay in Log Sets.
export const NEW_PLAN_WINDOW_DAYS = 7;

// Coach-assigned plans the client hasn't started yet. localStorage alone is
// per-device, so a plan also counts as started once any workout log carries
// its name on or after the day it was assigned — covers a client who started
// it on another phone.
export const getUnopenedCoachPlans = (plans, logs = [], now = Date.now()) => {
  const opened = getOpenedPlanIds();
  const cutoff = now - NEW_PLAN_WINDOW_DAYS * 86400000;
  return (plans || []).filter(p => {
    if (p.createdBy !== 'coach' || p.isAssigned === false || !p.id) return false;
    if (opened.has(p.id)) return false;
    const assignedAt = new Date(p.createdAt).getTime();
    if (!Number.isFinite(assignedAt) || assignedAt < cutoff) return false;
    const assignedDay = (p.createdAt || '').slice(0, 10);
    const name = (p.planName || '').trim().toLowerCase();
    return !logs.some(l => {
      const logName = (l.plan_name || l.planName || '').trim().toLowerCase();
      return name && logName === name && (!assignedDay || (l.log_date || '') >= assignedDay);
    });
  });
};
