/**
 * GET /api/v1/market/eth
 *
 * The Binance-derived ETH market context on its own: spot statistics plus the daily
 * volatility and 30-day drawdown the stress scenarios are built from.
 *
 * Backed by a 60-second server cache, so public traffic here cannot fan out to Binance.
 * Never 5xxs on an upstream failure, the response carries `degraded` instead.
 */
import { checkRateLimit, clientIdentifier, rateLimitHeaders } from "~~/services/api/rateLimit";
import { handleOptions, jsonError, jsonOk, withApiErrorHandling } from "~~/services/api/respond";
import { ApiError } from "~~/services/api/respond";
import { buildDynamicUrl, buildKlineUrl, getEthMarketContext } from "~~/services/binance/ethMarket";
import { deriveShocksFromMarket, fallbackShocks } from "~~/utils/risk/stress";
import { DISCLAIMER, SOURCES } from "~~/utils/risk/wording";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_MINUTE = 120;

export async function GET(request: Request): Promise<Response> {
  const limit = checkRateLimit(clientIdentifier(request), RATE_LIMIT_PER_MINUTE);
  const headers = {
    ...rateLimitHeaders(limit),
    "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
  };

  if (!limit.allowed) {
    return jsonError(new ApiError("RATE_LIMITED", `Rate limit of ${limit.limit} requests per minute exceeded.`), {
      ...rateLimitHeaders(limit),
      "Cache-Control": "no-store",
    });
  }

  return withApiErrorHandling(async () => {
    const market = await getEthMarketContext();
    const shocks = market.degraded ? fallbackShocks() : deriveShocksFromMarket(market);

    return jsonOk(
      {
        symbol: market.symbol,
        chainId: market.chainId,
        contractAddress: market.contractAddress,
        price: {
          usd: market.priceUsd,
          change24hPercent: market.change24hPercent,
          high24hUsd: market.high24hUsd,
          low24hUsd: market.low24hUsd,
        },
        liquidity: { volume24hUsd: market.volume24hUsd, liquidityUsd: market.liquidityUsd },
        volatility: {
          dailySigmaPercent: market.dailySigmaPercent,
          maxDrawdown30dPercent: market.maxDrawdown30dPercent,
          candleCount: market.candleCount,
          windowStart: market.windowStart,
          windowEnd: market.windowEnd,
        },
        derivedScenarios: shocks.map(shock => ({
          label: shock.label,
          ethPriceChangePercent: Number((shock.shockBps / 100).toFixed(2)),
          derivedFrom: shock.derivedFrom,
        })),
        provenance: {
          source: market.source,
          endpoints: [buildDynamicUrl(), buildKlineUrl()],
          authenticationRequired: false,
          asOf: market.asOf,
          degraded: market.degraded,
          degradedReason: market.degradedReason,
        },
        sources: [SOURCES.binance],
        disclaimer: DISCLAIMER,
      },
      { headers },
    );
  }, headers);
}

export function OPTIONS(): Response {
  return handleOptions();
}
