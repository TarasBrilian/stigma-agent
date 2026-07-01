import Link from "next/link";
import type { PortfolioSummary } from "@/lib/types";
import { formatProgress, formatUsd } from "@/lib/format";
import { ProfileBadge } from "./ProfileBadge";

export function PortfolioCard({ summary }: { summary: PortfolioSummary }) {
  const { meta, totalValueUsd, progressBps } = summary;
  return (
    <Link
      href={`/portfolio/${meta.vaultHash}`}
      className="relief-panel hover-relief block p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="carved-title text-base">{meta.name}</h3>
        <ProfileBadge profile={meta.profile} />
      </div>
      <p className="carved-title mt-3 text-3xl text-gold-deep">{formatUsd(totalValueUsd)}</p>
      <p className="mt-1 text-xs text-ink-soft">
        {formatProgress(progressBps)} toward {formatUsd(meta.targetAmountUsd)} by {meta.targetYear}
      </p>
    </Link>
  );
}
