import './ProgramRing.css';

// Past this many sessions the pieces would be slivers, so the ring is one arc.
const MAX_PIECES = 24;
const STROKE = 3;

/**
 * The client's program drawn around their photo: one piece per session,
 * filled as they're done (one smooth arc for long programs). With no `total`
 * the photo stands alone.
 */
export default function ProgramRing({ done = 0, total = null, size = 56, children }) {
  if (!total) return <span className="program-ring is-unset">{children}</span>;
  const r = (size - STROKE) / 2 - 0.5;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  const filled = Math.max(0, Math.min(total, done));
  const step = c / total;
  // The round ends stick out by half the stroke each side, so the dash is cut
  // by the stroke on top of the space we want to see between pieces.
  const gap = STROKE + Math.min(3, step * 0.25);
  const circle = (key, cls, dash, deg) => (
    <circle key={key} className={cls} cx={mid} cy={mid} r={r} fill="none" strokeWidth={STROKE} strokeLinecap="round"
      strokeDasharray={dash} transform={`rotate(${deg} ${mid} ${mid})`} />
  );
  return (
    <span className="program-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {total > 1 && total <= MAX_PIECES
          ? Array.from({ length: total }, (_, i) => circle(
            i, i < filled ? 'is-done' : 'is-left',
            `${Math.max(0.1, step - gap)} ${c}`, -90 + ((i + gap / 2 / step) * 360) / total
          ))
          : [
            circle('track', 'is-left', undefined, -90),
            filled > 0 && circle('arc', 'is-done', `${(filled / total) * c} ${c}`, -90),
          ]}
      </svg>
      {children}
    </span>
  );
}
