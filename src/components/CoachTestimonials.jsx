import { useEffect, useState } from 'react';
import databaseService from '../services/databaseService';
import { MAX_QUOTE_LENGTH, MAX_RESULT_LENGTH, trainedLabel, googleReviewText } from '../utils/testimonials';

// Client side of testimonials, inside Coach Details: the coach's shown
// testimonials, plus this client's own one (write / edit / delete). The coach
// can only Show or Hide what clients write — see sql/coach_testimonials.sql.
// startWriting opens the form straight away (the coach's WhatsApp ask links
// to ?openTestimonial=1).
const MY_STATUS = {
  pending: { label: 'Waiting for your coach to approve', tone: 'amber' },
  shown: { label: 'Shown on your coach’s profile', tone: 'green' },
  hidden: { label: 'Hidden by your coach', tone: 'muted' },
};

export function TestimonialCard({ t }) {
  return (
    <figure className="cdm-testimonial">
      <blockquote className="cdm-testimonial-quote">{'“'}{t.quote}{'”'}</blockquote>
      <figcaption className="cdm-testimonial-by">
        <span className="cdm-testimonial-name">{t.clientName}</span>
        <span className="cdm-testimonial-verified">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
          Verified client
        </span>
        {t.monthsTrained != null && <span>{trainedLabel(t.monthsTrained)}</span>}
      </figcaption>
      {t.result && <span className="cdm-testimonial-result">{t.result}</span>}
    </figure>
  );
}

export default function CoachTestimonials({ startWriting = false, onWritingChange }) {
  const [data, setData] = useState(null); // { shown, mine } once loaded
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ quote: '', result: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [copied, setCopied] = useState(false);

  // Coach Details hides its own Close button while the form is open, so
  // there's one clear pair of actions (Cancel / Send).
  useEffect(() => { onWritingChange?.(editing); }, [editing, onWritingChange]);

  useEffect(() => {
    let cancelled = false;
    databaseService.testimonials('list').then(result => {
      if (cancelled) return;
      setData(result);
      if (startWriting) {
        setDraft({ quote: result?.mine?.quote || '', result: result?.mine?.result || '' });
        setEditing(true);
      }
    }).catch(err => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, [startWriting]);

  const openForm = () => {
    setDraft({ quote: data?.mine?.quote || '', result: data?.mine?.result || '' });
    setFormError('');
    setEditing(true);
  };

  const run = async (op, payload) => {
    setBusy(true);
    setFormError('');
    try {
      setData(await databaseService.testimonials(op, payload));
      setEditing(false);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Google has no API for posting a review on someone's behalf, so: copy
  // their words, open the coach's review page, and they paste + post from
  // their own Google account. Offered to every client who has written one,
  // whatever its status here — Google bans only sending happy reviewers
  // ("review gating").
  const postOnGoogle = async () => {
    const text = googleReviewText(data.mine);
    let didCopy = false;
    try {
      await navigator.clipboard.writeText(text);
      didCopy = true;
    } catch { /* clipboard blocked — the hint below still tells them what to do */ }
    setCopied(didCopy);
    window.open(data.googleReviewUrl, '_blank', 'noopener,noreferrer');
  };

  const save = () => {
    if (!draft.quote.trim()) {
      setFormError('Write a few words first.');
      return;
    }
    run('save', draft);
  };

  if (loadError) return <p className="ccm-info" style={{ marginBottom: 16 }}>Couldn't load testimonials. {loadError}</p>;
  if (!data) return <p className="ccm-info" style={{ marginBottom: 16 }}>Loading testimonials…</p>;
  if (data.role !== 'client') return null;

  const others = data.shown.filter(t => t.id !== data.mine?.id);
  const mine = data.mine;
  const status = mine ? MY_STATUS[mine.status] : null;

  return (
    <div className="cdm-testimonials-wrap">
      {(data.shown.length > 0) && (
        <>
          <div className="cdm-section-label">What clients say</div>
          <div className="cdm-testimonials">
            {others.map(t => <TestimonialCard key={t.id} t={t} />)}
            {mine?.status === 'shown' && <TestimonialCard t={mine} />}
          </div>
        </>
      )}

      <div className="cdm-section-label">Your testimonial</div>
      {editing ? (
        <div className="cdm-t-form">
          <textarea
            className="ccm-input cdm-t-input"
            value={draft.quote}
            onChange={e => { setDraft(d => ({ ...d, quote: e.target.value })); setFormError(''); }}
            placeholder="How has training with your coach helped you?"
            maxLength={MAX_QUOTE_LENGTH}
            rows={4}
            autoFocus
          />
          <div className="cdm-t-count">{draft.quote.length}/{MAX_QUOTE_LENGTH}</div>
          <input
            className="ccm-input cdm-t-input"
            value={draft.result}
            onChange={e => setDraft(d => ({ ...d, result: e.target.value }))}
            placeholder="Your result, optional: Lost 8 kg in 12 weeks"
            maxLength={MAX_RESULT_LENGTH}
          />
          <p className="ccm-info">Your coach approves it before it shows. Other clients see your first name and last initial.</p>
          {formError && <div className="ccm-error-msg">{formError}</div>}
          <div className="ccm-actions">
            <button type="button" className="ccm-btn-secondary" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            <button type="button" className="ccm-btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Sending…' : mine ? 'Save changes' : 'Send to coach'}
            </button>
          </div>
        </div>
      ) : mine ? (
        <div className="cdm-t-mine">
          <p className="cdm-testimonial-quote">{'“'}{mine.quote}{'”'}</p>
          {mine.result && <span className="cdm-testimonial-result">{mine.result}</span>}
          <div className={`cdm-t-status cdm-t-status--${status.tone}`}>{status.label}</div>
          {data.googleReviewUrl && (
            <div className="cdm-t-google">
              <button type="button" className="cdm-t-google-btn" onClick={postOnGoogle}>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" />
                  <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" />
                  <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z" />
                  <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1Z" />
                </svg>
                Also post on Google
              </button>
              <p className="ccm-info">
                {copied
                  ? 'Your words are copied. On Google, pick your stars, paste and post.'
                  : 'Opens your coach\u2019s Google page. Paste your words there and post from your own Google account.'}
              </p>
            </div>
          )}
          <p className="ccm-info">Editing sends it back to your coach to approve again.</p>
          {formError && <div className="ccm-error-msg">{formError}</div>}
          <div className="cdm-t-mine-actions">
            <button type="button" className="cdm-t-link" onClick={openForm} disabled={busy}>Edit</button>
            <button type="button" className="cdm-t-link cdm-t-link--danger" onClick={() => { if (window.confirm('Delete your testimonial?')) run('delete'); }} disabled={busy}>Delete</button>
          </div>
        </div>
      ) : (
        <button type="button" className="cdm-t-write" onClick={openForm}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          Write a testimonial
        </button>
      )}
    </div>
  );
}
