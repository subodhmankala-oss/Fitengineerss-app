import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useCoachTour } from '../context/CoachTourContext';
import './TourOverlay.css';

// The coach-side counterpart to TourOverlay.jsx — same spotlight mechanics,
// different script. Runs entirely against a sample "Demo Client" row (see
// TrainerDashboard's DEMO_CLIENT / renders it only while this tour is
// active) so a brand-new coach with zero real clients still has something
// real to click into. Nothing here writes real data: opening the demo
// client and switching tabs are local UI state plus read-only queries that
// return empty for an id that doesn't exist in the database.
const STEPS = {
  1: {
    icon: '👥',
    selector: '[data-tour="tc-demo-manage-btn"]',
    title: 'Meet Your Clients',
    desc: "This is a sample client so you can see how everything works. Tap Manage to open their profile.",
    // Purely local state (selects a sample row) — safe to tap for the coach.
    autoClick: true,
  },
  2: {
    icon: '📋',
    selector: '[data-tour="tc-tab-plans"]',
    title: 'Assign a Plan',
    desc: 'Build or AI-generate a workout plan and send it straight to your client from here.',
    autoClick: true,
  },
  3: {
    icon: '🎯',
    selector: '[data-tour="tc-tab-livelog"]',
    title: 'Live Session Log',
    desc: "Watch a client's workout update live, set by set, as they train.",
    autoClick: true,
  },
  4: {
    icon: '🏋️',
    selector: '[data-tour="tc-tab-workout"]',
    title: 'Workout History',
    desc: 'Review past sessions, PRs and training status once your client starts logging.',
    cta: { label: 'Finish', action: 'finish' },
  },
};

const TOTAL_STEPS = Object.keys(STEPS).length;
const PAD = 8;
const VIEWPORT_MARGIN = 12;
const AUTO_ADVANCE_MS = 5000;

export default function CoachTourOverlay() {
  const { step, advanceIfStep, finish } = useCoachTour();
  const [rect, setRect] = useState(null);
  const [tooltipSize, setTooltipSize] = useState(null);
  const tooltipRef = useRef(null);
  const config = STEPS[step];

  useEffect(() => {
    setRect(null);
  }, [step]);

  useEffect(() => {
    if (!config) return undefined;

    let raf;
    let scrolled = false;
    const measure = () => {
      const el = document.querySelector(config.selector);
      if (el) {
        if (!scrolled) {
          scrolled = true;
          const r0 = el.getBoundingClientRect();
          const offscreen = r0.top < 80 || r0.bottom > window.innerHeight - 80;
          if (offscreen) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        const r = el.getBoundingClientRect();
        setRect((prev) => (prev && prev.top === r.top && prev.left === r.left
          && prev.width === r.width && prev.height === r.height)
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height });
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [step, config]);

  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el) return undefined;
    const update = () => setTooltipSize({ width: el.offsetWidth, height: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [step, rect]);

  // Auto-advance after AUTO_ADVANCE_MS, same as the client tour. `autoClick`
  // steps tap the real control (opening the demo client, switching tabs) so
  // the screen actually follows along for an idle coach instead of the tour
  // text getting ahead of what's on screen.
  useEffect(() => {
    if (!config) return undefined;
    const timer = setTimeout(() => {
      if (config.autoClick) {
        const target = document.querySelector(config.autoClickSelector || config.selector);
        if (target) { target.click(); return; }
      }
      if (config.cta?.action === 'finish') finish();
      else if (config.cta?.action === 'next') advanceIfStep(step, config.cta.to);
      else if (step < TOTAL_STEPS) advanceIfStep(step, step + 1);
      else finish();
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [step, config, advanceIfStep, finish]);

  if (!config) return null;

  const hasTarget = !!rect && rect.width > 0;
  const hole = hasTarget
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const tooltipH = tooltipSize?.height ?? 220;
  const spaceBelow = hasTarget ? viewportH - (hole.top + hole.height) : 0;
  const spaceAbove = hasTarget ? hole.top : 0;
  const tooltipBelow = hasTarget
    ? (spaceBelow >= tooltipH + 14 || spaceAbove < tooltipH + 14)
    : true;

  const handleCta = () => {
    if (config.cta?.action === 'finish') finish();
    else if (config.cta?.action === 'next') advanceIfStep(step, config.cta.to);
  };

  const handleManualNext = () => {
    if (step < TOTAL_STEPS) advanceIfStep(step, step + 1);
    else finish();
  };

  const maxTop = Math.max(VIEWPORT_MARGIN, viewportH - tooltipH - VIEWPORT_MARGIN);
  const tooltipStyle = hasTarget
    ? (() => {
        const rawTop = tooltipBelow ? hole.top + hole.height + 14 : hole.top - 14 - tooltipH;
        const top = Math.min(Math.max(rawTop, VIEWPORT_MARGIN), maxTop);
        const left = Math.max(VIEWPORT_MARGIN, Math.min(hole.left, viewportW - 292));
        return { top, left };
      })()
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="tour-overlay" aria-live="polite">
      {hasTarget ? (
        <>
          <div className="tour-mask" style={{ top: 0, left: 0, right: 0, height: Math.max(hole.top, 0) }} />
          <div className="tour-mask" style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} />
          <div className="tour-mask" style={{ top: hole.top, left: 0, width: Math.max(hole.left, 0), height: hole.height }} />
          <div className="tour-mask" style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} />
          <div
            key={step}
            className="tour-ring"
            style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
          />
        </>
      ) : (
        <div className="tour-mask" style={{ top: 0, left: 0, right: 0, bottom: 0 }} />
      )}

      <button type="button" className="tour-skip" onClick={finish}>Skip tour</button>

      <div key={step} ref={tooltipRef} className="tour-tooltip" style={tooltipStyle}>
        <div className="tour-tooltip-progress">
          <span key={step} className="tour-tooltip-progress-fill" />
        </div>
        <div className="tour-tooltip-head">
          <span className="tour-tooltip-icon">{config.icon}</span>
          <div className="tour-tooltip-headtext">
            <span className="tour-tooltip-step">Step {step} of {TOTAL_STEPS}</span>
            <h4 className="tour-tooltip-title">{config.title}</h4>
          </div>
        </div>
        <p className="tour-tooltip-desc">{config.desc}</p>
        {hasTarget && (
          <p className="tour-tooltip-tap-hint">
            <span className="tour-tooltip-tap-dot" /> Tap the glowing spot to continue
          </p>
        )}
        <div className="tour-tooltip-dots">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <span key={i} className={`tour-tooltip-dot ${i + 1 === step ? 'is-active' : i + 1 < step ? 'is-done' : ''}`} />
          ))}
        </div>
        <div className="tour-tooltip-actions">
          {step < TOTAL_STEPS && (
            <button type="button" className="tour-tooltip-next-ghost" onClick={handleManualNext}>
              I'll do it, skip ahead →
            </button>
          )}
          {config.cta && (
            <button type="button" className="tour-tooltip-cta" onClick={handleCta}>
              {config.cta.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
