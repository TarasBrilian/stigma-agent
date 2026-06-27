"use client";

import Link from "next/link";
import { useWallet } from "@/hooks/use-wallet";
import { usePortfolios } from "@/hooks/use-portfolios";
import { PortfolioCard } from "@/components/PortfolioCard";

export default function DashboardPage() {
  const { publicKey, isConnected } = useWallet();
  const { data, isLoading, error } = usePortfolios(publicKey);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your portfolios</h1>
        <Link
          href="/onboarding"
          className="rounded-md bg-foreground px-4 py-2 text-sm text-background"
        >
          New portfolio
        </Link>
      </div>

      {!isConnected && (
        <p className="text-sm text-foreground/60">
          Connect your wallet to see your portfolios.
        </p>
      )}
      {isConnected && isLoading && (
        <p className="text-sm text-foreground/60">Loading…</p>
      )}
      {error && (
        <p className="text-sm text-red-500">
          Couldn&apos;t load portfolios (is the backend running?).
        </p>
      )}
      {isConnected && data && data.length === 0 && (
        <p className="text-sm text-foreground/60">
          No portfolios yet. Start with onboarding.
        </p>
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((s) => (
            <PortfolioCard key={s.meta.vaultHash} summary={s} />
          ))}
        </div>
      )}
    </div>
  );
}
