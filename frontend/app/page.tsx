import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center gap-8 py-16 text-center">
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Goal-based investing, run by an AI agent.
        </h1>
        <p className="text-foreground/60">
          Set a financial goal and let an autonomous agent build, fund, and
          rebalance a portfolio toward it on Casper — with a glide-path that
          de-risks as your goal approaches. You stay in control of your funds.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/onboarding"
          className="rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background"
        >
          Get started
        </Link>
        <Link
          href="/dashboard"
          className="rounded-md border border-foreground/20 px-5 py-2.5 text-sm font-medium hover:bg-foreground/5"
        >
          View dashboard
        </Link>
      </div>
      <p className="text-xs text-foreground/40">
        Testnet only · all tradable assets are mocked.
      </p>
    </div>
  );
}
