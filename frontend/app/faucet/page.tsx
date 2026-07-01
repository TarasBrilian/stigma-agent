import type { Metadata } from "next";
import { FaucetPanel } from "@/components/FaucetPanel";

export const metadata: Metadata = {
  title: "Faucet · Stigma Agent",
  description: "Claim test mUSDC on Casper testnet.",
};

export default function FaucetPage() {
  return <FaucetPanel />;
}
