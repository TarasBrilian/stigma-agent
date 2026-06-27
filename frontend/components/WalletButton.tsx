"use client";

import { useWallet } from "@/hooks/use-wallet";
import { truncateHash } from "@/lib/format";

export function WalletButton() {
  const { isConnected, isConnecting, publicKey, connect, disconnect, error } =
    useWallet();

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-500">{error}</span>}
      {isConnected ? (
        <button
          onClick={() => void disconnect()}
          className="rounded-md border border-foreground/20 px-3 py-1.5 text-sm hover:bg-foreground/5"
          title={publicKey ?? undefined}
        >
          {truncateHash(publicKey ?? "")} · Disconnect
        </button>
      ) : (
        <button
          onClick={() => void connect()}
          disabled={isConnecting}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-50"
        >
          {isConnecting ? "Connecting…" : "Connect Wallet"}
        </button>
      )}
    </div>
  );
}
