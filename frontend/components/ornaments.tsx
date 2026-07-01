/**
 * Temple relief ornaments (Borobudur motifs) as inline SVG.
 *
 * Pure presentational server components — no state, no client JS. Color is
 * inherited via `currentColor`, so callers set the tone with a text-* class
 * (e.g. `text-gold`). Decorative only: every element is aria-hidden.
 */

/** Bell-stupa silhouette — the app mark. */
export function StupaMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 34" className={className} fill="currentColor" aria-hidden="true">
      {/* finial */}
      <path d="M16 0.5l1.5 3.2h-3z" />
      <circle cx="16" cy="6" r="1.9" />
      <rect x="15.2" y="8" width="1.6" height="3.4" rx="0.6" />
      {/* bell dome */}
      <path
        d="M9.4 24.5C9.4 16 12 11.4 16 11.4s6.6 4.6 6.6 13.1z"
        opacity="0.95"
      />
      {/* lotus base */}
      <path d="M8 24.5h16l-1.6 2.6H9.6z" opacity="0.8" />
      {/* stepped plinth */}
      <rect x="6.5" y="27.6" width="19" height="2.3" rx="0.8" opacity="0.7" />
      <rect x="8.5" y="30.4" width="15" height="2.3" rx="0.8" opacity="0.55" />
    </svg>
  );
}

/** Row of temple peaks (candi) with stupa finials — a carved cornice band. */
export function TempleFret({
  className = "",
  height = 12,
}: {
  className?: string;
  height?: number;
}) {
  return (
    <svg
      className={className}
      width="100%"
      height={height}
      viewBox={`0 0 160 12`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <pattern id="candi-fret" width="16" height="12" patternUnits="userSpaceOnUse">
          <path d="M1 11L8 2.4L15 11" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <circle cx="8" cy="1.4" r="1" fill="currentColor" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="160" height="12" fill="url(#candi-fret)" />
    </svg>
  );
}

/** Concentric lotus rosette — hero / footer watermark. */
export function LotusMandala({ className = "" }: { className?: string }) {
  const outer = Array.from({ length: 12 }, (_, i) => i * 30);
  const inner = Array.from({ length: 12 }, (_, i) => i * 30 + 15);
  return (
    <svg
      viewBox="-100 -100 200 200"
      className={className}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle r="93" strokeWidth="0.5" opacity="0.45" />
      <circle r="72" strokeWidth="0.5" opacity="0.4" />
      {outer.map((a) => (
        <path
          key={`o${a}`}
          d="M0 -88C16 -60 16 -30 0 -14C-16 -30 -16 -60 0 -88Z"
          strokeWidth="0.7"
          opacity="0.5"
          transform={`rotate(${a})`}
        />
      ))}
      {inner.map((a) => (
        <path
          key={`i${a}`}
          d="M0 -58C10 -40 10 -20 0 -10C-10 -20 -10 -40 0 -58Z"
          strokeWidth="0.7"
          opacity="0.7"
          transform={`rotate(${a})`}
        />
      ))}
      <circle r="12" strokeWidth="0.8" />
      <circle r="4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Small carved lozenge — inline divider glyph. */
export function Lozenge({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} fill="currentColor" aria-hidden="true">
      <path d="M6 0l6 6-6 6-6-6z" />
    </svg>
  );
}
