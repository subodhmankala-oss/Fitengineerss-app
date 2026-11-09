import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdminNews, markNewsSeen } from './useAdminNews';
import { getAdminNewsArticle } from '../../services/databaseService';
import './NewsRail.css';

// Founder only: daily muscle-building + nutrition news (requested 2026-11-09).
// Two variants share everything below:
// - "rail" (default): the desktop side panel fixed in the right-hand lane
//   beside the client list; NewsRail.css hides it below 1360px.
// - "page": the phone's News tab, opened from the My Clients / News /
//   Super-Admin bar in TrainerDashboard.jsx; in-flow, full width.
// Data + AI coach takeaways come from api/_adminNews.js, refreshed once a
// day server-side; this component only reads (via useAdminNews).

const TOPICS = [
  { key: 'all', label: 'All' },
  { key: 'muscle', label: 'Muscle' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'research', label: 'Research' }
];
const TOPIC_LABEL = { muscle: 'Muscle', nutrition: 'Nutrition', research: 'Research' };
const FIRST_COUNT = 3;

const svg = (children, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const Icon = {
  news: (s) => svg(<><path d="M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1-4 0V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a3 3 0 0 0 3 3h11" /><path d="M8 8h4M8 12h4M8 16h4" /></>, s),
  refresh: (s) => svg(<><path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></>, s),
  bulb: (s) => svg(<><path d="M3 12h1m8-9v1m8 8h1M5.6 5.6l.7.7m12.1-.7-.7.7" /><path d="M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0-1 3a2 2 0 0 1-4 0a3.5 3.5 0 0 0-1-3" /><path d="M9.7 17h4.6" /></>, s),
  external: (s) => svg(<><path d="M12 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /><path d="M11 13l9-9M15 4h5v5" /></>, s),
  copy: (s) => svg(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>, s),
  share: (s) => svg(<><circle cx="6" cy="12" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8.7 10.7l6.6-3.4M8.7 13.3l6.6 3.4" /></>, s),
  close: (s) => svg(<path d="M18 6 6 18M6 6l12 12" />, s),
  back: (s) => svg(<path d="M15 6l-6 6 6 6" />, s),
  muscle: (s) => svg(<><path d="M2 12h1M6 8H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /><path d="M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z" /><path d="M9 12h6" /><path d="M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1z" /><path d="M18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M22 12h-1" /></>, s),
  nutrition: (s) => svg(<><circle cx="12" cy="14" r="7" /><path d="M12 11V5a2 2 0 0 1 2-2h2v1a2 2 0 0 1-2 2h-2" /><path d="M10 10.5c1.3.7 2.7.7 4 0" /></>, s),
  research: (s) => svg(<><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" /><path d="M7.5 15h9" /></>, s)
};

function timeAgo(iso, now = Date.now()) {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1d ago' : `${d}d ago`;
}

function updatedLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return `${day} · updated ${time}`;
}

function Thumb({ item, big = false }) {
  const [failed, setFailed] = useState(false);
  if (item.image && !failed) {
    return (
      <img
        className={big ? 'news-reader-image' : 'news-thumb'}
        src={item.image}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className={`${big ? 'news-reader-image' : 'news-thumb'} news-tile news-topic-${item.topic}`}>
      {Icon[item.topic]?.(big ? 34 : 22)}
    </div>
  );
}

// Matches the .news-closing transition in NewsRail.css. Unmount is driven by
// this timer, not transitionend, so the panel can never get stuck open if
// the browser skips the transition (hidden tab, reduced motion).
const READER_EXIT_MS = 240;

function Reader({ item, onClose, asPage }) {
  const [copied, setCopied] = useState(false);
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    setClosing((was) => {
      if (!was) setTimeout(onClose, READER_EXIT_MS);
      return true;
    });
  }, [onClose]);

  // Safety net for the slide-in: a browser whose animation clock is stalled
  // (backgrounded window, some embedded webviews) would otherwise hold the
  // panel at its off-screen start. Normal slide is 300ms, so this is a no-op.
  const panelRef = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => {
      panelRef.current?.getAnimations?.().forEach((a) => { if (a.playState === 'running') a.finish(); });
    }, 450);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // "Read full article": fetched + extracted by the server on demand
  // (api/_newsArticle.js) and shown here as plain text — the sites
  // themselves break or show cookie walls when embedded.
  const [full, setFull] = useState({ status: 'idle', data: null, error: '' });
  const articleRef = useRef(null);
  const readFull = async () => {
    setFull({ status: 'loading', data: null, error: '' });
    try {
      setFull({ status: 'ready', data: await getAdminNewsArticle(item.link), error: '' });
    } catch (e) {
      console.warn('news article load failed:', e?.message || e);
      setFull({ status: 'error', data: null, error: "This article can't be shown in the app." });
    }
  };
  useEffect(() => {
    if (full.status === 'ready') articleRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [full.status]);

  const shareText = [item.title, item.takeaway].filter(Boolean).join('\n');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${item.link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — nothing useful to show */ }
  };
  // Phone: the system share sheet (WhatsApp etc.); falls back to copying.
  const canShare = asPage && typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const share = async () => {
    try {
      await navigator.share({ title: item.title, text: shareText, url: item.link });
    } catch (e) {
      if (e?.name !== 'AbortError') copy();
    }
  };

  return (
    <div className={`news-reader-backdrop${closing ? ' news-closing' : ''}`} onClick={close}>
      <aside ref={panelRef} className="news-reader" role="dialog" aria-modal="true" aria-label={item.title} onClick={(e) => e.stopPropagation()}>
        <Thumb item={item} big />
        <div className="news-reader-body">
          <div className="news-reader-top">
            {asPage ? (
              <>
                <button type="button" className="news-back-btn" onClick={close} aria-label="Close">{Icon.back(16)} News</button>
                <span className={`news-tag news-topic-${item.topic}`}>{TOPIC_LABEL[item.topic]}</span>
              </>
            ) : (
              <>
                <span className={`news-tag news-topic-${item.topic}`}>{TOPIC_LABEL[item.topic]}</span>
                <button type="button" className="news-icon-btn" onClick={close} aria-label="Close">{Icon.close(18)}</button>
              </>
            )}
          </div>
          <h3 className="news-reader-title">{item.title}</h3>
          <div className="news-meta">
            {item.source}{item.journal ? ` · ${item.journal}` : ''} · {timeAgo(item.publishedAt)}
          </div>
          {item.summary && full.status !== 'ready' && <p className="news-reader-summary">{item.summary}</p>}
          {item.takeaway && (
            <div className="news-takeaway-box">
              {Icon.bulb(16)}
              <span><strong>Coach takeaway:</strong> {item.takeaway}</span>
            </div>
          )}
          <div className="news-reader-actions">
            {full.status !== 'ready' && (
              <button type="button" className="news-btn" onClick={readFull} disabled={full.status === 'loading'}>
                {full.status === 'loading' ? 'Loading article…' : 'Read full article'}
              </button>
            )}
            {canShare ? (
              <button type="button" className="news-btn" onClick={share}>
                {Icon.share(14)} {copied ? 'Copied' : 'Share'}
              </button>
            ) : item.takeaway && (
              <button type="button" className="news-btn" onClick={copy}>
                {Icon.copy(14)} {copied ? 'Copied' : 'Copy takeaway'}
              </button>
            )}
          </div>

          {full.status === 'error' && (
            <div className="news-article-error">
              {full.error}{' '}
              <a href={item.link} target="_blank" rel="noopener noreferrer">Open the original {Icon.external(12)}</a>
            </div>
          )}
          {full.status === 'ready' && (
            <article ref={articleRef} className="news-article">
              {full.data.byline && <div className="news-meta news-article-byline">{full.data.byline}</div>}
              {full.data.blocks.map((b, i) => {
                if (b.type === 'h') return <h4 key={i}>{b.text}</h4>;
                if (b.type === 'li') return <p key={i} className="news-article-li">{b.text}</p>;
                if (b.type === 'q') return <blockquote key={i}>{b.text}</blockquote>;
                return <p key={i}>{b.text}</p>;
              })}
              <a className="news-article-original" href={item.link} target="_blank" rel="noopener noreferrer">
                Source: {item.source} · Open original {Icon.external(12)}
              </a>
            </article>
          )}
        </div>
      </aside>
    </div>
  );
}

export default function NewsRail({ variant = 'rail' }) {
  const asPage = variant === 'page';
  const { data, error, loading, load } = useAdminNews();
  const [topic, setTopic] = useState('all');
  const [showAll, setShowAll] = useState(asPage);
  const [openItem, setOpenItem] = useState(null);
  const sectionRef = useRef(null);

  // Tells NewsRail.css to shift the client column left so the rail has its
  // own lane (no-op below 1360px, where the rail itself is hidden).
  useEffect(() => {
    if (asPage) return undefined;
    document.body.classList.add('has-news-rail');
    return () => document.body.classList.remove('has-news-rail');
  }, [asPage]);

  // Clears the News tab's unread bubble, but only once the news is actually
  // on screen: the rail is also mounted (CSS-hidden) on phones.
  useEffect(() => {
    if (!data?.items?.length || !sectionRef.current) return;
    if (getComputedStyle(sectionRef.current).display === 'none') return;
    markNewsSeen(data.items);
  }, [data]);

  const items = useMemo(
    () => (data?.items || []).filter((i) => topic === 'all' || i.topic === topic),
    [data, topic]
  );
  const visible = showAll ? items : items.slice(0, FIRST_COUNT);
  const closeReader = useCallback(() => setOpenItem(null), []);

  return (
    <>
      <section ref={sectionRef} className={asPage ? 'news-page' : 'news-rail'} aria-label="Today in training">
        <div className="news-rail-head">
          <span className="news-rail-icon">{Icon.news(18)}</span>
          <span className="news-rail-title">Today in training</span>
          <button
            type="button"
            className={`news-icon-btn${loading ? ' news-spin' : ''}`}
            onClick={() => load(true)}
            disabled={loading}
            aria-label="Refresh news"
            title="Refresh news"
          >
            {Icon.refresh(16)}
          </button>
        </div>
        <div className="news-meta">{data?.fetchedAt ? updatedLabel(data.fetchedAt) : loading ? 'Fetching today’s news…' : ''}</div>

        <div className="news-chips" role="tablist">
          {TOPICS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={topic === t.key}
              className={`news-chip news-topic-${t.key}${topic === t.key ? ' active' : ''}`}
              onClick={() => { setTopic(t.key); setShowAll(asPage); }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && !data && (
          <div className="news-empty">
            {error} <button type="button" className="news-link" onClick={() => load(false)}>Try again</button>
          </div>
        )}
        {!loading && data && !items.length && <div className="news-empty">No {topic === 'all' ? '' : `${TOPIC_LABEL[topic].toLowerCase()} `}stories today.</div>}

        <div className="news-list">
          {visible.map((item) => (
            <button key={item.id} type="button" className="news-item" onClick={() => setOpenItem(item)}>
              <Thumb item={item} />
              <div className="news-item-body">
                <span className={`news-tag news-topic-${item.topic}`}>{TOPIC_LABEL[item.topic]}</span>
                <div className="news-item-title">{item.title}</div>
                {item.takeaway && (
                  <div className="news-item-takeaway">{Icon.bulb(13)} <span>{item.takeaway}</span></div>
                )}
                <div className="news-meta">{item.source} · {timeAgo(item.publishedAt)}</div>
              </div>
            </button>
          ))}
        </div>

        {!asPage && items.length > FIRST_COUNT && (
          <button type="button" className="news-more" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show less' : `Show ${items.length - FIRST_COUNT} more`}
          </button>
        )}
      </section>
      {openItem && <Reader item={openItem} onClose={closeReader} asPage={asPage} />}
    </>
  );
}
