import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/**
 * Post-save share card — shown right after a client's self-logged workout is
 * confirmed saved (see handleConfirmSaveWorkout in WorkoutTracker.jsx), since
 * that's the point where duration/calories/PRs are final. Renders the card
 * to a PNG via html2canvas so it can be attached to a real share sheet
 * (WhatsApp/Instagram/Facebook via the Web Share API on mobile) or saved
 * directly — neither Instagram nor Facebook expose a way to accept a
 * pre-filled image post from a plain web page, so on desktop (no
 * navigator.share) every platform button falls back to downloading the
 * image for the client to attach themselves.
 */
const WorkoutShareCard = ({ session, onClose }) => {
  const cardRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [fallbackMsg, setFallbackMsg] = useState('');

  const {
    workoutName, clientName, dateLabel, durationLabel,
    calories, bestLift, totalSets, volume, muscleGroups
  } = session;

  const captureCardImage = async () => {
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: '#0b0f19',
      scale: 2,
      useCORS: true
    });
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  };

  const shareText = `${workoutName} — ${durationLabel}, ${calories != null ? `${calories} kcal burned` : 'logged'}. Tracked with Fitengineers.`;

  const handleShare = async (platform) => {
    if (busy) return;
    setBusy(true);
    setFallbackMsg('');
    try {
      const blob = await captureCardImage();
      const file = new File([blob], `fitengineers-workout-${Date.now()}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My workout', text: shareText });
        return;
      }

      // No native share sheet (desktop, or an unsupported mobile browser) —
      // the image can't be attached via a URL, so save it and hand the
      // client off to each platform's own compose flow.
      downloadBlob(blob, file.name);
      if (platform === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
        setFallbackMsg('Image saved — attach it in the WhatsApp chat that just opened.');
      } else if (platform === 'facebook') {
        window.open('https://www.facebook.com/', '_blank');
        setFallbackMsg('Image saved — attach it to your Facebook post.');
      } else {
        setFallbackMsg('Image saved — open Instagram and share it from your gallery.');
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Share failed:', e);
        setFallbackMsg('Could not share. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    setFallbackMsg('');
    try {
      const blob = await captureCardImage();
      downloadBlob(blob, `fitengineers-workout-${Date.now()}.png`);
    } catch (e) {
      console.error('Save failed:', e);
      setFallbackMsg('Could not save the image. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wsc-backdrop" onClick={onClose}>
      <div className="wsc-modal animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="wsc-close-row">
          <button type="button" className="wsc-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div ref={cardRef} className="wsc-card">
          <div className="wsc-brand-row">
            <img src="/logo.png" className="wsc-logo-img" alt="" />
            <div className="wsc-brand-text">
              <span className="wsc-brand-name">Fitengineers</span>
              <span className="wsc-brand-url">fitengineers.app</span>
            </div>
            <span className="wsc-date">{dateLabel}</span>
          </div>

          <p className="wsc-workout-name">{workoutName}</p>
          {clientName && <p className="wsc-client-name">{clientName}</p>}

          {muscleGroups.length > 0 && (
            <div className="wsc-chip-row">
              {muscleGroups.map(m => <span key={m} className="wsc-chip">{m}</span>)}
            </div>
          )}

          <div className="wsc-stats-grid">
            <div className="wsc-stat-tile">
              <span className="wsc-stat-label">Duration</span>
              <strong className="wsc-stat-value">{durationLabel}</strong>
            </div>
            <div className="wsc-stat-tile">
              <span className="wsc-stat-label">Calories</span>
              <strong className="wsc-stat-value wsc-amber">{calories != null ? `${calories} kcal` : '—'}</strong>
            </div>
          </div>

          {bestLift && (
            <div className="wsc-best-lift">
              <div>
                <span className="wsc-best-lift-label">Best lift</span>
                <strong className="wsc-best-lift-value">
                  {bestLift.exerciseName} · {bestLift.weight}{bestLift.unit}{bestLift.reps ? ` × ${bestLift.reps}` : ''}
                </strong>
              </div>
              {bestLift.isPR && <span className="wsc-pr-badge">PR</span>}
            </div>
          )}

          <div className="wsc-footer-line">
            <span>{totalSets} sets</span>
            <span>·</span>
            <span>{volume} kg volume</span>
          </div>
        </div>

        {fallbackMsg && <p className="wsc-fallback-msg">{fallbackMsg}</p>}

        <div className="wsc-share-row">
          <button type="button" className="wsc-share-btn" disabled={busy} onClick={() => handleShare('whatsapp')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="#25d366"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.09c-.24.68-1.4 1.3-1.93 1.38-.49.08-1.11.11-1.79-.11-.41-.13-.94-.31-1.62-.6-2.85-1.23-4.71-4.1-4.85-4.29-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.09 1-2.37.26-.28.57-.35.76-.35h.55c.18 0 .41-.07.64.49.24.57.81 1.97.88 2.11.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.56.16.28.71 1.17 1.53 1.89 1.05.93 1.94 1.22 2.21 1.36.28.14.44.12.6-.07.16-.19.68-.79.86-1.06.19-.28.37-.23.62-.14.26.09 1.63.77 1.91.91.28.14.47.21.53.33.07.12.07.65-.16 1.32Z"/></svg>
            <span>WhatsApp</span>
          </button>
          <button type="button" className="wsc-share-btn" disabled={busy} onClick={() => handleShare('instagram')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#e1306c" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#e1306c" stroke="none"/></svg>
            <span>Instagram</span>
          </button>
          <button type="button" className="wsc-share-btn" disabled={busy} onClick={() => handleShare('facebook')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="#1877f2"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.91h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z"/></svg>
            <span>Facebook</span>
          </button>
          <button type="button" className="wsc-share-btn" disabled={busy} onClick={handleSave}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v13"/><path d="m7 12 5 5 5-5"/><path d="M5 21h14"/></svg>
            <span>Save</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkoutShareCard;
