/**
 * Landing-page visuals (Borobudur / carved-sandstone theme).
 *
 * Pure presentational server components — no state, no client JS, no data
 * fetching. They illustrate the product's mechanics (the on-chain glide-path,
 * the owner/agent security boundary, the three-layer architecture, and the
 * competitive positioning) for an investor / general audience.
 *
 * The glide-path figures mirror the *Moderate* profile in
 * `../../contract/ARCHITECTURE.md` §5 and use the linear interpolation the
 * contract computes on-chain. Colors come from `lib/constants` so they match
 * the in-app allocation charts.
 */

import { ASSETS } from "@/lib/constants";
import type { AssetSymbol } from "@/lib/types";
import { Lozenge } from "@/components/ornaments";
import { Reveal } from "@/components/Reveal";

/* ─────────────────────────────────────────────────────────────────────────
   Glide-path stacked area — how the on-chain target de-risks over time.
   Moderate profile: growth-tilted today → gold + stablecoin at the goal.
   ───────────────────────────────────────────────────────────────────────── */

type Bps = Partial<Record<AssetSymbol, number>>;

const GLIDE_START: Bps = { mBTC: 2000, mNVDAx: 3000, mGOOGLx: 1000, mXAUT: 4000, mUSDC: 0 };
const GLIDE_END: Bps = { mBTC: 0, mNVDAx: 0, mGOOGLx: 0, mXAUT: 5000, mUSDC: 5000 };
// stacked bottom → top (growth assets at the base, safety at the crown)
const STACK: AssetSymbol[] = ["mBTC", "mNVDAx", "mGOOGLx", "mXAUT", "mUSDC"];

// plot geometry (viewBox units)
const VB_W = 720;
const VB_H = 250;
const X0 = 52;
const X1 = 684;
const Y0 = 20;
const Y1 = 200;

const xFor = (p: number) => X0 + p * (X1 - X0);
const yFor = (pct: number) => Y1 - (pct / 100) * (Y1 - Y0);

/** Linear glide (contract §5): weight% at progress p (0 = today, 1 = goal year). */
function weightPct(a: AssetSymbol, p: number): number {
  const s = GLIDE_START[a] ?? 0;
  const e = GLIDE_END[a] ?? 0;
  return (s + p * (e - s)) / 100;
}

export function GlidePathFigure() {
  const P = [0, 1]; // linear on-chain → two exact samples define each band

  const bands = STACK.map((asset) => {
    const pts = P.map((p) => {
      let lower = 0;
      for (const a of STACK) {
        const w = weightPct(a, p);
        if (a === asset) {
          return { x: xFor(p), yLo: yFor(lower), yHi: yFor(lower + w) };
        }
        lower += w;
      }
      return { x: xFor(p), yLo: yFor(lower), yHi: yFor(lower) };
    });
    const top = pts.map((q) => `${q.x},${q.yHi}`).join(" ");
    const bot = [...pts].reverse().map((q) => `${q.x},${q.yLo}`).join(" ");
    return { asset, points: `${top} ${bot}` };
  });

  return (
    <div className="relief-inset flex flex-col gap-4 p-4 sm:p-6">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Stacked area chart: the Moderate portfolio's on-chain target allocation shifting from growth assets today to gold and stablecoin at the goal year."
      >
        {/* gridlines at 0 / 50 / 100% */}
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line
              x1={X0}
              x2={X1}
              y1={yFor(g)}
              y2={yFor(g)}
              stroke="currentColor"
              className="text-line"
              strokeWidth={0.75}
              strokeDasharray={g === 0 ? "0" : "3 4"}
              opacity={0.7}
            />
            <text
              x={X0 - 8}
              y={yFor(g) + 3}
              textAnchor="end"
              className="fill-ink-faint"
              style={{ fontSize: 10 }}
            >
              {g}%
            </text>
          </g>
        ))}

        {/* stacked bands */}
        {bands.map((b) => (
          <polygon
            key={b.asset}
            points={b.points}
            fill={ASSETS[b.asset].color}
            stroke="var(--panel)"
            strokeWidth={0.75}
            opacity={0.9}
          />
        ))}

        {/* x-axis endpoints */}
        <text
          x={X0}
          y={Y1 + 24}
          textAnchor="start"
          className="fill-ink-soft"
          style={{ fontSize: 11, letterSpacing: "0.06em" }}
        >
          TODAY · far from goal
        </text>
        <text
          x={X1}
          y={Y1 + 24}
          textAnchor="end"
          className="fill-ink-soft"
          style={{ fontSize: 11, letterSpacing: "0.06em" }}
        >
          GOAL YEAR
        </text>
      </svg>

      {/* legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {STACK.map((a) => (
          <span key={a} className="flex items-center gap-1.5 text-xs text-ink-soft">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: ASSETS[a].color }}
            />
            {ASSETS[a].label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Security boundary — the owner / agent split that defines the trust model.
   ───────────────────────────────────────────────────────────────────────── */

const OWNER_CAN = [
  "Deposit & withdraw, anytime",
  "Edit the goal & allocation",
  "Sign every fund-moving action",
];
const AGENT_CAN = ["Buy assets with idle funds", "Rebalance back to the target"];
const AGENT_CANNOT = [
  "Withdraw or move funds out",
  "Send funds to any other address",
  "Set the allocation or prices freely",
];

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <path
        d="M3 8.5l3.2 3.2L13 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Cross() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <path
        d="M4 4l8 8M12 4l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SecurityBoundary() {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* You (owner) */}
      <Reveal className="relief-panel flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h3 className="carved-title text-lg">You — the owner</h3>
          <span className="chip chip-patina px-2.5 py-0.5 text-[11px]">Custody</span>
        </div>
        <ul className="flex flex-col gap-2.5">
          {OWNER_CAN.map((t) => (
            <li key={t} className="flex items-start gap-2.5 text-sm text-ink">
              <span className="mt-0.5 text-patina">
                <Check />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </Reveal>

      {/* The agent */}
      <Reveal delay={130} className="relief-panel flex flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h3 className="carved-title text-lg">The agent</h3>
          <span className="chip chip-gold px-2.5 py-0.5 text-[11px]">Trigger-only</span>
        </div>
        <ul className="flex flex-col gap-2.5">
          {AGENT_CAN.map((t) => (
            <li key={t} className="flex items-start gap-2.5 text-sm text-ink">
              <span className="mt-0.5 text-patina">
                <Check />
              </span>
              {t}
            </li>
          ))}
          {AGENT_CANNOT.map((t) => (
            <li key={t} className="flex items-start gap-2.5 text-sm text-ink-soft">
              <span className="mt-0.5 text-terracotta">
                <Cross />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </Reveal>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Architecture — three layers, and the one hard boundary (the agent key).
   ───────────────────────────────────────────────────────────────────────── */

const LAYERS = [
  {
    tag: "Frontend",
    title: "You sign, in your wallet",
    body: "Onboarding, dashboard, and Casper Wallet. Every fund-moving deploy is signed by you — the app holds no keys and does no money math.",
    accent: "gold",
  },
  {
    tag: "Backend · agent + keeper",
    title: "Advises & triggers — never custodies",
    body: "An LLM profiles your goal and writes plain-language rationale; autonomous keeper loops watch prices and drift, then trigger the on-chain agent key. That key can only buy & rebalance.",
    accent: "patina",
  },
  {
    tag: "Casper contracts · Odra",
    title: "The source of truth",
    body: "The vault holds funds and computes the glide-path target and every swap amount on-chain. Access control is enforced here — not by the server, and never by the model.",
    accent: "stone",
  },
] as const;

export function ArchitectureStack() {
  return (
    <div className="flex flex-col gap-3">
      {LAYERS.map((l, i) => (
        <Reveal as="div" key={l.tag} delay={i * 120} className="relative">
          <div className="relief-panel hover-relief flex flex-col gap-1.5 p-5 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex shrink-0 items-center gap-3 sm:w-56">
              <span
                className={`chip chip-${l.accent} h-7 w-7 items-center justify-center rounded-full text-xs`}
              >
                {i + 1}
              </span>
              <span className="section-title !text-[0.68rem]">{l.tag}</span>
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="carved-title text-base">{l.title}</h3>
              <p className="text-sm leading-relaxed text-ink-soft">{l.body}</p>
            </div>
          </div>
          {i < LAYERS.length - 1 && (
            <div className="flex justify-center py-1 text-gold/60" aria-hidden="true">
              <Lozenge className="h-2.5 w-2.5" />
            </div>
          )}
        </Reveal>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Competitor comparison.
   ───────────────────────────────────────────────────────────────────────── */

const COMPARE_COLS = ["Stigma Agent", "Robo-advisors", "DeFi yield vaults", "AI trading bots"];
const COMPARE_ROWS: { feature: string; cells: string[] }[] = [
  {
    feature: "Custody of funds",
    cells: ["You — non-custodial, on-chain", "Provider holds your money", "Strategy contract", "Often custodial / API keys"],
  },
  {
    feature: "Goal-based glide-path",
    cells: ["Target amount + year, auto de-risks", "Yes", "No — yield only", "No — signals & trades"],
  },
  {
    feature: "Who moves your money",
    cells: ["On-chain math; agent only triggers", "The provider", "The strategy", "The model / bot"],
  },
  {
    feature: "Does an LLM trade?",
    cells: ["Never — it only advises & explains", "No", "No", "Yes — the model decides"],
  },
  {
    feature: "Transparency",
    cells: ["Fully on-chain & auditable", "Opaque", "On-chain", "Mostly opaque"],
  },
  {
    feature: "Fee model",
    cells: ["Per-action micro-fee (x402)", "~0.25%/yr on assets", "Performance fee", "Monthly subscription"],
  },
];

export function ComparisonTable() {
  return (
    <div className="relief-panel overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line/70">
            <th className="p-4 font-normal" />
            {COMPARE_COLS.map((c, i) => (
              <th
                key={c}
                className={`whitespace-nowrap p-4 align-bottom ${
                  i === 0
                    ? "carved-title text-gold-deep"
                    : "text-[0.7rem] uppercase tracking-[0.12em] text-ink-faint"
                }`}
              >
                {c}
                {i === 0 && (
                  <span className="ml-1.5 align-middle text-[0.6rem] text-gold">◆</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARE_ROWS.map((row) => (
            <tr key={row.feature} className="border-b border-line/40 last:border-0">
              <th
                scope="row"
                className="whitespace-nowrap p-4 text-[0.7rem] font-normal uppercase tracking-[0.1em] text-ink-soft"
              >
                {row.feature}
              </th>
              {row.cells.map((cell, i) => (
                <td
                  key={i}
                  className={`p-4 align-top ${
                    i === 0
                      ? "bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] font-medium text-ink"
                      : "text-ink-soft"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
