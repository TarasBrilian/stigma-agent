"use client";

import { useWallet } from "@/hooks/use-wallet";
import { truncateHash } from "@/lib/format";

export function WalletButton() {
  const { isConnected, isConnecting, publicKey, connect, disconnect, error } =
    useWallet();

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-terracotta">{error}</span>}
      {isConnected ? (
        <button
          onClick={() => void disconnect()}
          className="btn-ghost px-3 py-1.5 font-mono text-sm"
          title={publicKey ?? undefined}
        >
          {truncateHash(publicKey ?? "")} · Disconnect
        </button>
      ) : (
        <button
          onClick={() => void connect()}
          disabled={isConnecting}
          className="btn-gold px-3 py-1.5 text-sm"
        >
          {isConnecting ? "Connecting…" : "Connect Wallet"}
        </button>
      )}
    </div>
  );
}
