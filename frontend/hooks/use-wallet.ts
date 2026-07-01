"use client";

/**
 * Wallet session state, backed by the Casper Wallet extension provider
 * (lib/casper.ts). Exposes connection state + connect/disconnect actions and
 * keeps the UI in sync with wallet events.
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  connectWallet,
  disconnectWallet,
  getActivePublicKey,
  subscribeWalletEvents,
} from "@/lib/casper";

export interface WalletState {
  publicKey: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync the active key on mount and on any wallet event (connect / disconnect /
  // active-key change / lock). The read is async so setState never fires
  // synchronously within the effect; an `active` guard drops a late resolve after
  // unmount.
  useEffect(() => {
    let active = true;
    const sync = async () => {
      try {
        const pk = await getActivePublicKey();
        if (active) setPublicKey(pk);
      } catch {
        if (active) setPublicKey(null);
      }
    };
    void sync();
    const unsubscribe = subscribeWalletEvents(() => void sync());
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      setPublicKey(await connectWallet());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await disconnectWallet();
    } finally {
      setPublicKey(null);
    }
  }, []);

  const value: WalletState = {
    publicKey,
    isConnected: publicKey !== null,
    isConnecting,
    error,
    connect,
    disconnect,
  };

  return createElement(WalletContext.Provider, { value }, children);
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}
