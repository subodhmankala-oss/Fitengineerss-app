// Generated on the fly via Web Audio — no audio asset to ship/load, works
// instantly offline. A short triple-beep pattern (like a real kitchen/
// interval timer) rather than a single blip, so it's actually noticeable if
// whoever's watching the timer isn't looking at the screen when it ends.
// Shared by ClockTimerModal (rest/warmup popup) and the rest-between-sets
// timer on both the client and coach Live Log sides, so every countdown in
// the app sounds the same.
//
// Wrapped in try/catch: some browsers block AudioContext until a user
// gesture has occurred on the page. Every caller here is only ever reached
// after the user tapped Start/marked a set complete, so this normally
// works — if it's ever blocked, the caller's own visual completion state
// (red ring, "Rest over" card, etc.) still communicates completion on its
// own.
export function playAlarmBeeps(count = 3) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
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
    setTimeout(() => ctx.close(), (count * (beepDuration + gap) + 0.2) * 1000);
  } catch {
    /* AudioContext unsupported/blocked — visual completion state still shows. */
  }
}
