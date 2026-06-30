/**
 * Guards the read error-handling boundary: a genuinely-missing dictionary item
 * (Casper -32003) must read as "unset" (→ 0), but a network/other failure must
 * NOT be masked as zero. Messages below are the exact strings the live testnet
 * node returns (captured during implementation).
 */
import { accountKey, isValueNotFound } from './chain.service';

describe('accountKey (owner → account-hash Address for register)', () => {
  // Public test vector: the deployer's secp256k1 public key and its account hash
  // (the smoke vault's on-chain owner). Public values — safe to commit.
  const PUB =
    '0202cfa0520ed00484661ef05abe0a84aa88735f9d0d279ed0b2441f855a95de8d05';
  const ACC =
    'account-hash-b9f3740ef94e78a56f86fa795a6fd136f432164e3c1915284bc2636b7cf933b8';

  it('derives the matching account-hash from a raw public-key hex', () => {
    expect(accountKey(PUB).toString()).toBe(ACC);
  });

  it('passes an already-formatted account-hash through unchanged', () => {
    expect(accountKey(ACC).toString()).toBe(ACC);
  });
});

describe('isValueNotFound', () => {
  it('treats Casper -32003 (missing dictionary item) as not-found', () => {
    expect(isValueNotFound(new Error('Code: -32003, err: Query failed'))).toBe(
      true,
    );
  });

  it('does NOT mask network failures', () => {
    expect(
      isValueNotFound(
        new Error('failed to send http request, details: Network Error'),
      ),
    ).toBe(false);
  });

  it('does NOT mask other RPC errors', () => {
    expect(
      isValueNotFound(new Error('Code: -32602, err: Invalid params')),
    ).toBe(false);
  });

  it('handles non-Error values without throwing', () => {
    expect(isValueNotFound('boom')).toBe(false);
    expect(isValueNotFound(undefined)).toBe(false);
  });
});
