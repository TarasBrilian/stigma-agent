/**
 * Landing-only "jewel Mesoamerican" backdrop.
 *
 * A fixed, full-viewport decorative layer: jewel-tone gradient fields (from CSS
 * on `.aztec-bg`) overlaid with Aztec *greca* (step-fret) bands and sun-glyph
 * watermarks. Pure presentational server component — no state, no client JS.
 * Sits behind all content (z-index -10) so text/panels stay readable; only the
 * page ground gains color + tribal geometry. Rendered once by the landing page.
 *
 * Colors come from the theme's jewel tokens (which flip light/dark), applied via
 * `currentColor` so each element is tinted by an inline `color`.
 */

/** Aztec greca / step-fret meander band. No viewBox → the pattern tiles in CSS
    pixels across the full width of the band (avoids aspect-ratio "meet" clipping). */
function Greca({ id, height = 30 }: { id: string; height?: number }) {
  return (
    <svg width="100%" height={height} aria-hidden="true" style={{ display: "block" }}>
      <defs>
        <pattern id={id} width="34" height={height} patternUnits="userSpaceOnUse">
          {/* rail + a hooked meander unit (a single greca link) */}
          <path
            d="M0 26 H34 M4 26 V6 H22 V20 H13 V16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        </pattern>
      </defs>
      <rect width="100%" height={height} fill={`url(#${id})`} />
    </svg>
  );
}

/** Sun-stone style glyph — concentric rings, a ray crown, a stepped square core. */
function SunGlyph({ className = "" }: { className?: string }) {
  const rays = Array.from({ length: 16 }, (_, i) => i * 22.5);
  return (
    <svg
      viewBox="-100 -100 200 200"
      className={className}
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <circle r="94" strokeWidth="1.1" opacity="0.5" />
      <circle r="80" strokeWidth="0.9" opacity="0.4" />
      {rays.map((a) => (
        <path
          key={a}
          d="M0 -80 L6.5 -64 L-6.5 -64 Z"
          strokeWidth="1"
          opacity="0.55"
          transform={`rotate(${a})`}
        />
      ))}
      <circle r="48" strokeWidth="1.1" opacity="0.6" />
      <rect x="-22" y="-22" width="44" height="44" strokeWidth="1.1" opacity="0.65" />
      <rect
        x="-22"
        y="-22"
        width="44"
        height="44"
        strokeWidth="1.1"
        opacity="0.55"
        transform="rotate(45)"
      />
      <rect x="-11" y="-11" width="22" height="22" strokeWidth="1.2" opacity="0.8" />
      <circle r="4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AztecBackground() {
  return (
    <div className="aztec-bg" aria-hidden="true">
      {/* greca step-fret bands */}
      <div className="aztec-band aztec-band-top" style={{ color: "var(--jewel-gold)" }}>
        <Greca id="greca-top" />
      </div>
      <div className="aztec-band aztec-band-bottom" style={{ color: "var(--jewel-jade)" }}>
        <Greca id="greca-bottom" />
      </div>

      {/* sun-glyph watermarks */}
      <SunGlyph className="aztec-glyph aztec-glyph-tr" />
      <SunGlyph className="aztec-glyph aztec-glyph-bl" />
    </div>
  );
}
