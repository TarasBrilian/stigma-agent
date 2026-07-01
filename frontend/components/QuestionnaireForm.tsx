"use client";

/**
 * Minimal onboarding questionnaire. Collects risk answers + demographics and
 * submits to the backend, which calls the agent to assign a profile. The
 * profile shown here is the LLM's classification (a bucket) — the UI does not
 * compute it.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  buildCreateVaultDeploy,
  confirmTransaction,
  resolveVaultHash,
  signTransactionWithWallet,
  submitTransaction,
} from "@/lib/casper";
import { ASSETS, ASSET_SYMBOLS } from "@/lib/constants";
import { formatBps, formatUsd } from "@/lib/format";
import { useWallet } from "@/hooks/use-wallet";
import type { OnboardingResult, StarterPortfolio } from "@/lib/types";
import { ProfileBadge } from "./ProfileBadge";

// TODO: replace with the versioned questionnaire fetched from the backend.
const QUESTIONS = [
  { id: "horizon", label: "How many years until you need this money?" },
  { id: "drawdown", label: "How would you react to a 20% drop in a year?" },
  { id: "goal", label: "What is this portfolio for?" },
] as const;

export function QuestionnaireForm() {
  const { publicKey, isConnected } = useWallet();
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [age, setAge] = useState("");
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [creating, setCreating] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  /**
   * ADR 0001 create-vault flow: the user signs the `Vault.wasm` module-bytes deploy
   * (becoming deployer + owner), then reports the new address to the backend, which
   * performs the on-chain `VaultRegistry.register` + the off-chain mirror. The UI
   * never signs register; allocation is validated on-chain (the UI only passes bps).
   */
  const createVault = async (starter: StarterPortfolio) => {
    if (!publicKey) {
      setCreateError("Connect your wallet first.");
      return;
    }
    setCreateError(null);
    try {
      setCreating("Building the vault deploy…");
      const { transaction, packageHashKeyName } = await buildCreateVaultDeploy(publicKey, {
        profile: starter.profile,
        baseAllocation: starter.allocation,
        targetAmountUsd: starter.targetAmountUsd,
        targetYear: starter.targetYear,
      });

      setCreating("Sign the vault deploy in your wallet…");
      const signed = await signTransactionWithWallet(transaction, publicKey);
      await submitTransaction(signed);

      setCreating("Deploying on-chain (~8s)…");
      await confirmTransaction(signed);

      setCreating("Registering your vault…");
      const vaultHash = await resolveVaultHash(publicKey, packageHashKeyName);
      await api.register({
        vaultHash,
        owner: publicKey,
        name: starter.name,
        profile: starter.profile,
        baseAllocation: starter.allocation,
        targetAmountUsd: starter.targetAmountUsd,
        targetYear: starter.targetYear,
      });

      router.push(`/portfolio/${encodeURIComponent(vaultHash)}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Vault creation failed.");
      setCreating(null);
    }
  };

  const submit = async () => {
    if (!publicKey) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.submitOnboarding({
        owner: publicKey,
        answers: QUESTIONS.map((q) => ({ questionId: q.id, value: answers[q.id] ?? "" })),
        demographics: { age: Number(age) || 0 },
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    const starters = result.starters;
    const starter = starters[selected] ?? starters[0];
    return (
      <div className="flex flex-col gap-4">
        <h2 className="carved-title text-lg">Your profile</h2>
        <ProfileBadge profile={result.profile.profile} withBlurb />
        <p className="text-sm leading-relaxed text-ink-soft">{result.profile.reasoning}</p>

        {!starter ? (
          <p className="text-sm text-ink-faint">No starter portfolios were suggested.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {starters.length > 1 && (
              <select
                value={selected}
                onChange={(e) => setSelected(Number(e.target.value))}
                disabled={creating !== null}
                className="field px-2 py-1.5 text-sm"
              >
                {starters.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            <div className="relief-inset flex flex-col gap-2 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-ink">{starter.name}</span>
                <span className="text-xs text-ink-faint">
                  Goal {formatUsd(starter.targetAmountUsd)} by {starter.targetYear}
                </span>
              </div>
              {starter.rationale && (
                <p className="text-xs leading-relaxed text-ink-soft">{starter.rationale}</p>
              )}
              <ul className="flex flex-col gap-0.5 text-xs text-ink-soft">
                {ASSET_SYMBOLS.filter((sym) => (starter.allocation[sym] ?? 0) > 0).map((sym) => (
                  <li key={sym} className="flex justify-between">
                    <span>{ASSETS[sym].label}</span>
                    <span className="font-mono">{formatBps(starter.allocation[sym] ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => void createVault(starter)}
              disabled={!isConnected || creating !== null}
              className="btn-gold px-4 py-2.5 text-sm"
            >
              {!isConnected
                ? "Connect wallet to create"
                : creating
                  ? "Working…"
                  : "Create this vault"}
            </button>
            {creating && <p className="text-xs text-gold-deep">{creating}</p>}
            {createError && <p className="text-xs text-terracotta">{createError}</p>}
            <p className="text-xs text-ink-faint">
              You sign one Vault deploy; the backend registers it. Allocation is validated on-chain.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {QUESTIONS.map((q) => (
        <label key={q.id} className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-soft">{q.label}</span>
          <input
            value={answers[q.id] ?? ""}
            onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            className="field px-3 py-2 text-sm"
          />
        </label>
      ))}
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-soft">Your age</span>
        <input
          value={age}
          onChange={(e) => setAge(e.target.value)}
          inputMode="numeric"
          className="field px-3 py-2 text-sm"
        />
      </label>
      {error && <p className="text-sm text-terracotta">{error}</p>}
      <button
        onClick={submit}
        disabled={!isConnected || submitting}
        className="btn-gold mt-1 px-4 py-2.5 text-sm"
      >
        {!isConnected ? "Connect wallet to continue" : submitting ? "Submitting…" : "Get my profile"}
      </button>
    </div>
  );
}
