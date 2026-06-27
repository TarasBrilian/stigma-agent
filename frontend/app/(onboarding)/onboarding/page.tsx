import { QuestionnaireForm } from "@/components/QuestionnaireForm";

export default function OnboardingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Let&apos;s find your risk profile</h1>
        <p className="text-sm text-foreground/60">
          A few questions about your goals and timeline. The agent uses these to
          assign a profile and suggest starter portfolios — you can edit any
          suggestion before creating a vault.
        </p>
      </div>
      <QuestionnaireForm />
    </div>
  );
}
