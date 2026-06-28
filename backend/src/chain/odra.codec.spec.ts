/**
 * Pins the Odra storage codec. The mUSDC item key and the U256 decode below were
 * VERIFIED against the live casper-test oracle (PriceOracle.prices[mUSDC] = $1),
 * so these tests lock the blake2b derivation + bytesrepr decoding in place.
 */
import {
  ByteReader,
  cep18ItemKey,
  contractKeyBytes,
  decodeProfile,
  decodeU256,
  decodeVecU32,
  mappingItemKey,
  unwrapStateBytes,
  varItemKey,
} from './odra.codec';

const MUSDC =
  '4847bc198c6641daf3c8ac40211a8180800d630fb756ab7911ffc0eb81310a9b';
const fromHex = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));

describe('odra.codec item-key derivation', () => {
  it('contractKeyBytes prepends the Key::Hash tag (33 bytes)', () => {
    const k = contractKeyBytes(`hash-${MUSDC}`);
    expect(k.length).toBe(33);
    expect(k[0]).toBe(0x01);
    expect(Buffer.from(k.subarray(1)).toString('hex')).toBe(MUSDC);
  });

  it('mappingItemKey matches the live-verified mUSDC price key', () => {
    // PriceOracle.prices is field #2; verified item key on testnet.
    const key = mappingItemKey(2, contractKeyBytes(MUSDC));
    expect(key).toBe(
      'e3012d9f9b3a403ee45c94d4794831d17163ebef016df2d95277fd5400691e9d',
    );
  });

  it('varItemKey is the empty-mapKey case of mappingItemKey', () => {
    expect(varItemKey(1)).toBe(mappingItemKey(1, new Uint8Array(0)));
  });
});

describe('odra.codec value decoding', () => {
  it('unwraps List(U8) and decodes the live mUSDC price ($1, 6dp)', () => {
    // Raw CLValue bytes from testnet: [u32 len=4]["0340420f"] = U256(1_000_000).
    const full = fromHex('040000000340420f');
    const inner = unwrapStateBytes(full);
    expect(Buffer.from(inner).toString('hex')).toBe('0340420f');
    expect(decodeU256(inner)).toBe(1_000_000n);
  });

  it('decodes the other seeded prices', () => {
    expect(decodeU256(fromHex('05004a4d220f'))).toBe(65_000_000_000n); // mBTC $65k
    expect(decodeU256(fromHex('0400e1f505'))).toBe(100_000_000n); // mNVDAx $100
    expect(decodeU256(fromHex('0400943577'))).toBe(2_000_000_000n); // mXAUT $2000
    expect(decodeU256(fromHex('0480d1f008'))).toBe(150_000_000n); // mGOOGLx $150
  });

  it('decodes Vec<u32> (bps allocation)', () => {
    // count=5 (LE), then [0,2000,3000,4000,1000] as u32 LE.
    const bytes = fromHex(
      '05000000' +
        '00000000' +
        'd0070000' +
        'b80b0000' +
        'a00f0000' +
        'e8030000',
    );
    expect(decodeVecU32(bytes)).toEqual([0, 2000, 3000, 4000, 1000]);
  });

  it('decodes the Profile unit enum by tag', () => {
    expect(decodeProfile(fromHex('00'))).toBe('Conservative');
    expect(decodeProfile(fromHex('01'))).toBe('Moderate');
    expect(decodeProfile(fromHex('02'))).toBe('Aggressive');
  });

  it('ByteReader reads an Address (Key) as a prefixed string', () => {
    const acct = '11'.repeat(32);
    expect(new ByteReader(fromHex('00' + acct)).address()).toBe(
      `account-hash-${acct}`,
    );
    expect(new ByteReader(fromHex('01' + MUSDC)).address()).toBe(
      `hash-${MUSDC}`,
    );
  });

  it('cep18ItemKey is base64 of the key bytes', () => {
    const key = contractKeyBytes(MUSDC);
    expect(cep18ItemKey(key)).toBe(Buffer.from(key).toString('base64'));
  });
});
