import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTour } from '../context/TourContext';
import './TourOverlay.css';

// The script for the client spotlight tour. Each entry's `selector` must
// match a real element carrying that data-tour attribute (see App.jsx /
// WorkoutTracker.jsx). Steps with no `cta` advance on their own once the
// app's real state changes (handled by effects next to those elements) —
// for those we show a pulsing "tap here" hint instead of a button. Every
// step also gets a manual "Next" escape hatch so nobody can get stranded
// if they don't spot the right tap target.
const STEPS = {
  1: {
    icon: '🏠',
    selector: '[data-tour="nav-workout"]',
    title: 'Log a Workout',
    desc: 'Tap here to start tracking your training.',
    // Pure navigation, nothing created or saved — safe to tap for the user
    // if they're not doing it themselves.
    autoClick: true,
  },
  2: {
    icon: '📋',
    selector: '[data-tour="wt-tab-templates"]',
    title: 'Browse Workouts',
    desc: 'Tap here to see workout programs.',
    autoClick: true,
  },
  3: {
    icon: '🎯',
    selector: '[data-tour="wt-level-tabs"]',
    title: 'Pick Your Level',
    desc: 'These are ready-made generic templates — Beginner, Intermediate or Advanced.',
    cta: { label: 'Next', action: 'next', to: 4 },
    // The container isn't clickable — pick the first real level button inside it.
    autoClick: true,
    autoClickSelector: '[data-tour="wt-level-tabs"] .wt-level-tab',
  },
  4: {
    icon: '✍️',
    selector: '[data-tour="wt-tab-log"]',
    title: 'Log Sets',
    desc: "Tap here when you're ready to log your sets.",
    autoClick: true,
  },
  5: {
    icon: '➕',
    selector: '[data-tour="wt-start-empty-card"]',
    title: 'Start a Workout',
    desc: 'Tap here to start an empty workout from scratch.',
    // Auto-clicked for idle users. This does start a real (empty) session,
    // but it's the only way steps 6-8 can exist at all — their targets live
    // inside the logging form. The session is a discardable draft, and step 8
    // (Save) is still never auto-fired, so nothing is ever persisted to the
    // user's history without a deliberate tap.
    autoClick: true,
  },
  6: {
    icon: '✅',
    selector: '[data-tour="wt-log-exercise-card"]',
    title: 'Log Your Sets',
    desc: 'Enter reps & weight, then tick each set as you finish it.',
    // No cta button — auto-advances to step 7 after AUTO_ADVANCE_MS, same as
    // the tap-target-only steps above.
  },
  7: {
    icon: '➕',
    selector: '[data-tour="wt-add-exercise-btn"]',
    title: 'Add More Exercises',
    desc: 'Tap here anytime to add another exercise to this session.',
    // No cta button, no autoClick — adds a real (blank) exercise row to
    // their session, so this only advances via a deliberate tap or the
    // auto-advance timer, never a fallback "Next" button.
  },
  8: {
    icon: '🎉',
    selector: '[data-tour="wt-save-workout-btn"]',
    title: "You're All Set!",
    desc: "Save your session here once you're done logging.",
    // No cta button, no autoClick — this persists the workout. Must be a
    // deliberate tap on the real Save button; the tour itself just ends
    // (auto-advance fallback below still calls finish() so nobody is stuck).
  },
};

const TOTAL_STEPS = Object.keys(STEPS).length;
const PAD = 8;

const VIEWPORT_MARGIN = 12;
const AUTO_ADVANCE_MS = 5000;

export default function TourOverlay() {
  const { step, advanceIfStep, finish } = useTour();
  const [rect, setRect] = useState(null);
  const [tooltipSize, setTooltipSize] = useState(null);
  const tooltipRef = useRef(null);
  const config = STEPS[step];

  // Whenever the step changes, drop the old spotlight immediately rather
  // than letting a stale rect linger under the new step's copy — avoids a
  // ring highlighting the wrong control while the tooltip already talks
  // about the next one.
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
        // The target can be scrolled out of view (e.g. "Add Exercise" sits
        // below whatever exercises are already logged) — bring it on-screen
        // the first time we find it each step, so the ring is never pointing
        // at something the user can't actually see.
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

  // A user can land on a later screen than the tour expects — e.g. they
  // already have a workout in progress, so the "browse workouts" / "pick a
  // level" screens these steps want to point at were never visited. Rather
  // than sit on a step whose target can never appear, jump forward to the
  // nearest later step that's actually present on screen right now.
  //
  // Scoped to steps 1-4 only (getting the user into the log-workout screen).
  // Steps 5-8 live *inside* an actual logging session — their targets are
  // legitimately absent until the user starts one, and that's the point of
  // showing them, not a reason to skip past them to "Finish" before they've
  // done anything.
  useEffect(() => {
    if (!config || step >= 5) return undefined;
    const timer = setTimeout(() => {
      if (document.querySelector(config.selector)) return;
      for (let n = step + 1; n <= 4; n++) {
        if (document.querySelector(STEPS[n].selector)) {
          advanceIfStep(step, n);
          return;
        }
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [step, config, advanceIfStep]);

  // Measure the actual rendered tooltip so we can keep it fully on-screen —
  // its height varies (tap hint, CTA vs. ghost button), and the target can
  // sit near the very top or bottom edge of the viewport.
  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (!el) return undefined;
    const update = () => setTooltipSize({ width: el.offsetWidth, height: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [step, rect]);

  // Auto-advance: nobody should ever be stuck reading a step with no visible
  // way forward. Every step moves on by itself after AUTO_ADVANCE_MS unless
  // the user has already moved on (clicking anything that changes `step`
  // tears this effect down before it fires). The countdown is mirrored by
  // the CSS-driven progress slider in the tooltip footer.
  //
  // For `autoClick` steps this doesn't just bump the step counter — it taps
  // the real control for the user, so the screen actually follows along
  // instead of the tour text getting ahead of what's on screen. Steps that
  // create or save data are never autoClick (see STEPS above), so this can
  // only ever switch a tab or pick a filter on the user's behalf, nothing
  // that writes anything.
  useEffect(() => {
    if (!config) return undefined;
    const timer = setTimeout(() => {
      if (config.autoClick) {
        const target = document.querySelector(config.autoClickSelector || config.selector);
        if (target) { target.click(); return; }
        // Target genuinely isn't on screen — fall through to a plain step
        // bump below so the user isn't stuck forever.
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
  // Prefer whichever side actually fits the measured tooltip; fall back to
  // "below" only if neither side has room (we'll clamp it into view either way).
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
