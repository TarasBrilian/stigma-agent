import Link from "next/link";
import type { PortfolioSummary } from "@/lib/types";
import { formatProgress, formatUsd } from "@/lib/format";
import { ProfileBadge } from "./ProfileBadge";

export function PortfolioCard({ summary }: { summary: PortfolioSummary }) {
  const { meta, totalValueUsd, progressBps } = summary;
  return (
    <Link
      href={`/portfolio/${meta.vaultHash}`}
      className="block rounded-lg border border-foreground/10 p-4 transition hover:border-foreground/30"
    >
      <div className="flex items-start justify-between">
        <h3 className="font-medium">{meta.name}</h3>
        <ProfileBadge profile={meta.profile} />
      </div>
      <p className="mt-2 text-2xl font-semibold">{formatUsd(totalValueUsd)}</p>
      <p className="mt-1 text-xs text-foreground/60">
        {formatProgress(progressBps)} toward {formatUsd(meta.targetAmountUsd)} by {meta.targetYear}
      </p>
    </Link>
  );
}
