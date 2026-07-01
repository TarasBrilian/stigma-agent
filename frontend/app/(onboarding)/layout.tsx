export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-xl">
      <div className="relief-panel rise p-6 sm:p-8">{children}</div>
    </section>
  );
}
