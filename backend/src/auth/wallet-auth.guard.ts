import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PublicKey } from 'casper-js-sdk';
import { PrismaService } from '../prisma/prisma.service';

/** Headers carrying the Casper wallet auth proof. */
export const AUTH_HEADERS = {
  pubKey: 'x-casper-public-key',
  signature: 'x-casper-signature',
  timestamp: 'x-casper-timestamp',
} as const;

/** Max clock skew (seconds) tolerated on the signed timestamp — the replay window. */
const MAX_SKEW_SEC = Number(process.env.AUTH_MAX_SKEW_SEC ?? 300);

/** The canonical message the wallet signs: just a fresh unix-seconds timestamp. */
export function authMessage(timestamp: string): string {
  return `stigma-auth:${timestamp}`;
}

interface AuthedRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: { owner?: unknown; vaultHash?: unknown };
  walletPublicKey?: string;
}

/** Auth is enforced only when explicitly enabled (demo mode is open by default). */
function authEnabled(): boolean {
  return process.env.AUTH_REQUIRED === 'true';
}

/**
 * AUTHENTICATION (shared): prove the caller holds the private key for the public
 * key in `x-casper-public-key` by verifying a fresh-timestamp signature. Returns
 * the caller's public-key hex (the "principal"), or throws Unauthorized. Does NOT
 * authorize against any resource — that is each guard's job.
 */
function authenticate(req: AuthedRequest): string {
  const pubKey = readHeader(req, AUTH_HEADERS.pubKey);
  const sigHex = readHeader(req, AUTH_HEADERS.signature);
  const ts = readHeader(req, AUTH_HEADERS.timestamp);
  if (!pubKey || !sigHex || !ts) {
    throw new UnauthorizedException(
      `missing auth headers (${AUTH_HEADERS.pubKey}, ${AUTH_HEADERS.signature}, ${AUTH_HEADERS.timestamp})`,
    );
  }
  const tsNum = Number(ts);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > MAX_SKEW_SEC) {
    throw new UnauthorizedException('auth timestamp missing or stale');
  }
  if (!verifyCasperSignature(pubKey, sigHex, authMessage(ts))) {
    throw new UnauthorizedException('invalid wallet signature');
  }
  return pubKey;
}

/**
 * Wallet-signature auth for endpoints that name the `owner` directly in the body
 * (register, onboarding). FEATURE-FLAGGED — a no-op unless `AUTH_REQUIRED=true`,
 * so the demo works until the frontend signs. When enabled it verifies the
 * signature and requires the signer to BE `body.owner` (CLAUDE.md: a caller may
 * only act for the owner they control). Never touches the agent key (#4/#8).
 */
@Injectable()
export class WalletAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    if (!authEnabled()) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const principal = authenticate(req);
    const owner = typeof req.body?.owner === 'string' ? req.body.owner : '';
    if (!owner) {
      throw new ForbiddenException('request is missing an owner');
    }
    if (!sameKey(owner, principal)) {
      throw new ForbiddenException('signer does not control this owner');
    }
    req.walletPublicKey = principal;
    return true;
  }
}

/**
 * Wallet-signature auth for endpoints keyed by `vaultHash` (chat). Authorizes the
 * signer against the vault's STORED owner (mirror lookup) — it deliberately does
 * NOT trust a `body.owner`, so a caller can't read another user's vault by adding
 * their own `owner` to the body. Feature-flagged like WalletAuthGuard.
 */
@Injectable()
export class VaultOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!authEnabled()) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const principal = authenticate(req);
    const vaultHash =
      typeof req.body?.vaultHash === 'string' ? req.body.vaultHash : '';
    if (!vaultHash) {
      throw new ForbiddenException('request is missing a vaultHash');
    }
    const meta = await this.prisma.portfolioMeta.findUnique({
      where: { vaultHash },
      include: { user: true },
    });
    const owner = meta?.user.walletAddress;
    if (!owner) {
      throw new ForbiddenException('unknown vault');
    }
    if (!sameKey(owner, principal)) {
      throw new ForbiddenException('signer does not control this vault');
    }
    req.walletPublicKey = principal;
    return true;
  }
}

function readHeader(req: AuthedRequest, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/** Verify a Casper signature; returns false (never throws) on any failure. */
export function verifyCasperSignature(
  pubKeyHex: string,
  sigHex: string,
  message: string,
): boolean {
  try {
    const pk = PublicKey.fromHex(pubKeyHex);
    const sig = Uint8Array.from(Buffer.from(strip0x(sigHex), 'hex'));
    const msg = Uint8Array.from(Buffer.from(message, 'utf8'));
    return pk.verifySignature(msg, sig);
  } catch {
    return false;
  }
}

function strip0x(hex: string): string {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

/** Two Casper public-key hexes refer to the same key (checksum-case-insensitive). */
function sameKey(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
