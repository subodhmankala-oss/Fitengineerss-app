import { useEffect, useState } from 'react';
import { useTour } from '../context/TourContext';
import './TourOverlay.css';

// The script for the client spotlight tour. Each entry's `selector` must
// match a real element carrying that data-tour attribute (see App.jsx /
// WorkoutTracker.jsx). Steps with no `cta` advance on their own once the
// app's real state changes (handled by effects next to those elements);
// steps with a `cta` show a manual button because there's no single click
// to key off (or the click opens something that would bury the tour).
const STEPS = {
  1: {
    selector: '[data-tour="nav-workout"]',
    title: 'Log a Workout',
    desc: 'Tap here to start tracking your training.',
  },
  2: {
    selector: '[data-tour="wt-tab-templates"]',
    title: 'Browse Workouts',
    desc: 'Tap here to see workout programs.',
  },
  3: {
    selector: '[data-tour="wt-level-tabs"]',
    title: 'Pick Your Level',
    desc: 'These are ready-made generic templates — Beginner, Intermediate or Advanced.',
    cta: { label: 'Next', action: 'next', to: 4 },
  },
  4: {
    selector: '[data-tour="wt-tab-log"]',
    title: 'Log Sets',
    desc: "Tap here when you're ready to log your sets.",
  },
  5: {
    selector: '[data-tour="wt-start-empty-card"]',
    title: 'Start a Workout',
    desc: 'Tap here to start an empty workout from scratch.',
  },
  6: {
    selector: '[data-tour="wt-log-exercise-card"]',
    title: 'Log Your Sets',
    desc: 'Enter reps & weight, then tick each set as you finish it.',
    cta: { label: 'Next', action: 'next', to: 7 },
  },
  7: {
    selector: '[data-tour="wt-add-exercise-btn"]',
    title: 'Add More Exercises',
    desc: 'Tap here anytime to add another exercise to this session.',
    cta: { label: 'Next', action: 'next', to: 8 },
  },
  8: {
    selector: '[data-tour="wt-save-workout-btn"]',
    title: "You're All Set! 🎉",
    desc: "Save your session here once you're done logging.",
    cta: { label: 'Finish', action: 'finish' },
  },
};

const PAD = 8;

export default function TourOverlay() {
  const { step, advanceIfStep, finish } = useTour();
  const [rect, setRect] = useState(null);
  const config = STEPS[step];

  useEffect(() => {
    if (!config) { setRect(null); return undefined; }

    let raf;
    const measure = () => {
      const el = document.querySelector(config.selector);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setRect(null);
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [step, config]);

  if (!config || !rect || rect.width === 0) return null;

  const hole = {
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
  };

  const viewportH = window.innerHeight;
  const spaceBelow = viewportH - (hole.top + hole.height);
  const tooltipBelow = spaceBelow > 160 || hole.top < 160;

  const handleCta = () => {
    if (config.cta?.action === 'finish') finish();
    else if (config.cta?.action === 'next') advanceIfStep(step, config.cta.to);
  };

  return (
    <div className="tour-overlay" aria-live="polite">
      <div className="tour-mask" style={{ top: 0, left: 0, right: 0, height: Math.max(hole.top, 0) }} />
      <div className="tour-mask" style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} />
      <div className="tour-mask" style={{ top: hole.top, left: 0, width: Math.max(hole.left, 0), height: hole.height }} />
      <div className="tour-mask" style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} />

      <div
        key={step}
        className="tour-ring"
        style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
      />

      <button type="button" className="tour-skip" onClick={finish}>Skip tour</button>

      <div
        key={step}
        className="tour-tooltip"
        style={
          tooltipBelow
            ? { top: hole.top + hole.height + 14, left: Math.max(12, Math.min(hole.left, window.innerWidth - 300)) }
            : { top: Math.max(12, hole.top - 14), left: Math.max(12, Math.min(hole.left, window.innerWidth - 300)), transform: 'translateY(-100%)' }
        }
      >
        <h4 className="tour-tooltip-title">{config.title}</h4>
        <p className="tour-tooltip-desc">{config.desc}</p>
        {config.cta && (
          <button type="button" className="tour-tooltip-cta" onClick={handleCta}>{config.cta.label}</button>
        )}
      </div>
    </div>
  );
}
