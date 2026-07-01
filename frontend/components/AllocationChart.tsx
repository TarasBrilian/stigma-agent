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

/** Current vs glide-path target allocation, side by side. Display-only. */
export function AllocationChart({
  current,
  target,
}: {
  current: Allocation;
  target: Allocation;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Donut title="Current" alloc={current} />
      <Donut title="Target (glide-path)" alloc={target} />
    </div>
  );
}
