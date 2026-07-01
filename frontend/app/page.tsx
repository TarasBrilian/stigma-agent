import Link from "next/link";
import Image from "next/image";
import { TempleFret, Lozenge } from "@/components/ornaments";
import { Reveal } from "@/components/Reveal";
import { AztecBackground } from "@/components/AztecBackground";
import {
  GlidePathFigure,
  SecurityBoundary,
  ArchitectureStack,
  ComparisonTable,
} from "@/components/landing";

/* ── At-a-glance credibility strip ──────────────────────────────── */
const HIGHLIGHTS = [
  { k: "Non-custodial", v: "you hold the keys" },
  { k: "On-chain glide-path", v: "auto de-risks to goal" },
  { k: "LLM never trades", v: "advice & rationale only" },
  { k: "Autonomous", v: "runs on keeper loops" },
];

/* ── The end-to-end flow ────────────────────────────────────────── */
const FLOW = [
  {
    n: "I",
    actor: "You",
    tone: "gold",
    title: "Set your goal",
    body: "Answer a few questions. The agent assigns a risk profile and a starter allocation you can review and edit — before a single coin is committed.",
  },
  {
    n: "II",
    actor: "You",
    tone: "gold",
    title: "Create your vault",
    body: "Sign the vault deploy in your wallet and become its sole owner. No factory, no middleman — the vault is yours on Casper.",
  },
  {
    n: "III",
    actor: "You",
    tone: "gold",
    title: "Fund it",
    body: "Deposit mUSDC. It's escrowed in your vault — a deposit alone never triggers a trade, so nothing moves until you're ready.",
  },
  {
    n: "IV",
    actor: "Agent",
    tone: "patina",
    title: "The agent invests",
    body: "On your deposit, the agent triggers the buy. The vault derives every swap amount from your on-chain balance and target — the agent supplies none of the numbers.",
  },
  {
    n: "V",
    actor: "Agent",
    tone: "patina",
    title: "Rebalance on drift",
    body: "Keeper loops watch prices. When your mix drifts past its band, the agent triggers a rebalance and the contract swaps back to the exact target — with the reasoning logged in plain language.",
  },
  {
    n: "VI",
    actor: "You",
    tone: "gold",
    title: "You keep custody",
    body: "Withdraw anytime. Only you can move funds out of the vault — the agent has no path to your money, and never will.",
  },
];

function SectionHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <Reveal className="flex flex-col items-center gap-3 text-center">
      <TempleFret className="w-36 text-gold/50" height={10} />
      {eyebrow && <span className="section-title">{eyebrow}</span>}
      <h2 className="carved-title text-2xl sm:text-3xl">{title}</h2>
      {children && <p className="max-w-xl text-sm leading-relaxed text-ink-soft">{children}</p>}
    </Reveal>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col gap-20 pb-4 sm:gap-28">
      {/* colorful jewel-Mesoamerican backdrop (landing only) */}
      <AztecBackground />

      {/* ── Hero (text left · enshrined relief right) ─────────── */}
      <section className="hero-stage relative overflow-hidden px-5 py-10 sm:px-8 sm:py-12">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          {/* left column — copy + CTAs */}
          <div className="flex flex-col items-start gap-6 text-left">
            <span
              className="chip chip-gold rise px-3 py-1 text-xs"
              style={{ animationDelay: "0.05s" }}
            >
              Goal-based · autonomous · on Casper
            </span>
            <h1
              className="carved-title rise text-4xl leading-[1.12] sm:text-5xl"
              style={{ animationDelay: "0.12s" }}
            >
              Goal-based investing, run by an AI agent.
            </h1>
            <p
              className="rise max-w-md text-lg leading-relaxed text-ink-soft"
              style={{ animationDelay: "0.2s" }}
            >
              Set a financial goal and let an autonomous agent build, fund, and
              rebalance a portfolio toward it on Casper — with a glide-path that
              de-risks as your goal approaches. You stay in control of your funds.
            </p>
            <div
              className="rise flex flex-wrap items-center gap-3"
              style={{ animationDelay: "0.28s" }}
            >
              <Link href="/onboarding" className="btn-gold group px-6 py-3 text-sm">
                Get started
                <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">
                  →
                </span>
              </Link>
              <Link href="/dashboard" className="btn-outline px-6 py-3 text-sm">
                View dashboard
              </Link>
            </div>
            <p
              className="rise text-xs tracking-wide text-ink-faint"
              style={{ animationDelay: "0.36s" }}
            >
              Testnet only · all tradable assets are mocked.
            </p>
          </div>

          {/* right column — meditating Buddha, enshrined in a lit niche */}
          <figure className="rise" style={{ animationDelay: "0.34s" }}>
            <div className="relic-niche float-slow">
              <Image
                src="/image.png"
                alt="Stone relief of the Buddha seated in meditation, surrounded by attendant figures"
                width={1350}
                height={860}
                priority
                sizes="(max-width: 1024px) 92vw, 520px"
                className="relief-frieze relief-mask-radial h-auto w-full"
              />
            </div>
          </figure>
        </div>

        {/* at-a-glance strip */}
        <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {HIGHLIGHTS.map((h, i) => (
            <Reveal
              as="li"
              key={h.k}
              delay={i * 90}
              className="relief-inset flex flex-col gap-0.5 px-4 py-3"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <Lozenge className="h-2 w-2 text-gold" />
                {h.k}
              </span>
              <span className="pl-3.5 text-xs text-ink-faint">{h.v}</span>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* ── How it works — the full flow ─────────────────────── */}
      <section className="flex flex-col items-center gap-10">
        <SectionHeader eyebrow="How it works" title="From a goal to an agent-run portfolio">
          Six steps, split cleanly between what you sign and what the agent
          triggers — with every amount kept deterministic and on-chain.
        </SectionHeader>

        <ol className="grid w-full gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FLOW.map((s, i) => (
            <Reveal
              as="li"
              key={s.n}
              delay={(i % 3) * 110}
              className="relief-panel hover-relief flex flex-col p-6"
            >
              <div className="flex items-center justify-between">
                <span className="chip chip-gold carved-title flex h-11 w-11 items-center justify-center rounded-full text-sm">
                  {s.n}
                </span>
                <span className={`chip chip-${s.tone} px-2.5 py-0.5 text-[11px]`}>{s.actor}</span>
              </div>
              <h3 className="carved-title mt-4 text-lg">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ── Philosophy — patience made automatic ─────────────── */}
      <section className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
        <Reveal className="relic-glow">
          <Image
            src="/relic.png"
            alt="Carved sandstone frieze: figures seated in meditation beneath trees, flanked by standing attendants"
            width={1688}
            height={932}
            sizes="(max-width: 1024px) 92vw, 560px"
            className="relief-frieze relief-mask-vignette h-auto w-full"
          />
        </Reveal>
        <Reveal delay={130} className="flex flex-col items-start gap-4">
          <span className="section-title">The long view</span>
          <h2 className="carved-title text-2xl sm:text-3xl">Patience, made automatic.</h2>
          <p className="max-w-md text-sm leading-relaxed text-ink-soft">
            Great fortunes aren&apos;t timed — they&apos;re tended. Stigma turns a
            distant goal into a steady, unhurried discipline: contributing,
            rebalancing, and de-risking on a cadence the market can&apos;t rattle.
          </p>
          <p className="max-w-md text-sm leading-relaxed text-ink-soft">
            The agent doesn&apos;t chase the next candle. It keeps its eyes on the
            year you named — and moves only when the rules say it should.
          </p>
        </Reveal>
      </section>

      {/* ── Glide-path explainer ─────────────────────────────── */}
      <section className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
        <Reveal className="flex flex-col items-start gap-4">
          <span className="section-title">The glide-path</span>
          <h2 className="carved-title text-2xl sm:text-3xl">
            It de-risks as your goal nears.
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-ink-soft">
            Early on, your portfolio tilts toward growth — Bitcoin and tokenized
            equities. As the target year approaches, the on-chain target
            automatically shifts toward gold and a stablecoin, locking in your
            progress.
          </p>
          <p className="max-w-md text-sm leading-relaxed text-ink-soft">
            You never rebalance by hand, and you never trust a spreadsheet: the
            curve below is <span className="text-ink">computed inside the contract</span>,
            the same math the agent must obey.
          </p>
          <span className="chip chip-stone px-3 py-1 text-xs">
            Computed on-chain · Moderate profile shown
          </span>
        </Reveal>
        <Reveal delay={140}>
          <GlidePathFigure />
        </Reveal>
      </section>

      {/* ── Security / trust model ───────────────────────────── */}
      <section className="flex flex-col items-center gap-10">
        <SectionHeader eyebrow="The trust model" title="It invests for you. It can never withdraw.">
          Two keys act on your vault — yours and the agent&apos;s. The split is
          enforced by the contract, not by a promise. The worst a leaked agent
          key could do is trigger a harmless extra rebalance.
        </SectionHeader>

        <div className="w-full">
          <SecurityBoundary />
        </div>

        <Reveal className="flex flex-wrap items-center justify-center gap-3">
          {["Non-custodial by design", "Deterministic money math", "Every swap is slippage-capped"].map(
            (t) => (
              <span key={t} className="chip chip-patina px-3 py-1 text-xs">
                {t}
              </span>
            ),
          )}
        </Reveal>
      </section>

      {/* ── Architecture ─────────────────────────────────────── */}
      <section className="flex flex-col items-center gap-10">
        <SectionHeader eyebrow="Under the hood" title="Three layers, one hard boundary">
          A wallet-signing frontend, an advising-and-triggering backend, and
          Casper contracts that hold the funds and do the math. The LLM only
          advises; every executed number is computed on-chain.
        </SectionHeader>

        <div className="w-full max-w-3xl">
          <ArchitectureStack />
        </div>
      </section>

      {/* ── Why on-chain — rules carved in stone ─────────────── */}
      <section className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
        <Reveal className="flex flex-col items-start gap-4 lg:order-1">
          <span className="section-title">Why on-chain</span>
          <h2 className="carved-title text-2xl sm:text-3xl">Rules carved in stone.</h2>
          <p className="max-w-md text-sm leading-relaxed text-ink-soft">
            Every rule that moves your money lives in the contract — not in a
            company&apos;s terms of service. The target allocation, the swap
            amounts, who is allowed to withdraw: all enforced on Casper, in
            public, the same for everyone.
          </p>
          <p className="max-w-md text-sm leading-relaxed text-ink-soft">
            Nothing to take on faith, nothing hidden in a back office. What the
            agent may do is <span className="text-ink">law you can read</span>,
            not a promise you have to trust.
          </p>
        </Reveal>
        <Reveal delay={130} className="relic-glow lg:order-2">
          <Image
            src="/relic2.png"
            alt="Carved sandstone frieze: a narrative temple-wall scene of figures, trees, and daily life"
            width={1805}
            height={871}
            sizes="(max-width: 1024px) 92vw, 560px"
            className="relief-frieze relief-mask-vignette h-auto w-full"
          />
        </Reveal>
      </section>

      {/* ── Competitor comparison ────────────────────────────── */}
      <section className="flex flex-col items-center gap-10">
        <SectionHeader eyebrow="How it compares" title="Familiar idea, safer foundation">
          Goal-based investing isn&apos;t new. Doing it without handing over
          custody — and without letting a language model move your money — is.
        </SectionHeader>

        <Reveal className="w-full">
          <ComparisonTable />
        </Reveal>
      </section>

      {/* ── x402 / machine economy (with the lotus-bearing relief) ─ */}
      <section className="tablet overflow-hidden px-6 py-10 sm:px-10 sm:py-12">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,300px)_1fr] lg:gap-12">
          <Reveal className="relic-glow mx-auto w-full max-w-[16rem]">
            <Image
              src="/relic3.png"
              alt="Tall carved panel: the Buddha holding a lotus stem, framed by bodhi leaves and lotus blooms"
              width={921}
              height={1707}
              sizes="(max-width: 1024px) 60vw, 300px"
              className="relief-frieze relief-mask-vignette h-auto w-full"
            />
          </Reveal>
          <Reveal delay={130} className="flex flex-col items-start gap-5 text-left">
            <span className="section-title">Machine economy</span>
            <h2 className="carved-title text-2xl sm:text-3xl">
              An autonomous service that pays its own way.
            </h2>
            <p className="max-w-xl text-sm leading-relaxed text-ink-soft">
              Stigma isn&apos;t a dashboard you operate — it runs itself. And like
              any real service, it charges for the work it does: each rebalance
              pulls a tiny fee via <span className="text-ink">x402</span>,
              Casper&apos;s pay-per-call standard. A glimpse of software that acts,
              and settles, on its own.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {["~0.1% per rebalance", "paid in mUSDC", "settled on-chain"].map((t) => (
                <span key={t} className="chip chip-gold px-3 py-1 text-xs">
                  {t}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────── */}
      <Reveal as="section" className="flex flex-col items-center gap-6 text-center">
        <TempleFret className="w-36 text-gold/50" height={10} />
        <h2 className="carved-title max-w-xl text-2xl sm:text-3xl">
          Set a goal. Let the agent do the rest.
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/onboarding" className="btn-gold group px-6 py-3 text-sm">
            Begin onboarding
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">
              →
            </span>
          </Link>
          <Link href="/dashboard" className="btn-outline px-6 py-3 text-sm">
            View dashboard
          </Link>
        </div>
        <p className="text-xs tracking-wide text-ink-faint">
          Testnet only · all tradable assets are mocked.
        </p>
      </Reveal>
    </div>
  );
}
