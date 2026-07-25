/**
 * Binance Skill `query-token-info`, public ETH market context.
 *
 * Server-side only. Uses the two public endpoints the skill documents (`dynamic` for
 * spot statistics and `kline` for candles) against mainnet WETH. Both are unauthenticated:
 * no API key, no Binance account, no signature, nothing user-specific.
 *
 * The skill ships a CLI at `.agents/skills/query-token-info/scripts/cli.mjs`, but its
 * entrypoint guard compares `import.meta.url` against a raw `process.argv[1]`, so on
 * Windows it never runs and exits silently. We call the documented URLs directly instead,
 * which also avoids spawning a subprocess per request.
 *
 * This data is market *context* only. It never determines borrowing capacity or
 * liquidation, the Aave oracle remains the source of truth for the protocol position.
 */

/** Canonical WETH on Ethereum mainnet, used purely as the reference ETH market. */
export const WETH_MAINNET_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
export const ETHEREUM_CHAIN_ID = "1";
const KLINE_PLATFORM = "ethereum";

const DYNAMIC_ENDPOINT =
  "https://web3.binance.com/bapi/defi/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info/ai";
const KLINE_ENDPOINT = "https://dquery.sintral.io/u-kline/v1/k-line/candles";

const REQUEST_HEADERS = { "Accept-Encoding": "identity", "User-Agent": "binance-web3/2.0 (Skill)" };
const REQUEST_TIMEOUT_MS = 10_000;

/** Daily candles requested. 31 closes yield 30 daily returns for the volatility estimate. */
export const CANDLE_COUNT = 31;
export const CANDLE_INTERVAL = "1d";

const CACHE_TTL_MS = 60_000;

export const MARKET_DATA_SOURCE = "Binance Skill query-token-info (dynamic + kline), public endpoints";

export type Candle = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
};

export type CandleStats = {
  dailySigmaPercent: number;
  maxDrawdown30dPercent: number;
  candleCount: number;
  lastClose: number | null;
  windowStart: string | null;
  windowEnd: string | null;
};

export type EthMarketContext = {
  source: string;
  symbol: string;
  chainId: string;
  contractAddress: string;
  priceUsd: number | null;
  change24hPercent: number | null;
  high24hUsd: number | null;
  low24hUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  asOf: string;
  degraded: boolean;
  degradedReason: string | null;
} & CandleStats;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Binance endpoint returned HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Kline responses are a 2D array, not objects:
 * `[open, high, low, close, volume, timestampMs, tradeCount]`.
 */
export function parseKlineCandles(payload: unknown): Candle[] {
  const rows = (payload as { data?: unknown })?.data;
  if (!Array.isArray(rows)) {
    throw new Error("Kline response did not contain a data array.");
  }

  const candles: Candle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) {
      continue;
    }
    const [open, high, low, close, volume, timestamp] = row.map(toFiniteNumber);
    if (open === null || high === null || low === null || close === null || timestamp === null) {
      continue;
    }
    candles.push({ open, high, low, close, volume: volume ?? 0, timestamp });
  }

  if (candles.length === 0) {
    throw new Error("Kline response contained no usable candles.");
  }

  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Sample standard deviation of daily log returns, and the deepest peak-to-trough move
 * within the window.
 *
 * Log returns are used so that a fall and the rise that undoes it are symmetric.
 * The drawdown walks intraday highs and lows rather than closes, so a spike down that
 * recovered by the close still counts, a position gets liquidated on the low, not the close.
 */
export function computeCandleStats(candles: Candle[]): CandleStats {
  const ordered = [...candles].sort((a, b) => a.timestamp - b.timestamp);

  if (ordered.length === 0) {
    return {
      dailySigmaPercent: 0,
      maxDrawdown30dPercent: 0,
      candleCount: 0,
      lastClose: null,
      windowStart: null,
      windowEnd: null,
    };
  }

  const returns: number[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1].close;
    const current = ordered[i].close;
    if (previous > 0 && current > 0) {
      returns.push(Math.log(current / previous));
    }
  }

  let dailySigmaPercent = 0;
  if (returns.length > 1) {
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
    dailySigmaPercent = Math.sqrt(variance) * 100;
  }

  let peak = Number.NEGATIVE_INFINITY;
  let maxDrawdown = 0;
  for (const candle of ordered) {
    peak = Math.max(peak, candle.high);
    if (peak > 0) {
      maxDrawdown = Math.min(maxDrawdown, candle.low / peak - 1);
    }
  }

  return {
    dailySigmaPercent: Number(dailySigmaPercent.toFixed(4)),
    maxDrawdown30dPercent: Number((maxDrawdown * 100).toFixed(4)),
    candleCount: ordered.length,
    lastClose: ordered[ordered.length - 1].close,
    windowStart: new Date(ordered[0].timestamp).toISOString(),
    windowEnd: new Date(ordered[ordered.length - 1].timestamp).toISOString(),
  };
}

export type DynamicStats = {
  priceUsd: number | null;
  change24hPercent: number | null;
  high24hUsd: number | null;
  low24hUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
};

export function parseDynamicStats(payload: unknown): DynamicStats {
  const data = (payload as { data?: Record<string, unknown> })?.data;
  if (!data || typeof data !== "object") {
    throw new Error("Dynamic response did not contain a data object.");
  }

  return {
    priceUsd: toFiniteNumber(data.price),
    change24hPercent: toFiniteNumber(data.percentChange24h),
    high24hUsd: toFiniteNumber(data.priceHigh24h),
    low24hUsd: toFiniteNumber(data.priceLow24h),
    volume24hUsd: toFiniteNumber(data.volume24h),
    liquidityUsd: toFiniteNumber(data.liquidity),
  };
}

export function buildDynamicUrl(): string {
  const params = new URLSearchParams({ chainId: ETHEREUM_CHAIN_ID, contractAddress: WETH_MAINNET_ADDRESS });
  return `${DYNAMIC_ENDPOINT}?${params}`;
}

export function buildKlineUrl(): string {
  const params = new URLSearchParams({
    platform: KLINE_PLATFORM,
    address: WETH_MAINNET_ADDRESS,
    interval: CANDLE_INTERVAL,
    limit: String(CANDLE_COUNT),
  });
  return `${KLINE_ENDPOINT}?${params}`;
}

function degradedContext(reason: string): EthMarketContext {
  return {
    source: MARKET_DATA_SOURCE,
    symbol: "WETH",
    chainId: ETHEREUM_CHAIN_ID,
    contractAddress: WETH_MAINNET_ADDRESS,
    priceUsd: null,
    change24hPercent: null,
    high24hUsd: null,
    low24hUsd: null,
    volume24hUsd: null,
    liquidityUsd: null,
    dailySigmaPercent: 0,
    maxDrawdown30dPercent: 0,
    candleCount: 0,
    lastClose: null,
    windowStart: null,
    windowEnd: null,
    asOf: new Date().toISOString(),
    degraded: true,
    degradedReason: reason,
  };
}

/** Fetches both endpoints and merges them. Exported unwrapped so tests can stub `fetch`. */
export async function fetchEthMarketContext(): Promise<EthMarketContext> {
  const [dynamicPayload, klinePayload] = await Promise.all([fetchJson(buildDynamicUrl()), fetchJson(buildKlineUrl())]);

  const dynamic = parseDynamicStats(dynamicPayload);
  const stats = computeCandleStats(parseKlineCandles(klinePayload));

  return {
    source: MARKET_DATA_SOURCE,
    symbol: "WETH",
    chainId: ETHEREUM_CHAIN_ID,
    contractAddress: WETH_MAINNET_ADDRESS,
    ...dynamic,
    ...stats,
    asOf: new Date().toISOString(),
    degraded: false,
    degradedReason: null,
  };
}

type CacheEntry = { value: EthMarketContext; expiresAt: number };

let cache: CacheEntry | null = null;
let inFlight: Promise<EthMarketContext> | null = null;

/**
 * Cached market context that never throws.
 *
 * A public API endpoint sits in front of this, so a failed upstream call degrades to a
 * labelled placeholder rather than a 5xx, an integrator's tool keeps working, and the
 * caller can see from `degraded` that scenarios came from fixed assumptions.
 *
 * Concurrent callers share one in-flight request so traffic cannot fan out to Binance.
 */
export async function getEthMarketContext(options?: { forceRefresh?: boolean }): Promise<EthMarketContext> {
  const now = Date.now();

  if (!options?.forceRefresh && cache && cache.expiresAt > now) {
    return cache.value;
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = fetchEthMarketContext()
    .then(value => {
      cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      return value;
    })
    .catch(error => {
      const reason = error instanceof Error ? error.message : "Unknown error contacting Binance market endpoints.";
      // Serve stale data ahead of a placeholder; it is still real market context.
      if (cache) {
        return { ...cache.value, degraded: true, degradedReason: `${reason} (serving cached data)` };
      }
      return degradedContext(reason);
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Test hook, clears the module-level cache between cases. */
export function resetEthMarketCache(): void {
  cache = null;
  inFlight = null;
}
