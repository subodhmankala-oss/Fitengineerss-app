// Generated on the fly via Web Audio — no audio asset to ship/load, works
// instantly offline. A short triple-beep pattern (like a real kitchen/
// interval timer) rather than a single blip, so it's actually noticeable if
// whoever's watching the timer isn't looking at the screen when it ends.
// Shared by ClockTimerModal (rest/warmup popup) and the rest-between-sets
// timer on both the client and coach Live Log sides, so every countdown in
// the app sounds the same.
//
// MOBILE SILENCE FIX: this used to create a brand-new AudioContext on every
// single call and never call .resume() on it. That's silent-by-default on
// iOS/Android — a fresh AudioContext starts "suspended" until a user
// gesture unlocks it, and critically, the actual alarm call always fires
// from a setInterval tick (the countdown reaching 0), never from a click
// itself, so there was never a gesture in that call stack to unlock it.
// Desktop browsers are far more lenient about this (usually silent-safe
// even without an explicit resume), which is why this went unnoticed there.
//
// The fix: one AudioContext for the whole page session (created lazily),
// paired with unlockAudio() — call that from an actual click handler (a
// Start/Play button) to .resume() this same context synchronously inside
// the gesture. Every later alarm (even from a timer tick) then plays
// through that already-unlocked context instead of a fresh suspended one.
let sharedCtx = null;

function getSharedContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioCtx();
  }
  return sharedCtx;
}

// Call this synchronously from inside a real click/tap handler (Start,
// Resume, mark-set-complete — anything that might later trigger an alarm on
// its own via a timer tick) to unlock audio for the rest of the page
// session. Safe to call liberally/repeatedly — resuming an already-running
// context is a cheap no-op.
export function unlockAudio() {
  try {
    const ctx = getSharedContext();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    /* AudioContext unsupported — nothing else in the app depends on this. */
  }
}

export function playAlarmBeeps(count = 3) {
  try {
    const ctx = getSharedContext();
    if (!ctx) return;
    // Defensive resume — if this fires without an earlier unlockAudio()
    // call (or the context got auto-suspended, e.g. after the tab was
    // backgrounded), this at least gives it a chance; on browsers that
    // require a gesture for resume() to actually take effect, the
    // caller's own visual completion state still communicates completion.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const beepDuration = 0.15;
    const gap = 0.12;
    for (let i = 0; i < count; i++) {
      const start = ctx.currentTime + i * (beepDuration + gap);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880; // A5 — clear, alarm-like tone
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.4, start + 0.01);
      gain.gain.linearRampToValueAtTime(0, start + beepDuration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + beepDuration);
    }
    // Not closed afterward anymore — this context is the shared, reusable
    // one for the whole session now, not a one-shot.
  } catch {
    /* AudioContext unsupported/blocked — visual completion state still shows. */
  }
}
