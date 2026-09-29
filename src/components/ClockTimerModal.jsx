import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { playAlarmBeeps, unlockAudio } from '../utils/alarmSound';
import { computeElapsedSeconds, computeRestSecondsRemaining } from '../utils/liveWorkoutTimer';
import { useLiveTick } from '../hooks/useLiveTick';
import './ClockTimerModal.css';

const CIRCLE_R = 90;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_R;
const DEFAULT_DURATION = 60;
const MIN_DURATION = 15;
const MAX_DURATION = 99 * 60 + 59;
const STORAGE_KEY = 'clockTimerModalState';
// A timer/stopwatch left behind from an earlier day isn't worth restoring.
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;
// Only beep for a timer that ran out recently — reopening the popup (or the
// app) long after it finished shouldn't sound an alarm out of nowhere.
const LATE_ALARM_WINDOW_MS = 60 * 1000;

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function loadSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || !saved.timer || !saved.stopwatch) return null;
    if (Date.now() - (saved.savedAt || 0) > STALE_AFTER_MS) return null;
    return saved;
  } catch {
    return null;
  }
}

// A small iOS Clock-style Timer/Stopwatch popup — lets a coach or client
// time a rest period or warmup without leaving the app. No workout data is
// saved; only the popup's own state is kept (localStorage), so a running
// timer or stopwatch carries on through closing the popup, the app going
// off screen, or the page reloading.
//
// Both used to count by adding/subtracting 1 on every setInterval tick.
// Phones suspend setInterval while the app is off screen, so switching apps
// or locking the phone mid-rest froze them — they picked up from the same
// number on return, however long the rest had actually been. They're now
// wall-clock timestamps (timer: endAt, stopwatch: startedAt), the same
// approach as the session clock and the rest card, and the ticks only
// redraw.
export default function ClockTimerModal({ onClose }) {
  const [saved] = useState(loadSavedState);
  const [mode, setMode] = useState(saved?.mode ?? 'stopwatch');
  const [duration, setDuration] = useState(saved?.duration ?? DEFAULT_DURATION);
  // endAt is set while running; remaining holds the seconds left while
  // paused or not started.
  const [timer, setTimer] = useState(saved?.timer ?? { endAt: null, remaining: DEFAULT_DURATION, done: false });
  // startedAt is set while running; accumulated holds the seconds counted
  // before the current run.
  const [stopwatch, setStopwatch] = useState(saved?.stopwatch ?? { startedAt: null, accumulated: 0 });

  const remaining = timer.endAt != null ? computeRestSecondsRemaining(timer.endAt) : timer.remaining;
  const timerFinished = timer.endAt != null && remaining <= 0;
  const timerRunning = timer.endAt != null && !timerFinished;
  const timerDone = timer.done || timerFinished;
  const stopwatchRunning = stopwatch.startedAt != null;
  const elapsed = stopwatch.accumulated + (stopwatchRunning ? computeElapsedSeconds(stopwatch.startedAt) : 0);

  useLiveTick(timerRunning || stopwatchRunning, 250);

  const alarmedEndAtRef = useRef(null);
  useEffect(() => {
    if (!timerFinished || alarmedEndAtRef.current === timer.endAt) return;
    alarmedEndAtRef.current = timer.endAt;
    if (Date.now() - timer.endAt < LATE_ALARM_WINDOW_MS) playAlarmBeeps();
  }, [timerFinished, timer.endAt]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, duration, timer, stopwatch, savedAt: Date.now() }));
    } catch { /* ignore quota/serialization errors */ }
  }, [mode, duration, timer, stopwatch]);

  const adjustDuration = (delta) => {
    if (timerRunning) return;
    const next = Math.min(MAX_DURATION, Math.max(MIN_DURATION, duration + delta));
    setDuration(next);
    setTimer({ endAt: null, remaining: next, done: false });
  };

  const handleTimerStart = () => {
    // Real click, right here — this is the one chance to unlock audio for
    // the alarm that fires later from a setInterval tick (never itself a
    // user gesture, which mobile browsers require to play sound).
    unlockAudio();
    setTimer({ endAt: Date.now() + remaining * 1000, remaining, done: false });
  };
  const handleTimerPause = () => {
    setTimer({ endAt: null, remaining: computeRestSecondsRemaining(timer.endAt), done: false });
  };
  const handleTimerReset = () => {
    setTimer({ endAt: null, remaining: duration, done: false });
  };

  const handleStopwatchStart = () => {
    setStopwatch(prev => ({ startedAt: Date.now(), accumulated: prev.accumulated }));
  };
  const handleStopwatchPause = () => {
    setStopwatch(prev => ({ startedAt: null, accumulated: prev.accumulated + computeElapsedSeconds(prev.startedAt) }));
  };
  const handleStopwatchReset = () => {
    setStopwatch({ startedAt: null, accumulated: 0 });
  };
  const adjustElapsed = (delta) => {
    setStopwatch(prev => {
      const current = prev.accumulated + (prev.startedAt != null ? computeElapsedSeconds(prev.startedAt) : 0);
      const next = Math.max(0, current + delta);
      return prev.startedAt != null ? { startedAt: Date.now(), accumulated: next } : { startedAt: null, accumulated: next };
    });
  };

  const timerFraction = duration > 0 ? remaining / duration : 0;
  const timerOffset = CIRCUMFERENCE * (1 - timerFraction);
  const timerStarted = timerRunning || (remaining !== duration && !timerDone) || timerDone;

  return createPortal(
    <div className="clock-modal-backdrop" onClick={onClose}>
      <div className="clock-modal" onClick={(e) => e.stopPropagation()}>
        <div className="clock-modal-draghandle" onClick={onClose} />

        <div className="clock-modal-titlebar">
          <span className="clock-modal-title">Clock</span>
          <button type="button" className="clock-modal-gear" onClick={onClose}>✕</button>
        </div>

        <div className="clock-tab-switch">
          <button
            type="button"
            className={`clock-tab-btn ${mode === 'timer' ? 'active' : ''}`}
            onClick={() => setMode('timer')}
          >
            Timer
          </button>
          <button
            type="button"
            className={`clock-tab-btn ${mode === 'stopwatch' ? 'active' : ''}`}
            onClick={() => setMode('stopwatch')}
          >
            Stopwatch
          </button>
        </div>

        <div className="clock-modal-body">
        {mode === 'timer' ? (
          <>
            <div className="clock-ring-wrap">
              <svg viewBox="0 0 200 200" className="clock-ring-svg">
                <circle cx="100" cy="100" r={CIRCLE_R} className="clock-ring-track" />
                <circle
                  cx="100" cy="100" r={CIRCLE_R}
                  className={`clock-ring-fill ${timerDone ? 'is-done' : ''}`}
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={timerOffset}
                />
              </svg>
              <div className="clock-ring-label">{formatClock(remaining)}</div>
            </div>

            <div className="clock-adjust-row">
              <button type="button" className="clock-adjust-btn" disabled={timerRunning} onClick={() => adjustDuration(-15)}>-15s</button>
              <button type="button" className="clock-adjust-btn" disabled={timerRunning} onClick={() => adjustDuration(15)}>+15s</button>
            </div>

            {timerStarted ? (
              <div className="clock-action-row">
                <button type="button" className="clock-btn clock-btn-secondary" onClick={handleTimerReset}>Reset</button>
                {timerRunning ? (
                  <button type="button" className="clock-btn clock-btn-primary clock-btn-pause" onClick={handleTimerPause}>Pause</button>
                ) : (
                  <button type="button" className="clock-btn clock-btn-primary" onClick={handleTimerStart} disabled={timerDone}>
                    {timerDone ? "Time's up" : 'Resume'}
                  </button>
                )}
              </div>
            ) : (
              <button type="button" className="clock-btn clock-btn-primary clock-btn-full" onClick={handleTimerStart}>Start</button>
            )}
          </>
        ) : (
          <>
            <div className="clock-ring-wrap">
              <svg viewBox="0 0 200 200" className="clock-ring-svg">
                <circle cx="100" cy="100" r={CIRCLE_R} className="clock-ring-track" />
                <circle cx="100" cy="100" r={CIRCLE_R} className="clock-ring-fill clock-ring-static" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={0} />
              </svg>
              <div className="clock-ring-label">{formatClock(elapsed)}</div>
            </div>

            <div className="clock-adjust-row">
              <button type="button" className="clock-adjust-btn" onClick={() => adjustElapsed(-15)}>-15s</button>
              <button type="button" className="clock-adjust-btn" onClick={() => adjustElapsed(15)}>+15s</button>
            </div>

            {stopwatchRunning || elapsed > 0 ? (
              <div className="clock-action-row">
                <button type="button" className="clock-btn clock-btn-secondary" onClick={handleStopwatchReset}>Reset</button>
                {stopwatchRunning ? (
                  <button type="button" className="clock-btn clock-btn-primary clock-btn-pause" onClick={handleStopwatchPause}>Stop</button>
                ) : (
                  <button type="button" className="clock-btn clock-btn-primary" onClick={handleStopwatchStart}>Resume</button>
                )}
              </div>
            ) : (
              <button type="button" className="clock-btn clock-btn-primary clock-btn-full" onClick={handleStopwatchStart}>Start</button>
            )}
          </>
        )}
        </div>
      </div>
    </div>,
    document.body
  );
}
