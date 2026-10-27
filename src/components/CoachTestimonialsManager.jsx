import { useEffect, useState } from 'react';
import Avatar from './Avatar';
import databaseService from '../services/databaseService';
import { trainedLabel, buildTestimonialAsk } from '../utils/testimonials';
import { toWhatsappNumber, openWhatsapp } from '../utils/whatsappNudge';

// Coach side of testimonials (CoachProfile -> Client Testimonials). Clients
// write them; the coach can only Show or Hide — there is deliberately no way
// to edit the words or add one here (see sql/coach_testimonials.sql). Below
// that, the clients who haven't written one yet, each with a WhatsApp "Ask"
// that links straight to the client's form. The coach's Google review link
// lives here too: clients who write a testimonial get "Also post on Google"
// with it (CoachTestimonials.jsx).
const STATUS_LABEL = { pending: 'New', shown: 'Shown', hidden: 'Hidden' };
const STATUS_ORDER = { pending: 0, shown: 1, hidden: 2 };

export default function CoachTestimonialsManager() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [googleUrl, setGoogleUrl] = useState('');
  const [googleState, setGoogleState] = useState(''); // '' | 'saving' | 'saved' | error message

  useEffect(() => {
    let cancelled = false;
    databaseService.testimonials('list')
      .then(result => {
        if (cancelled) return;
        setData(result);
        setGoogleUrl(result?.googleReviewUrl || '');
      })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const setStatus = async (id, status) => {
    setBusyId(id);
    setError('');
    try {
      setData(await databaseService.testimonials('status', { id, status }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const saveGoogleUrl = async () => {
    setGoogleState('saving');
    try {
      const result = await databaseService.testimonials('google-link', { url: googleUrl });
      setData(result);
      setGoogleUrl(result?.googleReviewUrl || '');
      setGoogleState('saved');
    } catch (err) {
      setGoogleState(err.message);
    }
  };

  const ask = (client) => {
    openWhatsapp(toWhatsappNumber(client.phone), buildTestimonialAsk(client.name, window.location.origin));
  };

  if (!data && !error) return <p className="cp-testimonial-hint" style={{ paddingTop: 16 }}>Loading testimonials…</p>;
  if (!data) return <p className="cp-save-error">{error}</p>;

  const testimonials = [...(data.testimonials || [])].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const askable = data.askable || [];

  return (
    <>
      <p className="cp-testimonial-hint" style={{ paddingTop: 14 }}>
        Your clients write these from the app. You choose which ones show on your profile, but you can't change the words, so clients know they're real.
      </p>
      {error && <p className="cp-save-error" style={{ paddingTop: 0, paddingBottom: 8 }}>{error}</p>}

      <div className="cp-form-section-label">Google Reviews</div>
      <div className="cp-form-card">
        <div className="cp-field cp-field--last" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <label className="cp-field-label" htmlFor="cp-google-review-url">Google review link <span className="cp-field-unit">(optional)</span></label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              id="cp-google-review-url"
              className="cp-field-input"
              type="url"
              value={googleUrl}
              onChange={e => { setGoogleUrl(e.target.value); setGoogleState(''); }}
              placeholder="https://g.page/r/…/review"
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
              style={{ minWidth: 0 }}
            />
            <button
              type="button"
              className="cp-testimonial-btn"
              onClick={saveGoogleUrl}
              disabled={googleState === 'saving' || googleUrl.trim() === (data.googleReviewUrl || '')}
            >
              {googleState === 'saving' ? 'Saving…' : googleState === 'saved' ? '✓ Saved' : 'Save'}
            </button>
          </div>
          <span className="cp-field-unit" style={{ lineHeight: 1.4 }}>
            From your Google Business Profile → Ask for reviews. Clients who write you a testimonial get a button to post it on Google too.
          </span>
          {googleState && !['saving', 'saved'].includes(googleState) && (
            <span className="cp-save-error" style={{ padding: 0, textAlign: 'left' }}>{googleState}</span>
          )}
        </div>
      </div>

      <div className="cp-form-section-label">From your clients</div>
      {testimonials.length === 0 ? (
        <p className="cp-testimonial-hint">No testimonials yet. Ask a client below.</p>
      ) : testimonials.map(t => (
        <div className="cp-form-card cp-testimonial-card" key={t.id}>
          <div className="cp-testimonial-body">
            <div className="cp-testimonial-top">
              <span className="cp-testimonial-who">
                <Avatar email={t.clientEmail} name={t.clientName} avatarUrl={t.clientAvatarUrl} size={32} />
                <span className="cp-testimonial-who-text">
                  <span className="cp-testimonial-who-name">{t.clientName}</span>
                  {t.monthsTrained != null && <span className="cp-testimonial-meta">{trainedLabel(t.monthsTrained)}</span>}
                </span>
              </span>
              <span className={`cp-testimonial-pill cp-testimonial-pill--${t.status}`}>{STATUS_LABEL[t.status]}</span>
            </div>
            <p className="cp-testimonial-quote">{'“'}{t.quote}{'”'}</p>
            {t.result && <span className="cp-testimonial-result">{t.result}</span>}
            <div className="cp-testimonial-actions">
              <button
                type="button"
                className={`cp-testimonial-btn cp-testimonial-btn--show${t.status === 'shown' ? ' is-active' : ''}`}
                onClick={() => setStatus(t.id, 'shown')}
                disabled={busyId === t.id || t.status === 'shown'}
              >
                Show on profile
              </button>
              <button
                type="button"
                className={`cp-testimonial-btn cp-testimonial-btn--hide${t.status === 'hidden' ? ' is-active' : ''}`}
                onClick={() => setStatus(t.id, 'hidden')}
                disabled={busyId === t.id || t.status === 'hidden'}
              >
                Hide
              </button>
            </div>
          </div>
        </div>
      ))}

      {askable.length > 0 && (
        <>
          <div className="cp-form-section-label">Ask for a testimonial</div>
          <div className="cp-form-card">
            {askable.map((c, i) => (
              <div className={`cp-field${i > 0 ? ' cp-field--border' : ''}`} key={c.userId}>
                <span className="cp-field-label" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                {c.phone ? (
                  <button type="button" className="cp-testimonial-ask" onClick={() => ask(c)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" /></svg>
                    Ask on WhatsApp
                  </button>
                ) : (
                  <span className="cp-field-unit">No phone number</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
