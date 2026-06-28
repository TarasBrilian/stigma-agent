/**
 * Guards the read error-handling boundary: a genuinely-missing dictionary item
 * (Casper -32003) must read as "unset" (→ 0), but a network/other failure must
 * NOT be masked as zero. Messages below are the exact strings the live testnet
 * node returns (captured during implementation).
 */
import { isValueNotFound } from './chain.service';

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
