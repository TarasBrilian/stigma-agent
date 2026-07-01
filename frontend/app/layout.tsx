import type { Metadata } from "next";
import { Cinzel, Spectral } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";
import { Providers } from "./providers";
import { WalletButton } from "@/components/WalletButton";
import { StupaMark, TempleFret } from "@/components/ornaments";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});
const spectral = Spectral({
  variable: "--font-spectral",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stigma Agent",
  description: "AI-driven, goal-based crypto robo-advisor on Casper testnet.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${spectral.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <header className="border-b border-line/70 bg-panel/50 backdrop-blur-sm">
            <TempleFret className="block text-gold/55" height={10} />
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
              <Link href="/" className="group flex items-center gap-2.5">
                <StupaMark className="h-7 w-7 text-gold transition-transform duration-300 group-hover:-translate-y-0.5" />
                <span className="carved-title text-lg">
                  Stigma<span className="text-gold">Agent</span>
                </span>
              </Link>
              <nav className="flex items-center gap-5 text-sm">
                <Link
                  href="/dashboard"
                  className="text-[0.72rem] uppercase tracking-[0.14em] text-ink-soft transition-colors hover:text-gold"
                >
                  Dashboard
                </Link>
                <Link
                  href="/onboarding"
                  className="text-[0.72rem] uppercase tracking-[0.14em] text-ink-soft transition-colors hover:text-gold"
                >
                  Onboarding
                </Link>
                <Link
                  href="/faucet"
                  className="text-[0.72rem] uppercase tracking-[0.14em] text-ink-soft transition-colors hover:text-gold"
                >
                  Faucet
                </Link>
                <WalletButton />
              </nav>
            </div>
          </header>

          <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>

          <footer className="border-t border-line/70 bg-panel/40">
            {/* a row of full relief panels, side by side — a candi wall */}
            <div className="grid w-full grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Image
                  key={i}
                  src="/relic.jpeg"
                  alt={i === 0 ? "Borobudur-style temple wall relief panels" : ""}
                  width={1600}
                  height={643}
                  sizes="33vw"
                  className="relief-wall h-auto w-full"
                />
              ))}
            </div>
            <div className="mx-auto w-full max-w-5xl px-6 pb-8 pt-5 text-center">
              <p className="text-xs tracking-wide text-ink-faint">
                Stigma Agent · Casper testnet · all tradable assets are mocked.
              </p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
