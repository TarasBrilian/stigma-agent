import type { Projection } from "@/lib/types";
import { formatBps, formatUsd, formatYearsLeft } from "@/lib/format";

/**
 * Shows the live-recomputed suggested monthly contribution. The return rate is
 * surfaced as an explicit assumption, not a promise (per ARCHITECTURE).
 */
export function ContributionCard({ projection }: { projection: Projection }) {
  const ahead = projection.onTrack && projection.requiredMonthlyUsd.startsWith("-");
  return (
    <div className="rounded-lg border border-foreground/10 p-4">
      <h3 className="text-sm font-medium text-foreground/70">Suggested contribution</h3>
      {ahead ? (
        <p className="mt-1 text-2xl font-semibold text-emerald-600">Ahead of target 🎉</p>
      ) : (
        <p className="mt-1 text-2xl font-semibold">
          {formatUsd(projection.requiredMonthlyUsd)}
          <span className="text-base font-normal text-foreground/60"> / month</span>
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs text-foreground/60">
        <dt>Time left</dt>
        <dd className="text-right">{formatYearsLeft(projection.yearsLeft)}</dd>
        <dt>Return assumption</dt>
        <dd className="text-right">{formatBps(projection.returnAssumptionBps)} / yr</dd>
        <dt>On track</dt>
        <dd className="text-right">{projection.onTrack ? "Yes" : "Needs attention"}</dd>
      </dl>
      <p className="mt-2 text-[11px] text-foreground/40">
        Assumption only — not a guarantee of returns.
      </p>
    </div>
  );
}
