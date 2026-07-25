/**
 * GET /api/v1/binance/token/dynamic?chainId=1&contractAddress=0x…
 *
 * Live market data for one token from the Binance Web3 `query-token-info` skill
 * (public, unauthenticated): price, 24h change, volume, liquidity, holders.
 */
import { checkRateLimit, clientIdentifier, rateLimitHeaders } from "~~/services/api/rateLimit";
import { ApiError, handleOptions, jsonError, jsonOk, withApiErrorHandling } from "~~/services/api/respond";
import { parseTokenLookup } from "~~/services/api/validate";
import { TOKEN_INFO_SOURCE, buildDynamicUrl, getTokenDynamic } from "~~/services/binance/tokenInfo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_MINUTE = 60;

export async function GET(request: Request): Promise<Response> {
  const limit = checkRateLimit(clientIdentifier(request), RATE_LIMIT_PER_MINUTE);
  const headers = {
    ...rateLimitHeaders(limit),
    "Cache-Control": "public, max-age=15, stale-while-revalidate=60",
  };

  if (!limit.allowed) {
    return jsonError(new ApiError("RATE_LIMITED", `Rate limit of ${limit.limit} requests per minute exceeded.`), {
      ...rateLimitHeaders(limit),
      "Cache-Control": "no-store",
    });
  }

  return withApiErrorHandling(async () => {
    const { chainId, contractAddress } = parseTokenLookup(new URL(request.url).searchParams);

    const token = await getTokenDynamic(chainId, contractAddress).catch(error => {
      throw new ApiError(
        "UPSTREAM_RPC_ERROR",
        `Could not read token market data from Binance: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    });

    return jsonOk(
      {
        ...token,
        provenance: {
          source: TOKEN_INFO_SOURCE,
          skill: "query-token-info",
          command: "dynamic",
          endpoint: buildDynamicUrl(chainId, contractAddress),
          authenticationRequired: false,
          asOf: new Date().toISOString(),
        },
      },
      { headers },
    );
  }, headers);
}

export function OPTIONS(): Response {
  return handleOptions();
}
