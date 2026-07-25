import {
  type Candle,
  MARKET_DATA_SOURCE,
  WETH_MAINNET_ADDRESS,
  buildDynamicUrl,
  buildKlineUrl,
  computeCandleStats,
  fetchEthMarketContext,
  getEthMarketContext,
  parseDynamicStats,
  parseKlineCandles,
  resetEthMarketCache,
} from "./ethMarket";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DAY = 86_400_000;

function candle(overrides: Partial<Candle> & { close: number; timestamp: number }): Candle {
  const { close } = overrides;
  return { open: close, high: close, low: close, volume: 0, ...overrides };
}

/** Shape recorded from the live `kline` endpoint: a 2D array, not objects. */
const KLINE_PAYLOAD = {
  data: [
    [
      "1618.99014801196733238097",
      "1659.98024683478613",
      "1531.02365546601639",
      "1566.03430859347931",
      "183018395.31",
      1782345600000,
      3239,
    ],
    [
      "1566.03430859347931",
      "1593.34931930034903",
      "1514.77758732380146",
      "1586.72790962676577",
      "165757841.05",
      1782432000000,
      2828,
    ],
    [
      "1586.72790962676577",
      "1610.85566696186566",
      "1562.32518347756347",
      "1568.48494737449688",
      "46022756.22",
      1782518400000,
      1902,
    ],
  ],
  status: { error_code: "0", error_message: "SUCCESS" },
};

/** Shape recorded from the live `dynamic` endpoint: every numeric field is a string. */
const DYNAMIC_PAYLOAD = {
  code: "000000",
  data: {
    price: "1854.436287926667027161795712387819013372",
    percentChange24h: "-1.6",
    priceHigh24h: "1958.091861081321042654754160430733439113",
    priceLow24h: "1845.930271443562151543290610526315787986",
    volume24h: "83266348.26074515532029151962",
    liquidity: "309155176.87083104068377071423063651382",
    holders: "3308887",
  },
  success: true,
};

describe("parseKlineCandles", () => {
  it("maps the positional candle array onto named fields", () => {
    const candles = parseKlineCandles(KLINE_PAYLOAD);

    expect(candles).toHaveLength(3);
    expect(candles[0]).toMatchObject({
      open: 1618.99014801196733238097,
      high: 1659.98024683478613,
      low: 1531.02365546601639,
      close: 1566.03430859347931,
      timestamp: 1782345600000,
    });
  });

  it("orders candles oldest first regardless of upstream order", () => {
    const reversed = { data: [...KLINE_PAYLOAD.data].reverse() };
    const timestamps = parseKlineCandles(reversed).map(c => c.timestamp);

    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });

  it("skips malformed rows rather than failing the whole response", () => {
    const withJunk = { data: [...KLINE_PAYLOAD.data, ["oops"], null, ["1", "2", "3", "4", "5", "not-a-time"]] };

    expect(parseKlineCandles(withJunk)).toHaveLength(3);
  });

  it("rejects a response with no usable candles", () => {
    expect(() => parseKlineCandles({ data: [] })).toThrow(/no usable candles/i);
    expect(() => parseKlineCandles({ status: "oops" })).toThrow(/data array/i);
  });
});

describe("computeCandleStats", () => {
  it("reports zero volatility for a constant growth rate", () => {
    const candles = [100, 110, 121, 133.1].map((close, i) => candle({ close, timestamp: i * DAY }));

    expect(computeCandleStats(candles).dailySigmaPercent).toBe(0);
  });

  it("computes the sample standard deviation of daily log returns", () => {
    // Log returns of exactly +0.1 and -0.1: mean 0, sample variance 0.02, sigma 14.1421%.
    const candles = [100, 100 * Math.exp(0.1), 100].map((close, i) => candle({ close, timestamp: i * DAY }));

    expect(computeCandleStats(candles).dailySigmaPercent).toBeCloseTo(14.1421, 3);
  });

  it("measures drawdown from intraday highs to intraday lows", () => {
    // A spike down that recovers by the close still liquidates a position, so lows count.
    const candles: Candle[] = [
      { open: 100, high: 100, low: 95, close: 100, volume: 0, timestamp: 0 },
      { open: 100, high: 120, low: 60, close: 100, volume: 0, timestamp: DAY },
      { open: 100, high: 120, low: 90, close: 100, volume: 0, timestamp: 2 * DAY },
    ];

    expect(computeCandleStats(candles).maxDrawdown30dPercent).toBe(-50);
  });

  it("never reports a positive drawdown for a market that only rose", () => {
    const candles = [100, 110, 120].map((close, i) => candle({ close, timestamp: i * DAY }));

    expect(computeCandleStats(candles).maxDrawdown30dPercent).toBe(0);
  });

  it("reports the window covered by the sample", () => {
    const stats = computeCandleStats(parseKlineCandles(KLINE_PAYLOAD));

    expect(stats.candleCount).toBe(3);
    expect(stats.lastClose).toBe(1568.48494737449688);
    expect(stats.windowStart).toBe(new Date(1782345600000).toISOString());
    expect(stats.windowEnd).toBe(new Date(1782518400000).toISOString());
  });

  it("handles an empty and a single-candle sample without dividing by zero", () => {
    expect(computeCandleStats([])).toMatchObject({ dailySigmaPercent: 0, maxDrawdown30dPercent: 0, candleCount: 0 });
    expect(computeCandleStats([candle({ close: 100, timestamp: 0 })]).dailySigmaPercent).toBe(0);
  });
});

describe("parseDynamicStats", () => {
  it("converts the string-encoded market fields to numbers", () => {
    const { data } = DYNAMIC_PAYLOAD;

    expect(parseDynamicStats(DYNAMIC_PAYLOAD)).toEqual({
      priceUsd: Number(data.price),
      change24hPercent: Number(data.percentChange24h),
      high24hUsd: Number(data.priceHigh24h),
      low24hUsd: Number(data.priceLow24h),
      volume24hUsd: Number(data.volume24h),
      liquidityUsd: Number(data.liquidity),
    });
  });

  it("keeps the high-precision price usable as a number", () => {
    const stats = parseDynamicStats(DYNAMIC_PAYLOAD);

    expect(stats.priceUsd).toBeCloseTo(1854.44, 2);
    expect(Number.isFinite(stats.priceUsd)).toBe(true);
  });

  it("returns nulls for absent fields instead of NaN", () => {
    expect(parseDynamicStats({ data: {} })).toEqual({
      priceUsd: null,
      change24hPercent: null,
      high24hUsd: null,
      low24hUsd: null,
      volume24hUsd: null,
      liquidityUsd: null,
    });
  });

  it("rejects a response with no data object", () => {
    expect(() => parseDynamicStats({ code: "500" })).toThrow(/data object/i);
  });
});

describe("endpoint URLs", () => {
  it("targets mainnet WETH on both public endpoints without credentials", () => {
    const dynamicUrl = buildDynamicUrl();
    const klineUrl = buildKlineUrl();

    expect(dynamicUrl).toContain("chainId=1");
    expect(dynamicUrl).toContain(WETH_MAINNET_ADDRESS);
    expect(klineUrl).toContain("platform=ethereum");
    expect(klineUrl).toContain("interval=1d");
    expect(klineUrl).toContain("limit=31");

    for (const url of [dynamicUrl, klineUrl]) {
      expect(url).not.toMatch(/api[_-]?key|signature|token=/i);
    }
  });
});

describe("getEthMarketContext", () => {
  const okResponse = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload });

  function stubFetch(impl: (url: string) => unknown) {
    const spy = vi.fn(async (input: string | URL) => impl(String(input)) as never);
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  function stubHealthyFetch() {
    return stubFetch(url => okResponse(url.includes("k-line") ? KLINE_PAYLOAD : DYNAMIC_PAYLOAD));
  }

  beforeEach(() => {
    resetEthMarketCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetEthMarketCache();
  });

  it("merges both endpoints into one context", async () => {
    stubHealthyFetch();
    const context = await getEthMarketContext();

    expect(context.degraded).toBe(false);
    expect(context.source).toBe(MARKET_DATA_SOURCE);
    expect(context.priceUsd).toBeCloseTo(1854.44, 2);
    expect(context.change24hPercent).toBe(-1.6);
    expect(context.candleCount).toBe(3);
  });

  it("serves the cached context instead of refetching within the TTL", async () => {
    const spy = stubHealthyFetch();

    await getEthMarketContext();
    await getEthMarketContext();

    expect(spy).toHaveBeenCalledTimes(2); // one dynamic + one kline, from the first call only
  });

  it("shares a single in-flight request between concurrent callers", async () => {
    const spy = stubHealthyFetch();

    await Promise.all([getEthMarketContext(), getEthMarketContext(), getEthMarketContext()]);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("degrades with a reason instead of throwing when Binance is unreachable", async () => {
    stubFetch(() => {
      throw new Error("network down");
    });

    const context = await getEthMarketContext();

    expect(context.degraded).toBe(true);
    expect(context.degradedReason).toMatch(/network down/);
    expect(context.priceUsd).toBeNull();
    expect(context.dailySigmaPercent).toBe(0);
  });

  it("degrades on a non-200 response", async () => {
    stubFetch(() => ({ ok: false, status: 503, json: async () => ({}) }));

    const context = await getEthMarketContext();

    expect(context.degraded).toBe(true);
    expect(context.degradedReason).toMatch(/503/);
  });

  it("prefers stale real data over a placeholder when a refresh fails", async () => {
    stubHealthyFetch();
    const fresh = await getEthMarketContext();

    stubFetch(() => {
      throw new Error("upstream flaky");
    });
    const stale = await getEthMarketContext({ forceRefresh: true });

    expect(stale.degraded).toBe(true);
    expect(stale.degradedReason).toMatch(/serving cached data/);
    expect(stale.priceUsd).toBe(fresh.priceUsd);
  });

  it("propagates the failure from the unwrapped fetcher", async () => {
    stubFetch(() => {
      throw new Error("boom");
    });

    await expect(fetchEthMarketContext()).rejects.toThrow(/boom/);
  });
});
