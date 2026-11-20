import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BodyDiagram } from './MuscleAnalytics/MuscleHeatMap';
import MuscleThumbnail, { RegionThumbnail } from './MuscleAnalytics/MuscleThumbnail';
import { getWeeklyMuscleStats, isCountableSet } from '../utils/muscleAnalytics';
import { OPTIONAL_MUSCLES, getMuscleGroupsForExercise } from '../utils/muscleGroups';
import { parseLocalDateString } from '../utils/dateUtils';
import { getWeekMuscleView } from '../utils/weekMuscleView';
import { getRegionBreakdownForMuscle, hasRegions, getNextParts, getTopUpSets } from '../utils/muscleRegions';
import './MuscleAnalytics/WeeklyMuscleAnalytics.css';
import './WeekMuscleSheet.css';

// "This week's muscles": slides up when the body figures in the logger's
// timer bar are tapped (client logger and coach Live Log), so the home
// screen's Muscle Balance can be checked without leaving the workout.
// Counts the saved week plus the sets ticked in the session in progress,
// with the home screen's own counting (getWeeklyMuscleStats), so the two
// always agree. Under the body: one card per muscle this workout has worked,
// showing exactly what its home Muscle Balance card shows (status, sets /
// target, %), plus what today added and — for muscles with parts (Chest,
// Back, Shoulders…) — the parts today's sets went to, e.g. "Mid Chest 4 / 4".
//
// Next-part row (any muscle with parts): for a muscle worked today, the
// parts still short this week that today hasn't touched get dashed chips
// (Triceps Lateral Head today → Long Head; Mid Chest → Upper, Lower). "Add now"
// while the muscle is under Optimal and has had < 10 sets today; otherwise
// "Next <muscle> day", which saves the exercise to the client's leftovers
// (see getNextParts). A chip opens a short exercise list for that part.
// `workoutNames` = exercises in this workout, `laterNames` = leftovers
// saved for later from this workout; `onAddExercise(name)` and
// `onSaveForLater(name, part)` come from the logger. Without them the row
// is not shown (read-only use). An added or saved chip has an ✕ to undo it:
// `onUnsave(name)` takes it off the leftovers, `onRemoveExercise(name)`
// takes it back out of the workout (the logger refuses once a set is ticked).
//
// "+1 set" chips: a part today's sets went to that is only 1–2 sets short
// (Upper Chest 3/4) becomes a button. It adds that many sets to the exercise
// that trained it today (`onAddSets(name, count)`), under the same now-or-
// later rule, so a muscle that has had enough is never pushed further.
//
// Header: a pulsing "Training now  Triceps · Shoulders" line names the
// muscles this workout has worked. Under the workout's cards, every other
// muscle sits in a quiet stack (worst first, like a wallet): tap to fan it
// out, tap a card to open its parts and the same now-or-later chips.

const fmt = n => String(Math.round((n || 0) * 10) / 10);
const EPS = 0.001;

const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const hasName = (list, name) => (list || []).some(n => sameName(n, name));

const ArrowIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
const CalendarIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>
);

export default function WeekMuscleSheet({
  open, onClose, savedLogs, liveRows, logDate, level,
  workoutNames, laterNames, onAddExercise, onSaveForLater, onUnsave, onRemoveExercise, onAddSets,
}) {
  // The part whose exercise list is open: { muscle, id, sets, min, mode, suggestions }.
  const [picking, setPicking] = useState(null);
  const closeSheet = () => { setPicking(null); onClose(); };
  const canAct = typeof onAddExercise === 'function' && typeof onSaveForLater === 'function';

  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === 'Escape') { if (picking) setPicking(null); else onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, picking]);

  const data = useMemo(() => {
    if (!open || !logDate) return null;
    const view = getWeekMuscleView(savedLogs, liveRows, logDate, level);
    const { start, end, all, statsAll, byAll, regionSplit } = view;
    const saved = savedLogs || [];
    const bySaved = Object.fromEntries(
      getWeeklyMuscleStats(saved, start, end, { includeUntrained: true, level }).map(s => [s.muscle, s])
    );
    const todaySets = (liveRows || []).filter(r => isCountableSet(r)).length;

    const cards = statsAll
      .map(s => ({ stat: s, today: s.totalSets - (bySaved[s.muscle]?.totalSets || 0) }))
      .filter(c => c.today > EPS)
      .sort((a, b) => b.today - a.today)
      .map(c => {
        if (!hasRegions(c.stat.muscle)) return { ...c, parts: [], next: null };
        const beforeRows = getRegionBreakdownForMuscle(saved, c.stat.muscle, start, end, { level });
        const before = Object.fromEntries(beforeRows.map(r => [r.id, r.sets]));
        const allRows = getRegionBreakdownForMuscle(all, c.stat.muscle, start, end, { level });
        const todayRows = getRegionBreakdownForMuscle(liveRows || [], c.stat.muscle, start, end, { level });
        const topUp = getTopUpSets(allRows, beforeRows, todayRows, c.stat, c.today);
        const parts = allRows
          .filter(r => r.band && r.sets - (before[r.id] || 0) > EPS)
          .map(r => ({ id: r.id, sets: r.sets, min: r.band.min, topUp: topUp[r.id] || null }));
        const next = getNextParts(c.stat.muscle, allRows, beforeRows, c.stat, c.today);
        return { ...c, parts, next };
      });
    const worked = new Set(cards.map(c => c.stat.muscle));
    const lastBy = lastTrainedByMuscle(all, logDate);
    const others = statsAll
      .filter(s => !worked.has(s.muscle) && (s.totalSets > 0 || !OPTIONAL_MUSCLES.has(s.muscle)))
      .sort((a, b) => a.completionPercent - b.completionPercent || a.sets - b.sets)
      .map(stat => {
        const rows = hasRegions(stat.muscle) ? getRegionBreakdownForMuscle(all, stat.muscle, start, end, { level }) : [];
        const parts = rows.filter(r => r.band).map(r => ({ id: r.id, sets: r.sets, min: r.band.min }));
        // Nothing of this muscle was ticked today, so every short part is a
        // "next part" and the now-or-later rule runs with 0 sets today.
        const next = rows.length ? getNextParts(stat.muscle, rows, rows, stat, 0) : null;
        return { stat, parts, next, last: lastSeenText(lastBy[stat.muscle], logDate) };
      });
    return { byAll, regionSplit, todaySets, cards, others };
  }, [open, logDate, savedLogs, liveRows, level]);

  if (!open || !data) return null;
  // A part whose card has gone (sets unticked) closes its list.
  const { byAll, regionSplit, todaySets, cards, others } = data;
  const pickOpen = picking && [...cards, ...others].some(c => c.stat.muscle === picking.muscle) ? picking : null;

  return createPortal(
    <div className="wms-root" role="dialog" aria-modal="true" aria-label="This week's muscles">
      <div className="wms-backdrop" onClick={closeSheet} />
      <div className="wms-sheet">
        <button type="button" className="wms-grab" aria-label="Close" onClick={closeSheet}><span /></button>
        <div className="wms-head">
          <span className="wms-title">This week's muscles</span>
          <span className="wms-live">{todaySets} set{todaySets === 1 ? '' : 's'} today</span>
        </div>
        {cards.length > 0 && (
          <div className="wms-now">
            <span className="wms-now-dot" aria-hidden="true" />
            <span className="wms-now-lbl">Training now</span>
            <strong>{cards.map(c => c.stat.muscle).join(' · ')}</strong>
          </div>
        )}

        <div className="wms-bodies">
          {['front', 'back'].map(view => (
            <div key={view} className="wms-body">
              <BodyDiagram view={view} statByMuscle={byAll} onSelectMuscle={() => {}} regionSplit={regionSplit} />
              <span className="wms-view">{view === 'front' ? 'Front' : 'Back'}</span>
            </div>
          ))}
        </div>

        {cards.length === 0 ? (
          <p className="wms-empty">Tick a set and the muscles it works show up here, the same as your home cards.</p>
        ) : (
          <>
            <p className="wms-caption">Muscles in this workout · same as your home cards</p>
            {cards.map(({ stat, today, parts, next }) => {
              // Bar on the home card's scale (sets / target): the week before
              // today solid, today's sets striped on top, a green tick where
              // Optimal starts (the band's low end).
              const pctOf = n => Math.min(100, Math.max(0, (n / stat.target) * 100));
              const beforePct = pctOf(stat.sets - today);
              const todayPct = pctOf(stat.sets) - beforePct;
              const goal = stat.sets < stat.min
                ? `${fmt(stat.min - stat.sets)} more to Optimal`
                : stat.sets <= stat.max ? 'In the Optimal range' : 'Past the useful range';
              return (
                <div key={stat.muscle} className={`wms-card status-${stat.status.color}`}>
                  <div className="wms-card-top">
                    <span className="wms-thumb">
                      <MuscleThumbnail muscle={stat.muscle} color="var(--status-color)" size={36} />
                    </span>
                    <div className="wms-card-title">
                      <div className="wms-card-line">
                        <strong>{stat.muscle}</strong>
                        <span className="wms-pct">{stat.completionPercent}<small>%</small></span>
                      </div>
                      <div className="wms-card-line">
                        <span className="wms-pill">{stat.status.label}</span>
                        <span className="wms-sets">{fmt(stat.sets)} / {stat.target} sets</span>
                      </div>
                    </div>
                  </div>
                  <div className="wms-track" role="img" aria-label={`${fmt(stat.sets)} of ${stat.target} sets, ${fmt(today)} today`}>
                    <span className="wms-fill" style={{ width: `${beforePct}%` }} />
                    <span className="wms-fill wms-fill--today" style={{ left: `${beforePct}%`, width: `${todayPct}%` }} />
                    <span className="wms-optimal" style={{ left: `${pctOf(stat.min)}%` }} />
                  </div>
                  <div className="wms-card-foot">
                    <span className="wms-up">↗ +{fmt(today)} today</span>
                    {parts.map(p => (p.topUp && typeof onAddSets === 'function' ? (
                      <button key={p.id} type="button" className="wms-chip wms-chip--topup"
                        title={`Add ${p.topUp.count} set${p.topUp.count === 1 ? '' : 's'} of ${p.topUp.exercise}`}
                        aria-label={`${p.id} ${fmt(p.sets)} of ${p.min}: add ${p.topUp.count} set${p.topUp.count === 1 ? '' : 's'} of ${p.topUp.exercise}`}
                        onClick={() => onAddSets(p.topUp.exercise, p.topUp.count)}>
                        {p.id} {fmt(p.sets)}/{p.min}
                        <b aria-hidden="true">+</b>
                      </button>
                    ) : (
                      <span key={p.id} className={`wms-chip${p.sets >= p.min ? ' is-done' : ''}`}>
                        {p.sets >= p.min ? '✓ ' : ''}{p.id} {fmt(p.sets)}/{p.min}
                      </span>
                    )))}
                    <span className="wms-goal">{goal}</span>
                  </div>
                  {canAct && next && (
                    <NextPartRow muscle={stat.muscle} next={next} today={today}
                      workoutNames={workoutNames} laterNames={laterNames}
                      onUnsave={onUnsave} onRemoveExercise={onRemoveExercise}
                      onPick={p => setPicking({ ...p, muscle: stat.muscle, mode: next.mode })} />
                  )}
                </div>
              );
            })}
          </>
        )}
        {others.length > 0 && (
          <OtherMuscles others={others} canAct={canAct}
            workoutNames={workoutNames} laterNames={laterNames}
            onUnsave={onUnsave} onRemoveExercise={onRemoveExercise}
            onPick={(muscle, mode, p) => setPicking({ ...p, muscle, mode })} />
        )}
      </div>
      {canAct && pickOpen && (
        <PartPicker part={pickOpen} workoutNames={workoutNames} laterNames={laterNames}
          onClose={() => setPicking(null)}
          onAdd={name => { onAddExercise(name); setPicking(null); }}
          onLater={name => { onSaveForLater(name, pickOpen.id); setPicking(null); }} />
      )}
    </div>,
    document.body
  );
}

const DAY = 86400000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Latest date (up to logDate) each muscle had a counted set.
function lastTrainedByMuscle(rows, logDate) {
  const out = {};
  (rows || []).forEach(r => {
    if (!r.log_date || r.log_date > logDate || !isCountableSet(r)) return;
    getMuscleGroupsForExercise(r.exercise_name).forEach(m => {
      if (!out[m] || r.log_date > out[m]) out[m] = r.log_date;
    });
  });
  return out;
}

function lastSeenText(date, logDate) {
  if (!date) return 'Not trained yet';
  const days = Math.round((parseLocalDateString(logDate) - parseLocalDateString(date)) / DAY);
  if (days <= 0) return 'Trained today';
  if (days === 1) return 'Last trained yesterday';
  if (days < 7) return `Last trained ${WEEKDAYS[parseLocalDateString(date).getDay()]}`;
  return `Not trained for ${days} days`;
}

// Muscles this workout hasn't touched: slim cards stacked worst-on-top like
// a wallet. Tap the stack to fan it out; tap a fanned card to open it.
function OtherMuscles({ others, canAct, workoutNames, laterNames, onPick, onUnsave, onRemoveExercise }) {
  const [fanned, setFanned] = useState(false);
  const [openMuscle, setOpenMuscle] = useState(null);
  const n = others.length;
  const peek = Math.min(n - 1, 2);
  const stackRef = useRef(null);
  const folding = useRef(false);
  // Fold back: slide every card up onto its place in the stack (the cards past
  // the third fade into it), then switch to the stacked layout.
  const fold = () => {
    const box = stackRef.current;
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!box || reduce) { setFanned(false); setOpenMuscle(null); return; }
    if (folding.current) return;
    folding.current = true;
    const cards = [...box.children];
    box.classList.add('is-folding');
    cards.forEach((el, i) => {
      const k = Math.min(i, 2);
      const dy = (peek - k) * 10 - el.offsetTop;
      const delay = Math.min(i, 6) * 25; // top card first, then down the list
      el.style.zIndex = String(10 - i);
      el.style.transition = `transform 0.38s cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms, opacity 0.3s ease ${delay}ms`;
      el.style.transform = `translateY(${dy}px) scale(${1 - k * 0.045})`;
      if (i > 2) el.style.opacity = '0';
    });
    window.setTimeout(() => {
      cards.forEach(el => { el.style.transition = 'none'; });
      box.classList.remove('is-folding');
      folding.current = false;
      setFanned(false);
      setOpenMuscle(null);
      window.requestAnimationFrame(() => cards.forEach(el => { el.style.transition = ''; el.style.opacity = ''; }));
    }, 380 + Math.min(cards.length - 1, 6) * 25);
  };
  const toggleFan = () => { if (fanned) fold(); else { setFanned(true); setOpenMuscle(null); } };
  const shown = fanned ? others : others.slice(0, 3);
  const stackProps = fanned ? {} : {
    role: 'button',
    tabIndex: 0,
    'aria-label': `Show ${n} more muscle${n === 1 ? '' : 's'}`,
    onClick: toggleFan,
    onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFan(); } },
  };
  return (
    <section className="wms-others" aria-label="Other muscles this week">
      <div className="wms-divider"><span>{n} more muscle{n === 1 ? '' : 's'} this week</span></div>
      <div ref={stackRef} className={`wms-stack${fanned ? ' is-fanned' : ''}`}
        style={fanned ? undefined : { height: 78 + peek * 10 }} {...stackProps}>
        {shown.map(({ stat, parts, next, last }, i) => {
          const isOpen = fanned && openMuscle === stat.muscle;
          const pctOf = v => Math.min(100, Math.max(0, (v / stat.target) * 100));
          const left = stat.min - stat.sets;
          return (
            <div key={stat.muscle}
              className={`wms-ocard status-${stat.status.color}${isOpen ? ' is-open' : ''}`}
              style={fanned ? { animationDelay: `${i * 35}ms` } : {
                top: (peek - i) * 10,
                transform: `scale(${1 - i * 0.045})`,
                zIndex: 10 - i,
              }}>
              <button type="button" className="wms-ocard-head" tabIndex={fanned ? 0 : -1}
                aria-expanded={fanned ? isOpen : undefined}
                onClick={fanned ? () => setOpenMuscle(isOpen ? null : stat.muscle) : undefined}>
                <span className="wms-othumb">
                  <MuscleThumbnail muscle={stat.muscle} color={isOpen ? 'var(--status-color)' : 'currentColor'} size={isOpen ? 34 : 26} />
                </span>
                <strong>{stat.muscle}</strong>
                <span className="wms-pill">{stat.status.label}</span>
                <span className="wms-opct">{stat.completionPercent}<small>%</small></span>
              </button>
              <div className="wms-otrack">
                <span className="wms-fill" style={{ width: `${pctOf(stat.sets)}%` }} />
                <span className="wms-optimal" style={{ left: `${pctOf(stat.min)}%` }} />
              </div>
              <div className="wms-ofoot">
                <span>{last}</span>
                <span>{fmt(stat.sets)} / {stat.target} sets</span>
              </div>
              {isOpen && (
                <div className="wms-odetail">
                  {parts.length > 0 && (
                    <div className="wms-oparts">
                      {parts.map(p => (
                        <span key={p.id} className={`wms-chip${p.sets >= p.min ? ' is-done' : ''}`}>
                          {p.sets >= p.min ? '✓ ' : ''}{p.id} {fmt(p.sets)}/{p.min}
                        </span>
                      ))}
                    </div>
                  )}
                  {canAct && next ? (
                    <NextPartRow muscle={stat.muscle} next={next} today={0}
                      workoutNames={workoutNames} laterNames={laterNames}
                      onUnsave={onUnsave} onRemoveExercise={onRemoveExercise}
                      onPick={p => onPick(stat.muscle, next.mode, p)} />
                  ) : (
                    <p className="wms-ogoal">
                      {left > EPS ? `${fmt(left)} more set${Math.abs(left - 1) < EPS ? '' : 's'} to Optimal this week`
                        : stat.sets <= stat.max ? 'Done for the week · let it rest' : 'Past the useful range this week'}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className="wms-fan" onClick={toggleFan} aria-expanded={fanned}>
        {fanned ? 'Stack them' : 'Tap to fan out'}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={fanned ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} /></svg>
      </button>
    </section>
  );
}

const dayWord = muscle => `${muscle.toLowerCase()} day`;

// The dashed chips under a card: parts not reached yet this week.
function NextPartRow({ muscle, next, today, workoutNames, laterNames, onPick, onUnsave, onRemoveExercise }) {
  const now = next.mode === 'now';
  const why = now
    ? `${muscle} is under Optimal with ${fmt(today)} set${today === 1 ? '' : 's'} today, so there's room for one more exercise.`
    : `${muscle} has had enough for today. Keep these for next time.`;
  return (
    <div className={`wms-next is-${next.mode}`}>
      <span className="wms-next-lbl">
        {now ? <ArrowIcon /> : <CalendarIcon />}
        {now ? `Finish the rest of your ${muscle.toLowerCase()}` : `Next ${dayWord(muscle)}`}
      </span>
      {next.parts.map(p => {
        const added = p.suggestions.find(n => hasName(workoutNames, n));
        const saved = p.suggestions.find(n => hasName(laterNames, n));
        if (added || saved) {
          const undo = added ? onRemoveExercise : onUnsave;
          return (
            <span key={p.id} className={`wms-nchip is-set${added ? '' : ' is-saved'}`}>
              <RegionThumbnail region={p.id} color="currentColor" size={20} />
              {added ? `${added} added` : `${saved} saved for next time`}
              {typeof undo === 'function' && (
                <button type="button" className="wms-nchip-undo" aria-label={`Undo ${added || saved}`}
                  onClick={() => undo(added || saved)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              )}
            </span>
          );
        }
        return (
          <button key={p.id} type="button" className={`wms-nchip is-${next.mode}`} onClick={() => onPick(p)}>
            <RegionThumbnail region={p.id} color="currentColor" size={20} />
            {p.id} {fmt(p.sets)}/{p.min}
          </button>
        );
      })}
      <span className="wms-next-why">{why}</span>
    </div>
  );
}

// Short exercise list for one part: Add (now mode) or save for next session.
function PartPicker({ part, workoutNames, laterNames, onClose, onAdd, onLater }) {
  const now = part.mode === 'now';
  const options = part.suggestions.slice(0, 4);
  const first = options.find(n => !hasName(workoutNames, n));
  return (
    <div className="wms-pick-root" role="dialog" aria-modal="true" aria-label={part.id}>
      <div className="wms-pick-backdrop" onClick={onClose} />
      <div className="wms-pick">
        <div className="wms-pick-head">
          <span className="wms-pick-thumb"><RegionThumbnail region={part.id} color="#6366f1" size={40} /></span>
          <div>
            <strong>{part.id}</strong>
            <span>{fmt(part.sets)} / {part.min} sets this week · {now ? 'pick one to add now' : 'save one for next time'}</span>
          </div>
        </div>
        {options.map(name => {
          const inWorkout = hasName(workoutNames, name);
          const saved = hasName(laterNames, name);
          let action;
          if (inWorkout) action = <span className="wms-pick-state">In workout</span>;
          else if (saved) action = <span className="wms-pick-state">Saved</span>;
          else if (now) action = <button type="button" className="wms-pick-add" onClick={() => onAdd(name)}>Add</button>;
          else action = <button type="button" className="wms-pick-later" onClick={() => onLater(name)}>Save</button>;
          return (
            <div key={name} className="wms-pick-row">
              <span className="wms-pick-name">{name}</span>
              {action}
            </div>
          );
        })}
        {now && first && !hasName(laterNames, first) && (
          <button type="button" className="wms-pick-skip" onClick={() => onLater(first)}>
            Not today: save {first} for next {dayWord(part.muscle)}
          </button>
        )}
      </div>
    </div>
  );
}
