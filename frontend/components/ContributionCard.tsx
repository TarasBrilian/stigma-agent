import type { Projection } from "@/lib/types";
import { formatBps, formatUsd, formatYearsLeft } from "@/lib/format";

/**
 * Shows the live-recomputed suggested monthly contribution. The return rate is
 * surfaced as an explicit assumption, not a promise (per ARCHITECTURE).
 */
export function ContributionCard({ projection }: { projection: Projection }) {
  const ahead = projection.onTrack && projection.requiredMonthlyUsd.startsWith("-");
  return (
    <div className="relief-panel p-5">
      <h3 className="section-title mb-3">Suggested contribution</h3>
      {ahead ? (
        <p className="carved-title text-2xl text-patina">Ahead of target 🎉</p>
      ) : (
        <p className="carved-title text-3xl text-gold-deep">
          {formatUsd(projection.requiredMonthlyUsd)}
          <span className="text-base font-normal text-ink-soft"> / month</span>
        </p>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-y-1.5 text-xs text-ink-soft">
        <dt>Time left</dt>
        <dd className="text-right text-ink">{formatYearsLeft(projection.yearsLeft)}</dd>
        <dt>Return assumption</dt>
        <dd className="text-right text-ink">{formatBps(projection.returnAssumptionBps)} / yr</dd>
        <dt>On track</dt>
        <dd className="text-right text-ink">{projection.onTrack ? "Yes" : "Needs attention"}</dd>
      </dl>
      <p className="mt-3 text-[11px] text-ink-faint">
        Assumption only — not a guarantee of returns.
      </p>
    </div>
  );
}
