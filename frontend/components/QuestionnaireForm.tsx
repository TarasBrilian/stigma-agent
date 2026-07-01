"use client";

/**
 * Minimal onboarding questionnaire. Collects risk answers + demographics and
 * submits to the backend, which calls the agent to assign a profile. The
 * profile shown here is the LLM's classification (a bucket) — the UI does not
 * compute it.
 */

import { useState } from "react";
import { api } from "@/lib/api";
import { useWallet } from "@/hooks/use-wallet";
import type { OnboardingResult } from "@/lib/types";
import { ProfileBadge } from "./ProfileBadge";

// TODO: replace with the versioned questionnaire fetched from the backend.
const QUESTIONS = [
  { id: "horizon", label: "How many years until you need this money?" },
  { id: "drawdown", label: "How would you react to a 20% drop in a year?" },
  { id: "goal", label: "What is this portfolio for?" },
] as const;

export function QuestionnaireForm() {
  const { publicKey, isConnected } = useWallet();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [age, setAge] = useState("");
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    return (
      <div className="flex flex-col gap-3">
        <h2 className="carved-title text-lg">Your profile</h2>
        <ProfileBadge profile={result.profile.profile} withBlurb />
        <p className="text-sm leading-relaxed text-ink-soft">{result.profile.reasoning}</p>
        <p className="text-sm text-ink-faint">
          {result.starters.length} starter portfolio(s) suggested — review and edit before creating.
        </p>
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
