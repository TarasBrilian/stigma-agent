/**
 * Ambient types for the Casper Wallet provider that the browser extension
 * injects globally. Per the official Casper Wallet SDK, there is no npm package
 * to install — the extension exposes `window.CasperWalletProvider` (a factory)
 * and `window.CasperWalletEventTypes`. This is why we do NOT depend on
 * CSPR.click (whose UI packages pin React 18 / casper-js-sdk v2 and conflict
 * with this project's React 19 + casper-js-sdk v5 stack).
 *
 * Docs: https://github.com/make-software/casper-wallet-sdk
 */

export interface CasperWalletSignatureResponse {
  /** true if the user cancelled the request in the extension. */
  cancelled: boolean;
  /** Signature bytes (present when not cancelled). */
  signatureHex?: string;
  signature?: Uint8Array;
}

export interface CasperWalletProviderInstance {
  /** Prompt the user to connect the site. Resolves true if connected. */
  requestConnection(): Promise<boolean>;
  /** Prompt to switch the active account. */
  requestSwitchAccount(): Promise<boolean>;
  /** Whether the site is currently connected. */
  isConnected(): Promise<boolean>;
  /** The active account public key (hex), or throws if not connected. */
  getActivePublicKey(): Promise<string>;
  /** Sign a deploy/transaction JSON string with the given signer public key. */
  sign(
    payloadJson: string,
    signingPublicKeyHex: string,
  ): Promise<CasperWalletSignatureResponse>;
  /** Sign an arbitrary message. */
  signMessage(
    message: string,
    signingPublicKeyHex: string,
  ): Promise<CasperWalletSignatureResponse>;
  /** Disconnect the site. */
  disconnectFromSite(): Promise<boolean>;
}

export type CasperWalletProviderFactory = (options?: {
  timeout?: number;
}) => CasperWalletProviderInstance;

export interface CasperWalletEventTypesMap {
  Connected: string;
  Disconnected: string;
  ActiveKeyChanged: string;
  Locked: string;
  Unlocked: string;
  TabChanged: string;
  ActiveKeySupportsChanged: string;
}

declare global {
  interface Window {
    CasperWalletProvider?: CasperWalletProviderFactory;
    CasperWalletEventTypes?: CasperWalletEventTypesMap;
  }
}

export {};
