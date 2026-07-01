import type { Usd6 } from "@/lib/types";
import { formatProgress, formatUsd } from "@/lib/format";

/** Progress toward the goal. `progressBps` is value/target in bps (display-only). */
export function GoalProgress({
  progressBps,
  currentValueUsd,
  targetAmountUsd,
}: {
  progressBps: number;
  currentValueUsd: Usd6;
  targetAmountUsd: Usd6;
}) {
  const pct = Math.max(0, Math.min(100, progressBps / 100));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="carved-title text-lg text-gold-deep">{formatUsd(currentValueUsd)}</span>
        <span className="text-ink-soft">of {formatUsd(targetAmountUsd)}</span>
      </div>
      <div className="relief-inset h-3 w-full overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold-bright to-gold"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-ink-soft">{formatProgress(progressBps)} to goal</span>
    </div>
  );
}
