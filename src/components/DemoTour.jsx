import { useEffect, useRef, useState } from 'react';
import './DemoTour.css';

// Short, auto-advancing "how to use the app" walkthrough shown to first-time
// users. Two scripts (client / coach) so each role sees the features that
// actually apply to them. Runs ~3.2s/slide x 4 slides ≈ 13s, matching the
// "10-15 sec demo" ask without needing an actual screen recording.
const SLIDES = {
  client: [
    { icon: '🏋️', title: 'Log Your Workouts', body: 'Track sets, reps & weight in real time from the Workout tab.' },
    { icon: '🥗', title: 'Track Your Nutrition', body: 'Log meals and hit your daily calorie & macro targets.' },
    { icon: '💬', title: 'Chat With Your Coach', body: 'Ask questions and get feedback right inside the app.' },
    { icon: '📈', title: 'See Your Progress', body: 'Watch your strength and body stats improve over time.' },
  ],
  coach: [
    { icon: '👥', title: 'Manage Your Clients', body: "See every client's activity, goals and progress in one list." },
    { icon: '📋', title: 'Assign Workout Plans', body: 'Build or AI-generate plans and assign them in seconds.' },
    { icon: '💬', title: 'Chat & Coach Notes', body: 'Reply to clients and leave notes after every session.' },
    { icon: '🔴', title: 'Live Session Log', body: "Watch a client's workout update live as they train." },
  ],
};

const SLIDE_MS = 3200;

export default function DemoTour({ role, onClose }) {
  const slides = SLIDES[role] || SLIDES.client;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (paused) return undefined;
    timerRef.current = setTimeout(() => {
      setIndex((i) => (i < slides.length - 1 ? i + 1 : i));
    }, SLIDE_MS);
    return () => clearTimeout(timerRef.current);
  }, [index, paused, slides.length]);

  const isLast = index === slides.length - 1;
  const slide = slides[index];

  return (
    <div className="demo-tour-overlay" role="dialog" aria-modal="true" aria-label="Quick app walkthrough">
      <div className="demo-tour-card">
        <div className="demo-tour-progress">
          {slides.map((_, i) => (
            <div key={i} className="demo-tour-progress-track">
              <div
                className="demo-tour-progress-fill"
                style={{
                  animationPlayState: paused ? 'paused' : 'running',
                  animationDuration: `${SLIDE_MS}ms`,
                  width: i < index ? '100%' : i > index ? '0%' : undefined,
                  animationName: i === index ? 'demo-tour-fill' : 'none',
                }}
              />
            </div>
          ))}
        </div>

        <button className="demo-tour-skip" onClick={onClose} type="button">Skip</button>

        <div
          className="demo-tour-body"
          onClick={() => setIndex((i) => (i < slides.length - 1 ? i + 1 : i))}
          onMouseDown={() => setPaused(true)}
          onMouseUp={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
        >
          <div key={index} className="demo-tour-icon">{slide.icon}</div>
          <h3 key={`t-${index}`} className="demo-tour-title">{slide.title}</h3>
          <p key={`b-${index}`} className="demo-tour-desc">{slide.body}</p>
        </div>

        <div className="demo-tour-footer">
          <div className="demo-tour-dots">
            {slides.map((_, i) => (
              <span key={i} className={`demo-tour-dot ${i === index ? 'active' : ''}`} />
            ))}
          </div>
          {isLast ? (
            <button className="demo-tour-cta" onClick={onClose} type="button">Got it, let's go →</button>
          ) : (
            <button
              className="demo-tour-cta demo-tour-cta-ghost"
              onClick={() => setIndex((i) => i + 1)}
              type="button"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
