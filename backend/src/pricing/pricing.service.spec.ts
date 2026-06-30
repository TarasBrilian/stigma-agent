import { PricingService } from './pricing.service';

type Json = Record<string, unknown>;

/** Route a mocked global.fetch by URL fragment to a JSON body. */
const routedFetch = (
  routes: { match: string; body: Json; ok?: boolean; status?: number }[],
) =>
  jest.fn((url: string | URL) => {
    const u = String(url);
    const route = routes.find((r) => u.includes(r.match));
    if (!route) return Promise.reject(new Error(`no route for ${u}`));
    return Promise.resolve({
      ok: route.ok ?? true,
      status: route.status ?? 200,
      statusText: 'OK',
      json: () => Promise.resolve(route.body),
    });
  });

const cg = (btc: number, gold: number): Json => ({
  bitcoin: { usd: btc },
  'tether-gold': { usd: gold },
});
/** Twelve Data single-symbol flat shape (verified live). */
const price = (p: string): Json => ({ price: p });

describe('PricingService.fetchPrices', () => {
  const realFetch = global.fetch;
  const prevKey = process.env.PRICE_API_KEY;

  afterEach(() => {
    global.fetch = realFetch;
    if (prevKey === undefined) delete process.env.PRICE_API_KEY;
    else process.env.PRICE_API_KEY = prevKey;
  });

  it('maps every asset to raw USD 6dp, pins mUSDC, from both sources', async () => {
    process.env.PRICE_API_KEY = 'k';
    global.fetch = routedFetch([
      { match: 'coingecko', body: cg(65000.5, 2350) },
      { match: 'symbol=NVDA', body: price('880.12') },
      { match: 'symbol=GOOGL', body: price('175') },
    ]) as unknown as typeof fetch;

    const p = await new PricingService().fetchPrices();
    expect(p).toEqual({
      mUSDC: 1_000_000n,
      mBTC: 65_000_500_000n, // 65000.5 * 1e6 — exact, no float drift
      mXAUT: 2_350_000_000n,
      mNVDAx: 880_120_000n,
      mGOOGLx: 175_000_000n,
    });
  });

  it('throws (so feedOracle skips the cycle) when PRICE_API_KEY is missing', async () => {
    delete process.env.PRICE_API_KEY;
    global.fetch = routedFetch([
      { match: 'coingecko', body: cg(65000, 2350) },
    ]) as unknown as typeof fetch;
    await expect(new PricingService().fetchPrices()).rejects.toThrow(
      /PRICE_API_KEY/,
    );
  });

  it('throws on a non-OK upstream response (caught by feedOracle)', async () => {
    process.env.PRICE_API_KEY = 'k';
    global.fetch = routedFetch([
      { match: 'coingecko', body: {}, ok: false, status: 503 },
      { match: 'symbol=NVDA', body: price('880') },
      { match: 'symbol=GOOGL', body: price('175') },
    ]) as unknown as typeof fetch;
    await expect(new PricingService().fetchPrices()).rejects.toThrow(
      /CoinGecko: HTTP 503/,
    );
  });

  it('throws on a malformed body (missing a price field)', async () => {
    process.env.PRICE_API_KEY = 'k';
    global.fetch = routedFetch([
      { match: 'coingecko', body: cg(65000, 2350) },
      { match: 'symbol=NVDA', body: price('880') },
      { match: 'symbol=GOOGL', body: {} }, // price missing
    ]) as unknown as typeof fetch;
    await expect(new PricingService().fetchPrices()).rejects.toThrow(
      /stock source \(GOOGL\): missing/,
    );
  });

  it('surfaces a 200 + status:error body (e.g. rate limit) with its message', async () => {
    process.env.PRICE_API_KEY = 'k';
    global.fetch = routedFetch([
      { match: 'coingecko', body: cg(65000, 2350) },
      {
        match: 'symbol=NVDA',
        body: { status: 'error', message: 'API credits exhausted' },
      },
      { match: 'symbol=GOOGL', body: price('175') },
    ]) as unknown as typeof fetch;
    await expect(new PricingService().fetchPrices()).rejects.toThrow(
      /stock source \(NVDA\): API credits exhausted/,
    );
  });
});
