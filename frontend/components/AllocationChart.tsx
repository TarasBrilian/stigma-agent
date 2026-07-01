"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Allocation } from "@/lib/types";
import { ASSETS, ASSET_SYMBOLS } from "@/lib/constants";
import { bpsToPercent } from "@/lib/format";

function toData(alloc: Allocation) {
  return ASSET_SYMBOLS.filter((s) => (alloc[s] ?? 0) > 0).map((s) => ({
    name: ASSETS[s].label,
    value: bpsToPercent(alloc[s] ?? 0),
    color: ASSETS[s].color,
  }));
}

function Donut({ title, alloc }: { title: string; alloc: Allocation }) {
  const data = toData(alloc);
  return (
    <div className="flex flex-col items-center">
      <h4 className="mb-1 text-[11px] uppercase tracking-[0.12em] text-ink-soft">{title}</h4>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => `${Number(value).toFixed(1)}%`}
            contentStyle={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              color: "var(--ink)",
              fontSize: 12,
              boxShadow: "0 8px 20px -12px rgba(43,35,23,0.5)",
            }}
            itemStyle={{ color: "var(--ink)" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Current vs glide-path target allocation, with a per-asset breakdown. Display-only. */
export function AllocationChart({
  current,
  target,
}: {
  current: Allocation;
  target: Allocation;
}) {
  const rows = ASSET_SYMBOLS.filter(
    (s) => (current[s] ?? 0) > 0 || (target[s] ?? 0) > 0,
  );
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4">
        <Donut title="Current" alloc={current} />
        <Donut title="Target (glide-path)" alloc={target} />
      </div>

      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-[1fr_5rem_5rem] gap-x-4 border-b border-line/60 pb-1.5 text-[11px] uppercase tracking-[0.12em] text-ink-faint">
          <span>Asset</span>
          <span className="text-right">Current</span>
          <span className="text-right">Target</span>
        </div>
        {rows.map((s) => (
          <div
            key={s}
            className="grid grid-cols-[1fr_5rem_5rem] items-center gap-x-4 py-1 text-sm"
          >
            <span className="flex items-center gap-2 text-ink">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: ASSETS[s].color }}
              />
              {ASSETS[s].label}
            </span>
            <span className="text-right font-mono text-ink-soft">
              {bpsToPercent(current[s] ?? 0).toFixed(1)}%
            </span>
            <span className="text-right font-mono text-ink-soft">
              {bpsToPercent(target[s] ?? 0).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
