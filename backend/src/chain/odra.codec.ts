/**
 * Pure Odra-on-Casper storage codec: how to address and decode `Var`/`Mapping`
 * state items off-chain. Grounded in Odra 2.8.2 source (verified against the live
 * testnet oracle). No NestJS deps; unit-tested in `odra.codec.spec.ts`.
 *
 * Storage model (Odra 2.8.2):
 *  - Every `Var`/`Mapping` lives in ONE Casper dictionary named "state".
 *  - The dictionary item key = lowercase_hex( blake2b256( index_bytes ++ bytesrepr(mapKey?) ) ).
 *  - `index_bytes` = u32 big-endian of the field's 1-based declaration index
 *    (legacy regime, valid while every index ≤ 15 — true for all our contracts).
 *  - Stored VALUE is double-wrapped: a `CLValue` of type `List(U8)` whose payload
 *    is the raw `bytesrepr(T)` of the field. So unwrap = drop the 4-byte little-
 *    endian length prefix of the List, then read T with the cursor below.
 *  - CEP-18 (`balances`/`allowances`) is the exception: its own named dictionaries
 *    hold NATIVE CLValues (no List(U8) wrap); item key is base64(bytesrepr(key)).
 */
import { byteHash } from 'casper-js-sdk';
import { type Profile } from '../config/constants';

export const STATE_DICT = 'state';

/* --------------------------- item-key derivation --------------------------- */

/** u32 big-endian of a single-field path index (legacy regime, index ≤ 15). */
function pathBytes(fieldIndex: number): Uint8Array {
  return Uint8Array.from([
    (fieldIndex >>> 24) & 0xff,
    (fieldIndex >>> 16) & 0xff,
    (fieldIndex >>> 8) & 0xff,
    fieldIndex & 0xff,
  ]);
}

const toHex = (u8: Uint8Array): string => Buffer.from(u8).toString('hex');

/** "state" dictionary item key for a `Var<T>` at the given field index. */
export function varItemKey(fieldIndex: number): string {
  return toHex(byteHash(pathBytes(fieldIndex)));
}

/** "state" dictionary item key for a `Mapping<K,V>[key]` at the given field index. */
export function mappingItemKey(
  fieldIndex: number,
  mapKeyBytes: Uint8Array,
): string {
  const preimage = Buffer.concat([
    Buffer.from(pathBytes(fieldIndex)),
    Buffer.from(mapKeyBytes),
  ]);
  return toHex(byteHash(Uint8Array.from(preimage)));
}

/** CEP-18 named dictionary (`balances`/`allowances`) item key = base64(bytesrepr(key)). */
export function cep18ItemKey(keyBytes: Uint8Array): string {
  return Buffer.from(keyBytes).toString('base64');
}

/* ----------------------------- key (Address) bytes ------------------------- */

/** `bytesrepr(Address::Contract)` = Key::Hash = tag 0x01 ++ 32-byte hash.
 *  Accepts a `hash-…` / `contract-…` prefixed string or raw hex. */
export function contractKeyBytes(hash: string): Uint8Array {
  const hex = hash.replace(/^(hash-|contract-)/, '');
  return Uint8Array.from([0x01, ...Buffer.from(hex, 'hex')]);
}

/** `bytesrepr(Address::Account)` = Key::Account = tag 0x00 ++ 32-byte hash. */
export function accountKeyBytes(accountHash: string): Uint8Array {
  const hex = accountHash.replace(/^account-hash-/, '');
  return Uint8Array.from([0x00, ...Buffer.from(hex, 'hex')]);
}

/* ------------------------------ value decoding ----------------------------- */

/** Strip the `List(U8)` 4-byte LE length prefix to get raw `bytesrepr(T)`. */
export function unwrapStateBytes(listU8Bytes: Uint8Array): Uint8Array {
  return listU8Bytes.subarray(4);
}

/** A minimal little-endian `bytesrepr` reader for the Casper types we store. */
export class ByteReader {
  private off = 0;
  constructor(private readonly b: Uint8Array) {}

  remaining(): number {
    return this.b.length - this.off;
  }

  u8(): number {
    return this.b[this.off++];
  }

  u32(): number {
    const v =
      this.b[this.off] +
      this.b[this.off + 1] * 0x100 +
      this.b[this.off + 2] * 0x10000 +
      this.b[this.off + 3] * 0x1000000;
    this.off += 4;
    return v;
  }

  /** Casper U256/U512: [u8 n][n little-endian bytes], minimal length. */
  u256(): bigint {
    const n = this.u8();
    let v = 0n;
    for (let i = 0; i < n; i++)
      v += BigInt(this.b[this.off + i]) << (8n * BigInt(i));
    this.off += n;
    return v;
  }

  /** Casper `Key`/Address: [tag][32 bytes] → prefixed string. */
  address(): string {
    const tag = this.u8();
    const hex = Buffer.from(this.b.subarray(this.off, this.off + 32)).toString(
      'hex',
    );
    this.off += 32;
    return tag === 0x00 ? `account-hash-${hex}` : `hash-${hex}`;
  }

  vecU32(): number[] {
    const n = this.u32();
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(this.u32());
    return out;
  }

  vecAddress(): string[] {
    const n = this.u32();
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(this.address());
    return out;
  }

  /** `#[odra::odra_type]` unit enum → single u8 tag (declaration order). */
  profile(): Profile {
    const tag = this.u8();
    const p = (['Conservative', 'Moderate', 'Aggressive'] as const)[tag];
    if (!p) throw new Error(`unknown Profile tag ${tag}`);
    return p;
  }
}

/* -------------------- single-value convenience decoders -------------------- */
// Each takes the unwrapped `bytesrepr(T)` and returns a JS value.

export const decodeU256 = (b: Uint8Array): bigint => new ByteReader(b).u256();
export const decodeU32 = (b: Uint8Array): number => new ByteReader(b).u32();
export const decodeAddress = (b: Uint8Array): string =>
  new ByteReader(b).address();
export const decodeVecU32 = (b: Uint8Array): number[] =>
  new ByteReader(b).vecU32();
export const decodeProfile = (b: Uint8Array): Profile =>
  new ByteReader(b).profile();
