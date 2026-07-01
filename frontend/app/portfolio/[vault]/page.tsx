import { api } from "@/lib/api";
import type { PortfolioState, Projection, RebalanceLogEntry } from "@/lib/types";
import { AllocationChart } from "@/components/AllocationChart";
import { GoalProgress } from "@/components/GoalProgress";
import { ContributionCard } from "@/components/ContributionCard";
import { ActivityList } from "@/components/ActivityList";
import { AgentChat } from "@/components/AgentChat";
import { DepositForm } from "@/components/DepositForm";
import { WithdrawForm } from "@/components/WithdrawForm";
import { UpdateConfigForm } from "@/components/UpdateConfigForm";
import { DemoPanel } from "@/components/DemoPanel";
import { ProfileBadge } from "@/components/ProfileBadge";

// Portfolio state is live (read at request time from the backend); never
// statically prerender it at build.
export const dynamic = "force-dynamic";

export default async function PortfolioPage({
  params,
}: {
  params: Promise<{ vault: string }>;
}) {
  const { vault } = await params;

  let state: PortfolioState | null = null;
  let projection: Projection | null = null;
  let activity: RebalanceLogEntry[] = [];
  try {
    [state, projection, activity] = await Promise.all([
      api.getPortfolio(vault),
      api.getProjection(vault),
      api.getActivity(vault),
    ]);
  } catch {
    // Backend not reachable yet — render a graceful placeholder below.
  }

  if (!state) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="carved-title text-xl">Portfolio</h1>
        <p className="text-sm text-ink-soft">
          Couldn&apos;t load this portfolio. Make sure the backend is running and
          the vault hash is correct.
        </p>
        <p className="font-mono text-xs text-ink-faint">vault: {vault}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="carved-title text-2xl">{state.name}</h1>
          <p className="font-mono text-xs text-ink-faint">{state.vaultHash}</p>
        </div>
        <ProfileBadge profile={state.profile} />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <section className="relief-panel p-5 lg:col-span-2">
          <h2 className="section-title mb-4">Allocation</h2>
          <AllocationChart
            current={state.currentAllocation}
            target={state.currentTargetAllocation}
          />
        </section>

        <div className="flex flex-col gap-6">
          <DepositForm vaultHash={state.vaultHash} />
          <WithdrawForm vaultHash={state.vaultHash} />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section className="relief-panel p-5">
          <h2 className="section-title mb-4">Goal</h2>
          <GoalProgress
            progressBps={state.progressBps}
            currentValueUsd={state.totalValueUsd}
            targetAmountUsd={state.targetAmountUsd}
          />
        </section>
        {projection && <ContributionCard projection={projection} />}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex flex-col">
          <h2 className="section-title mb-4">Activity</h2>
          <ActivityList entries={activity} />
        </section>
        <section className="flex flex-col">
          <h2 className="section-title mb-4">Ask the agent</h2>
          <AgentChat vaultHash={state.vaultHash} />
        </section>
      </div>

      <UpdateConfigForm
        vaultHash={state.vaultHash}
        baseAllocation={state.baseAllocation}
        targetAmountUsd={state.targetAmountUsd}
        targetYear={state.targetYear}
      />

      <DemoPanel vaultHash={state.vaultHash} />
    </div>
  );
}
