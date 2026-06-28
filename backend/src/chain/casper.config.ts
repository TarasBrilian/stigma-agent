/**
 * Casper connection + deployed-contract config for the `chain` module ONLY.
 * Values come from env (sourced from `../../contract/deployed.casper-test.json`).
 * Hashes are public testnet package hashes; only `AGENT_SECRET_KEY_PATH` is secret.
 */
import { ASSET_SYMBOLS, type AssetSymbol } from '../config/constants';

/** env var name holding each token's package hash, in canonical asset order. */
const TOKEN_ENV: Record<AssetSymbol, string> = {
  mUSDC: 'TOKEN_MUSDC_HASH',
  mBTC: 'TOKEN_MBTC_HASH',
  mNVDAx: 'TOKEN_MNVDAX_HASH',
  mXAUT: 'TOKEN_MXAUT_HASH',
  mGOOGLx: 'TOKEN_MGOOGLX_HASH',
};

export interface CasperConfig {
  nodeUrl: string;
  network: string;
  oracleHash: string;
  routerHash: string;
  registryHash: string;
  tokenHashes: Record<AssetSymbol, string>;
  agentKeyPath: string;
}

export function loadCasperConfig(
  env: NodeJS.ProcessEnv = process.env,
): CasperConfig {
  const tokenHashes = {} as Record<AssetSymbol, string>;
  for (const sym of ASSET_SYMBOLS) tokenHashes[sym] = env[TOKEN_ENV[sym]] ?? '';
  return {
    nodeUrl: env.CASPER_NODE_URL ?? '',
    network: env.CASPER_NETWORK_NAME ?? 'casper-test',
    oracleHash: env.ORACLE_HASH ?? '',
    routerHash: env.ROUTER_HASH ?? '',
    registryHash: env.VAULT_REGISTRY_HASH ?? '',
    tokenHashes,
    agentKeyPath: env.AGENT_SECRET_KEY_PATH ?? '',
  };
}

/** Throw a clear, actionable error when a required value is missing at use time. */
export function requireValue(value: string, name: string): string {
  if (!value) {
    throw new Error(
      `${name} is not set — export it in backend/.env (see deployed.casper-test.json / .env.example)`,
    );
  }
  return value;
}
