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
        <span className="font-medium">{formatUsd(currentValueUsd)}</span>
        <span className="text-foreground/60">of {formatUsd(targetAmountUsd)}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-foreground/10">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-foreground/60">{formatProgress(progressBps)} to goal</span>
    </div>
  );
}
