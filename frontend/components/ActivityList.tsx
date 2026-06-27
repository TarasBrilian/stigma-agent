import type { RebalanceLogEntry } from "@/lib/types";
import { ASSETS } from "@/lib/constants";
import { formatUsd } from "@/lib/format";

/** Rebalance history with the agent's rationale surfaced inline (not buried). */
export function ActivityList({ entries }: { entries: RebalanceLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-foreground/50">No rebalances yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {entries.map((e) => (
        <li key={e.id} className="rounded-lg border border-foreground/10 p-3">
          <div className="flex items-center justify-between text-xs text-foreground/50">
            <span>{new Date(e.timestamp).toLocaleString()}</span>
            {e.x402Receipt && <span title={e.x402Receipt}>fee paid (x402)</span>}
          </div>
          <p className="mt-1 text-sm">{e.rationale}</p>
          {e.swaps.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {e.swaps.map((s) => {
                const sold = s.deltaUsd.startsWith("-");
                return (
                  <span
                    key={s.asset}
                    className={`rounded px-1.5 py-0.5 text-[11px] ${
                      sold ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {sold ? "−" : "+"}
                    {ASSETS[s.asset].label} {formatUsd(s.deltaUsd.replace("-", ""))}
                  </span>
                );
              })}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
