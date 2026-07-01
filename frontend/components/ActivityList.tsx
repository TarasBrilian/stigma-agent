import type { RebalanceLogEntry } from "@/lib/types";
import { ASSETS } from "@/lib/constants";
import { formatUsd } from "@/lib/format";

/** Rebalance history with the agent's rationale surfaced inline (not buried). */
export function ActivityList({ entries }: { entries: RebalanceLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-ink-faint">No rebalances yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {entries.map((e) => (
        <li key={e.id} className="relief-panel p-4">
          <div className="flex items-center justify-between text-xs text-ink-faint">
            <span>{new Date(e.timestamp).toLocaleString()}</span>
            {e.x402Receipt && (
              <span className="chip chip-gold px-2 py-0.5 text-[10px]" title={e.x402Receipt}>
                fee paid · x402
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink">{e.rationale}</p>
          {e.swaps.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {e.swaps.map((s) => {
                const sold = s.deltaUsd.startsWith("-");
                return (
                  <span
                    key={s.asset}
                    className={`chip px-2 py-0.5 text-[11px] ${
                      sold ? "chip-terracotta" : "chip-patina"
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
