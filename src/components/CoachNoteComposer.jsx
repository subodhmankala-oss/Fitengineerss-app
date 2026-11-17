import React, { useMemo, useState } from 'react';
import { getWeeklyMuscleStats } from '../utils/muscleAnalytics';
import { heatColor } from '../utils/workoutHeat';
import { HeatBodyFigure } from './MuscleAnalytics/MuscleThumbnail';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import './CoachNoteComposer.css';

/**
 * The coach's note to a client about a session. Two homes, one look:
 *  - mode "send": client detail, a FINISHED session. Its own send button,
 *    exercise rows and a mini heat map of what the session trained.
 *  - mode "attach": Live Log, the session still running. No send button —
 *    the note goes out with Save workout session — and exercise chips
 *    instead of rows (the timer bar already shows the live heat map).
 * Tapping an exercise or a quick reply fills the note; it stays editable.
 *
 * `recap` = buildSessionRecap(...), `quickReplies` = buildQuickReplies(...),
 * `rows` = workout_logs-shaped rows of this session (heat map, send mode).
 */

const Svg = ({ size = 14, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ClockIcon = () => <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></Svg>;
const FlameIcon = () => <Svg><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.6 1 2.6 2 3 0-3-.5-5.5.5-8z" /></Svg>;
const TrophyIcon = () => <Svg><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></Svg>;
const CheckIcon = () => <Svg><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-5" /></Svg>;
const DashedIcon = () => <Svg><path d="M8.6 3.7a9 9 0 0 1 6.8 0M20.3 8.6a9 9 0 0 1 0 6.8M15.4 20.3a9 9 0 0 1-6.8 0M3.7 15.4a9 9 0 0 1 0-6.8" /></Svg>;
const CloseIcon = () => <Svg size={16}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
const SendIcon = () => <Svg size={18}><path d="M10 14 21 3" /><path d="m21 3-6.5 18a.55.55 0 0 1-1 0L10 14l-7-3.5a.55.55 0 0 1 0-1L21 3" /></Svg>;
const ClipIcon = () => <Svg size={13}><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" /></Svg>;
const MessageIcon = () => <Svg size={17}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12z" /></Svg>;
const ChevronIcon = () => <Svg size={18}><path d="m6 9 6 6 6-6" /></Svg>;

const ROWS_SHOWN = 4;

function StatusIcon({ item }) {
  if (item.isPR) return <span className="cnx-ic cnx-ic--pr"><TrophyIcon /></span>;
  if (item.status === 'done') return <span className="cnx-ic cnx-ic--done"><CheckIcon /></span>;
  return <span className="cnx-ic cnx-ic--miss"><DashedIcon /></span>;
}

// Mini front+back heat map of this session; a picked exercise narrows it
// to the muscles that one exercise worked.
function SessionHeat({ rows, date, focus }) {
  const stats = useMemo(() => {
    const use = focus ? (rows || []).filter(r => r.exercise_name === focus) : (rows || []);
    return getWeeklyMuscleStats(use, date, date).filter(s => s.totalSets > 0).sort((a, b) => b.totalSets - a.totalSets);
  }, [rows, date, focus]);
  const setsBy = useMemo(() => Object.fromEntries(stats.map(s => [s.muscle, s.totalSets])), [stats]);
  if (!rows || rows.length === 0) return null;
  const colorFor = (m) => heatColor(setsBy[m] || 0);
  return (
    <div className="cnx-heat" title="Muscles trained">
      <HeatBodyFigure view="front" height={70} colorFor={colorFor} />
      <HeatBodyFigure view="back" height={70} colorFor={colorFor} />
      <span className="cnx-sr">Muscles trained: {stats.map(s => s.muscle).join(', ') || 'none'}</span>
    </div>
  );
}

function topMusclesLabel(rows, date) {
  if (!rows || rows.length === 0) return '';
  return getWeeklyMuscleStats(rows, date, date)
    .filter(s => s.totalSets > 0)
    .sort((a, b) => b.totalSets - a.totalSets)
    .slice(0, 3)
    .map(s => s.muscle)
    .join(' · ');
}

export default function CoachNoteComposer({
  mode = 'send',
  clientLabel,
  title,
  subtitle,
  durationLabel,
  kcalLabel,
  recap = [],
  quickReplies = [],
  rows,
  date,
  value,
  onChange,
  onSend,
  sending = false,
  disabled = false,
  feedback = null,
  onDismiss,
  open = true,
  onToggle,
  bodyRef,
  bodyStyle,
}) {
  const [picked, setPicked] = useState(null); // 'q:<i>' | 'x:<name>'
  const [showAll, setShowAll] = useState(false);
  const isLive = mode === 'attach';
  const prCount = recap.filter(r => r.isPR).length;
  const hasText = !!(value || '').trim();
  const muscles = !isLive ? topMusclesLabel(rows, date) : '';
  const focus = picked && picked.startsWith('x:') ? picked.slice(2) : null;
  const tabIndex = open ? 0 : -1;

  const pick = (key, text) => { setPicked(key); onChange(text); };
  const type = (e) => { setPicked(null); onChange(e.target.value); };

  const pills = (
    <div className="cnx-pills">
      {durationLabel && <span className="cnx-pill cnx-pill--time"><ClockIcon />{durationLabel}</span>}
      {kcalLabel && <span className="cnx-pill cnx-pill--kcal"><FlameIcon />{kcalLabel}</span>}
      {prCount > 0 && <span className="cnx-pill cnx-pill--pr"><TrophyIcon />{prCount === 1 ? '1 PR' : `${prCount} PRs`}</span>}
    </div>
  );

  const quick = quickReplies.length > 0 && (
    <>
      <div className="cnx-label">Quick reply</div>
      <div className="cnx-chips">
        {quickReplies.map((q, i) => (
          <button
            key={q.label}
            type="button"
            className={`cnx-chip${picked === `q:${i}` ? ' is-on' : ''}`}
            onClick={() => pick(`q:${i}`, q.text)}
            disabled={disabled || sending}
            tabIndex={tabIndex}
          >
            {q.label}
          </button>
        ))}
      </div>
    </>
  );

  const box = (
    <div className={`cnx-box${hasText ? ' has-text' : ''}`}>
      <textarea
        className="cnx-input"
        rows={isLive ? 2 : 1}
        placeholder={isLive ? 'Write a note to send with this session…' : 'Write a note…'}
        value={value}
        onChange={type}
        disabled={disabled || sending}
        tabIndex={tabIndex}
      />
      {!isLive && (
        <button
          type="button"
          className={`cnx-send${hasText ? ' is-ready' : ''}`}
          onClick={onSend}
          disabled={sending || !hasText}
          aria-label="Send note"
          title="Send note"
        >
          {sending ? <span className="cnx-spinner" aria-hidden="true" /> : <SendIcon />}
        </button>
      )}
    </div>
  );

  if (isLive) {
    return (
      <div className="cnx cnx--live">
        <button type="button" className="cnx-toggle" onClick={onToggle} aria-expanded={open}>
          <span className="cnx-toggle-ic"><MessageIcon /></span>
          <span className="cnx-toggle-text">
            <span className="cnx-title">{hasText ? `Note for ${clientLabel} attached` : `Add a note for ${clientLabel}`}</span>
            <span className="cnx-sub">
              {hasText && !open ? `“${value.trim().slice(0, 42)}${value.trim().length > 42 ? '…' : ''}”` : 'Optional · sends with this session'}
            </span>
          </span>
          <span className={`cnx-chev${open ? ' is-open' : ''}`}><ChevronIcon /></span>
        </button>
        <div ref={bodyRef} className={`coach-note-slide ${open ? 'coach-note-slide--open' : ''}`} style={bodyStyle} aria-hidden={!open}>
          <div className="cnx-body">
            {pills}
            {recap.length > 0 && (
              <>
                <div className="cnx-label">From this session</div>
                <div className="cnx-chips">
                  {recap.map(item => (
                    <button
                      key={item.name}
                      type="button"
                      className={`cnx-chip${picked === `x:${item.name}` ? ' is-on' : ''}`}
                      onClick={() => pick(`x:${item.name}`, item.reply)}
                      disabled={disabled}
                      tabIndex={tabIndex}
                    >
                      <StatusIcon item={item} />
                      {item.isPR ? `${item.name} PR` : item.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            {quick}
            {box}
            <div className={`cnx-attach${hasText ? ' is-on' : ''}`}>
              <ClipIcon />
              <span>{hasText ? 'Attached · sends when you tap Save workout session' : 'Sends when you tap Save workout session'}</span>
              {hasText && (
                <button type="button" className="cnx-clear" onClick={() => { setPicked(null); onChange(''); }} tabIndex={tabIndex}>Clear</button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const shown = showAll ? recap : recap.slice(0, ROWS_SHOWN);
  return (
    <div className="cnx cnx--send">
      <div className="cnx-head">
        <span className="cnx-avatar">{(clientLabel || 'C').trim()[0].toUpperCase()}</span>
        <span className="cnx-head-text">
          <span className="cnx-title">{title}</span>
          {subtitle && <span className="cnx-sub">{subtitle}</span>}
        </span>
        {onDismiss && (
          <button type="button" className="cnx-close" onClick={onDismiss} title="Not now" aria-label="Not now"><CloseIcon /></button>
        )}
      </div>
      <div className="cnx-summary">
        <SessionHeat rows={rows} date={date} focus={focus} />
        <div className="cnx-summary-side">
          {pills}
          {muscles && <div className="cnx-muscles">{muscles}</div>}
        </div>
      </div>
      {recap.length > 0 && (
        <div className="cnx-rows">
          {shown.map(item => (
            <button
              key={item.name}
              type="button"
              className={`cnx-row${picked === `x:${item.name}` ? ' is-on' : ''}`}
              onClick={() => pick(`x:${item.name}`, item.reply)}
              disabled={sending}
            >
              <StatusIcon item={item} />
              <span className="cnx-row-name">{item.name}</span>
              {item.isPR
                ? <span className="cnx-pill cnx-pill--pr"><TrophyIcon />PR {item.prWeight}</span>
                : <span className={`cnx-row-detail${item.status !== 'done' ? ' is-miss' : ''}`}>{item.status === 'done' ? item.detail : 'skipped'}</span>}
            </button>
          ))}
          {recap.length > ROWS_SHOWN && (
            <button type="button" className="cnx-more" onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Show less' : `+${recap.length - ROWS_SHOWN} more`}
            </button>
          )}
          <div className="cnx-hint">Tap an exercise to reply about it</div>
        </div>
      )}
      <div className="cnx-foot">
        {quick}
        {box}
        {feedback && <div className={`cnx-feedback ${feedback.ok ? 'ok' : 'err'}`}>{feedback.text}</div>}
      </div>
    </div>
  );
}
