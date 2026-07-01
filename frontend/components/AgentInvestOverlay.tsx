"use client";

/**
 * Post-deposit "agent at work" overlay: visualizes the keeper investing the
 * user's deposit into their on-chain glide-path target, then reveals the result.
 * It TRIGGERS the real buy (api.investNow → the agent's executeBuy) and shows the
 * actual target proportions — nothing here is fabricated.
 *
 * Each active step shows a small, rotating "thinking" caption (a random pick from
 * a pool that cycles while the step runs) + an animated typing indicator, so the
 * copy feels alive and varies between runs rather than repeating one template.
 *
 * 🔴 golden rule #1: the buy amounts are the contract's deterministic glide-path
 * target, NOT an LLM number. This is a presentation of the real agent action; it
 * never feeds a displayed value into an executed one.
 */

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { ASSETS, ASSET_SYMBOLS } from "@/lib/constants";
import { bpsToPercent, formatUsd } from "@/lib/format";
import type { Allocation } from "@/lib/types";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type Phase = "reading" | "allocating" | "executing" | "done" | "empty" | "error";

const STEPS: { key: Phase; label: string }[] = [
  { key: "reading", label: "Reading your glide-path target" },
  { key: "allocating", label: "Allocating your deposit across assets" },
  { key: "executing", label: "Executing buys on-chain" },
];

const TITLE: Record<Phase, string> = {
  reading: "Agent at work",
  allocating: "Agent at work",
  executing: "Agent at work",
  done: "Deposit invested",
  empty: "Nothing to invest",
  error: "Investment failed",
};

/** Rotating "thinking" captions per step — picked at random so the wording varies
 *  between runs and while a step is active (not a single fixed template). */
const THINKING: Partial<Record<Phase, string[]>> = {
  reading: [
    "Reading your risk profile and time horizon…",
    "Checking how far you are from your goal year…",
    "Pulling your glide-path weights from the vault…",
    "Seeing where you sit on the de-risking curve…",
    "Reviewing your profile to set the target mix…",
  ],
  allocating: [
    "Came up with a strategy — drafting the allocation plan…",
    "Sizing each asset to its target weight…",
    "Balancing growth against your de-risking schedule…",
    "Mapping your deposit onto the target mix…",
    "Shaping the buy list to match your target…",
  ],
  executing: [
    "Buying assets one by one at the best price…",
    "Routing each leg through the swap router…",
    "Filling orders with a slippage cap on every leg…",
    "Confirming each swap on-chain…",
    "Settling the new holdings into your vault…",
  ],
};

export function AgentInvestOverlay({
  vaultHash,
  amountUsd6,
  onDone,
}: {
  vaultHash: string;
  amountUsd6: string;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("reading");
  const [target, setTarget] = useState<Allocation | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // guard React 18 StrictMode double-invoke
    started.current = true;
    void (async () => {
      try {
        const state = await api.getPortfolio(vaultHash);
        setTarget(state.currentTargetAllocation);
        await sleep(1600);

        setPhase("allocating");
        await sleep(1900);

        // The real deposit→buy: the keeper signs executeBuy; waits for finality.
        setPhase("executing");
        const res = await api.investNow(vaultHash);
        setReason(res.reason);
        setPhase(res.invested ? "done" : "empty");
      } catch (e) {
        setError(e instanceof Error ? e.message : "The agent could not invest.");
        setPhase("error");
      }
    })();
  }, [vaultHash]);

  // Rotate the active step's "thinking" caption: a fresh random line on entry and
  // every ~2.2s, avoiding an immediate repeat, so it reads as live analysis.
  useEffect(() => {
    const pool = THINKING[phase];
    if (!pool || pool.length === 0) return;
    let last = -1;
    const pick = (): string => {
      let i = Math.floor(Math.random() * pool.length);
      if (pool.length > 1 && i === last) i = (i + 1) % pool.length;
      last = i;
      return pool[i];
    };
    // setState only inside timer callbacks (never synchronously in the effect
    // body); a stale caption from the previous phase is never rendered because
    // captions show only under the `isActive` step.
    const first = setTimeout(() => setCaption(pick()), 0);
    const id = setInterval(() => setCaption(pick()), 2200);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [phase]);

  const rows = target
    ? ASSET_SYMBOLS.filter((s) => (target[s] ?? 0) > 0).map((s) => ({
        sym: s,
        label: ASSETS[s].label,
        color: ASSETS[s].color,
        pct: bpsToPercent(target[s] ?? 0),
      }))
    : [];

  const activeIdx = STEPS.findIndex((s) => s.key === phase);
  const terminal = phase === "done" || phase === "empty" || phase === "error";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.62)] p-4 backdrop-blur-sm">
      <div className="relief-panel w-full max-w-md p-6">
        <div className="flex items-center gap-2.5">
          <span
            className={`h-2.5 w-2.5 rounded-full bg-gold ${terminal ? "" : "animate-pulse"}`}
          />
          <h3 className="carved-title text-lg">{TITLE[phase]}</h3>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          Deposited {formatUsd(amountUsd6)} — investing it across your target
          allocation.
        </p>

        <ol className="mt-5 flex flex-col gap-3">
          {STEPS.map((step, i) => {
            const isDone = terminal || i < activeIdx;
            const isActive = !terminal && i === activeIdx;
            return (
              <li key={step.key} className="flex items-start gap-3 text-sm">
                <StepIcon done={isDone} active={isActive} />
                <span className="flex flex-col gap-0.5">
                  <span
                    className={isDone || isActive ? "text-ink" : "text-ink-faint"}
                  >
                    {step.label}
                  </span>
                  {isActive && caption && (
                    <span className="flex items-center gap-1.5 text-xs text-ink-faint">
                      <span>{caption}</span>
                      <ThinkingDots />
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>

        {rows.length > 0 && (
          <div className="mt-5 flex flex-col gap-2 border-t border-line/60 pt-4">
            <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">
              {phase === "done" ? "Invested to target" : "Target allocation"}
            </span>
            {rows.map((r) => (
              <div key={r.sym} className="flex items-center gap-3 text-sm">
                <span className="w-16 shrink-0 text-ink">{r.label}</span>
                <span className="relief-inset h-2 flex-1 overflow-hidden rounded-full">
                  <span
                    className="block h-full rounded-full transition-[width] duration-1000 ease-out"
                    style={{
                      width: phase === "reading" ? "0%" : `${r.pct}%`,
                      background: r.color,
                    }}
                  />
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-ink-soft">
                  {r.pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}

        {phase === "empty" && (
          <p className="mt-4 text-xs text-ink-faint">
            {reason || "Your deposit is already invested."}
          </p>
        )}
        {phase === "error" && error && (
          <p className="mt-4 text-xs text-terracotta">{error}</p>
        )}

        <button
          onClick={onDone}
          disabled={!terminal}
          className="btn-gold mt-6 w-full px-4 py-2 text-sm disabled:opacity-50"
        >
          {terminal ? "View portfolio" : "Working…"}
        </button>
      </div>
    </div>
  );
}

/** A small "typing" indicator: three dots blinking in sequence. */
function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 animate-pulse rounded-full bg-gold-deep/80"
          style={{ animationDelay: `${i * 220}ms` }}
        />
      ))}
    </span>
  );
}

function StepIcon({ done, active }: { done: boolean; active: boolean }) {
  if (done) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/20 text-xs text-gold">
        ✓
      </span>
    );
  }
  if (active) {
    return (
      <span className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
    );
  }
  return (
    <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-line/70" />
  );
}
