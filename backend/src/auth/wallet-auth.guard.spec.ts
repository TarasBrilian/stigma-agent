import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { KeyAlgorithm, PrivateKey } from 'casper-js-sdk';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUTH_HEADERS,
  VaultOwnerGuard,
  WalletAuthGuard,
  authMessage,
} from './wallet-auth.guard';

/** A signer + the headers a wallet would send for a fresh timestamp. */
const signer = () => {
  const sk = PrivateKey.generate(KeyAlgorithm.ED25519);
  const pubKey = sk.publicKey.toHex();
  const sign = (ts: string): string =>
    Buffer.from(
      sk.signAndAddAlgorithmBytes(Buffer.from(authMessage(ts), 'utf8')),
    ).toString('hex');
  return { pubKey, sign };
};

const nowTs = (): string => String(Math.floor(Date.now() / 1000));

type Body = { owner?: string; vaultHash?: string };
const ctxOf = (headers: Record<string, string>, body: Body): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers, body }) }),
  }) as unknown as ExecutionContext;

const authHeaders = (pubKey: string, sig: string, ts: string) => ({
  [AUTH_HEADERS.pubKey]: pubKey,
  [AUTH_HEADERS.signature]: sig,
  [AUTH_HEADERS.timestamp]: ts,
});

const vaultGuard = (findUnique = jest.fn()): VaultOwnerGuard =>
  new VaultOwnerGuard({
    portfolioMeta: { findUnique },
  } as unknown as PrismaService);

const restoreAuthEnv = () => {
  const prev = process.env.AUTH_REQUIRED;
  return () => {
    if (prev === undefined) delete process.env.AUTH_REQUIRED;
    else process.env.AUTH_REQUIRED = prev;
  };
};

describe('WalletAuthGuard (owner in body — register/onboarding)', () => {
  const restore = restoreAuthEnv();
  afterEach(restore);

  it('is a no-op when AUTH_REQUIRED is not "true" (demo mode stays open)', () => {
    delete process.env.AUTH_REQUIRED;
    expect(new WalletAuthGuard().canActivate(ctxOf({}, {}))).toBe(true);
  });

  describe('when AUTH_REQUIRED=true', () => {
    beforeEach(() => {
      process.env.AUTH_REQUIRED = 'true';
    });

    it('allows a valid signature whose signer matches body.owner', () => {
      const { pubKey, sign } = signer();
      const ts = nowTs();
      const ctx = ctxOf(authHeaders(pubKey, sign(ts), ts), { owner: pubKey });
      expect(new WalletAuthGuard().canActivate(ctx)).toBe(true);
    });

    it('rejects missing auth headers (401)', () => {
      expect(() =>
        new WalletAuthGuard().canActivate(ctxOf({}, { owner: 'x' })),
      ).toThrow(UnauthorizedException);
    });

    it('rejects a stale timestamp (401)', () => {
      const { pubKey, sign } = signer();
      const old = String(Math.floor(Date.now() / 1000) - 10_000);
      const ctx = ctxOf(authHeaders(pubKey, sign(old), old), { owner: pubKey });
      expect(() => new WalletAuthGuard().canActivate(ctx)).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an invalid signature (401)', () => {
      const { pubKey, sign } = signer();
      const ts = nowTs();
      const wrongSig = sign(String(Number(ts) - 1)); // signed a different message
      const ctx = ctxOf(authHeaders(pubKey, wrongSig, ts), { owner: pubKey });
      expect(() => new WalletAuthGuard().canActivate(ctx)).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects when the signer does not control body.owner (403)', () => {
      const { pubKey, sign } = signer();
      const other = signer().pubKey;
      const ts = nowTs();
      const ctx = ctxOf(authHeaders(pubKey, sign(ts), ts), { owner: other });
      expect(() => new WalletAuthGuard().canActivate(ctx)).toThrow(
        ForbiddenException,
      );
    });
  });
});

describe('VaultOwnerGuard (owner from the vault — chat)', () => {
  const restore = restoreAuthEnv();
  afterEach(restore);

  it('is a no-op when AUTH_REQUIRED is not "true"', async () => {
    delete process.env.AUTH_REQUIRED;
    await expect(vaultGuard().canActivate(ctxOf({}, {}))).resolves.toBe(true);
  });

  describe('when AUTH_REQUIRED=true', () => {
    beforeEach(() => {
      process.env.AUTH_REQUIRED = 'true';
    });

    it('authorizes against the vault owner looked up by vaultHash', async () => {
      const { pubKey, sign } = signer();
      const ts = nowTs();
      const findUnique = jest
        .fn()
        .mockResolvedValue({ user: { walletAddress: pubKey } });
      const ctx = ctxOf(authHeaders(pubKey, sign(ts), ts), {
        vaultHash: 'hash-v',
      });
      await expect(vaultGuard(findUnique).canActivate(ctx)).resolves.toBe(true);
      expect(findUnique).toHaveBeenCalledWith({
        where: { vaultHash: 'hash-v' },
        include: { user: true },
      });
    });

    it('forbids when the vault (owner) is unknown (403)', async () => {
      const { pubKey, sign } = signer();
      const ts = nowTs();
      const ctx = ctxOf(authHeaders(pubKey, sign(ts), ts), {
        vaultHash: 'hash-missing',
      });
      await expect(
        vaultGuard(jest.fn().mockResolvedValue(null)).canActivate(ctx),
      ).rejects.toThrow(ForbiddenException);
    });

    // The bypass that the two-guard split closes: a valid signer must NOT be able
    // to reach another user's vault by putting their OWN owner in the body.
    it('IGNORES a body.owner — authorizes only against the stored vault owner (403)', async () => {
      const attacker = signer();
      const ts = nowTs();
      const victimVaultOwner = signer().pubKey;
      const findUnique = jest
        .fn()
        .mockResolvedValue({ user: { walletAddress: victimVaultOwner } });
      const ctx = ctxOf(authHeaders(attacker.pubKey, attacker.sign(ts), ts), {
        vaultHash: 'hash-victim',
        owner: attacker.pubKey, // attacker tries to assert their own owner
      });
      await expect(vaultGuard(findUnique).canActivate(ctx)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
