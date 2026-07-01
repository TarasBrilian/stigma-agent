import Link from "next/link";
import Image from "next/image";
import { TempleFret } from "@/components/ornaments";

const STEPS = [
  {
    n: "I",
    title: "Set your goal",
    body: "Answer a few questions. The agent assigns a risk profile and a starter allocation you can review and edit.",
  },
  {
    n: "II",
    title: "The agent invests",
    body: "It funds a glide-path portfolio and rebalances on drift — every amount derived on-chain, never by the LLM.",
  },
  {
    n: "III",
    title: "You keep custody",
    body: "The agent can only buy and rebalance. It can never withdraw your funds — that is enforced by the vault.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-16 pb-4 sm:gap-24">
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
            <div className="relic-niche">
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
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="flex flex-col items-center gap-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <TempleFret className="w-36 text-gold/50" height={10} />
          <h2 className="carved-title text-2xl sm:text-3xl">How it works</h2>
          <p className="max-w-md text-sm text-ink-soft">
            Three steps from a goal to an agent-run portfolio — with money math
            kept deterministic and on-chain.
          </p>
        </div>

        <ol className="grid w-full gap-5 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="relief-panel flex flex-col items-center p-6 text-center">
              <span className="chip chip-gold carved-title flex h-11 w-11 items-center justify-center rounded-full text-sm">
                {s.n}
              </span>
              <h3 className="carved-title mt-4 text-lg">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.body}</p>
            </li>
          ))}
        </ol>

        <Link href="/onboarding" className="btn-gold px-6 py-3 text-sm">
          Begin onboarding
        </Link>
      </section>
    </div>
  );
}
