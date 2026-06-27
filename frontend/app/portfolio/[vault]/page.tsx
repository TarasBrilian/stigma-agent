import { api } from "@/lib/api";
import type { PortfolioState, Projection, RebalanceLogEntry } from "@/lib/types";
import { AllocationChart } from "@/components/AllocationChart";
import { GoalProgress } from "@/components/GoalProgress";
import { ContributionCard } from "@/components/ContributionCard";
import { ActivityList } from "@/components/ActivityList";
import { AgentChat } from "@/components/AgentChat";
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
        <h1 className="text-xl font-semibold">Portfolio</h1>
        <p className="text-sm text-foreground/60">
          Couldn&apos;t load this portfolio. Make sure the backend is running and
          the vault hash is correct.
        </p>
        <p className="text-xs text-foreground/40">vault: {vault}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{state.name}</h1>
          <p className="text-xs text-foreground/40">{state.vaultHash}</p>
        </div>
        <ProfileBadge profile={state.profile} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-lg border border-foreground/10 p-4">
          <h2 className="mb-3 text-sm font-medium text-foreground/70">Allocation</h2>
          <AllocationChart
            current={state.currentAllocation}
            target={state.currentTargetAllocation}
          />
        </section>

        <div className="flex flex-col gap-6">
          <section className="rounded-lg border border-foreground/10 p-4">
            <h2 className="mb-3 text-sm font-medium text-foreground/70">Goal</h2>
            <GoalProgress
              progressBps={state.progressBps}
              currentValueUsd={state.totalValueUsd}
              targetAmountUsd={state.targetAmountUsd}
            />
          </section>
          {projection && <ContributionCard projection={projection} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium text-foreground/70">Activity</h2>
          <ActivityList entries={activity} />
        </section>
        <section>
          <h2 className="mb-3 text-sm font-medium text-foreground/70">Ask the agent</h2>
          <AgentChat vaultHash={state.vaultHash} />
        </section>
      </div>

      <DemoPanel vaultHash={state.vaultHash} />
    </div>
  );
}
