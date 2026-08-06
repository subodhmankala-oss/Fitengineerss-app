import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { playAlarmBeeps, unlockAudio } from '../utils/alarmSound';
import './ClockTimerModal.css';

const CIRCLE_R = 90;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_R;
const DEFAULT_DURATION = 60;
const MIN_DURATION = 15;
const MAX_DURATION = 99 * 60 + 59;

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// A small iOS Clock-style Timer/Stopwatch popup — lets a coach time a rest
// period or warmup during a live session without leaving the app. Purely a
// utility overlay: no data is saved anywhere, closing it just discards state.
export default function ClockTimerModal({ onClose }) {
  const [mode, setMode] = useState('stopwatch');

  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [remaining, setRemaining] = useState(DEFAULT_DURATION);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDone, setTimerDone] = useState(false);
  const timerIntervalRef = useRef(null);

  const [elapsed, setElapsed] = useState(0);
  const [stopwatchRunning, setStopwatchRunning] = useState(false);
  const stopwatchIntervalRef = useRef(null);

  useEffect(() => {
    if (!timerRunning) return;
    timerIntervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          setTimerRunning(false);
          setTimerDone(true);
          playAlarmBeeps();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerIntervalRef.current);
  }, [timerRunning]);

  useEffect(() => {
    if (!stopwatchRunning) return;
    stopwatchIntervalRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(stopwatchIntervalRef.current);
  }, [stopwatchRunning]);

  useEffect(() => () => {
    clearInterval(timerIntervalRef.current);
    clearInterval(stopwatchIntervalRef.current);
  }, []);

  const adjustDuration = (delta) => {
    if (timerRunning) return;
    setDuration(prev => {
      const next = Math.min(MAX_DURATION, Math.max(MIN_DURATION, prev + delta));
      setRemaining(next);
      setTimerDone(false);
      return next;
    });
  };

  const handleTimerStart = () => {
    // Real click, right here — this is the one chance to unlock audio for
    // the alarm that fires later from a setInterval tick (never itself a
    // user gesture, which mobile browsers require to play sound).
    unlockAudio();
    setTimerDone(false);
    setTimerRunning(true);
  };
  const handleTimerPause = () => setTimerRunning(false);
  const handleTimerReset = () => {
    setTimerRunning(false);
    setTimerDone(false);
    setRemaining(duration);
  };

  const handleStopwatchStart = () => setStopwatchRunning(true);
  const handleStopwatchPause = () => setStopwatchRunning(false);
  const handleStopwatchReset = () => {
    setStopwatchRunning(false);
    setElapsed(0);
  };
  const adjustElapsed = (delta) => {
    setElapsed(prev => Math.max(0, prev + delta));
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
