/**
 * GET /api/v1/binance/token/meta?chainId=1&contractAddress=0x…
 *
 * Static token metadata from the Binance Web3 `query-token-info` skill (public,
 * unauthenticated): name, symbol, decimals, website and socials.
 */
import { checkRateLimit, clientIdentifier, rateLimitHeaders } from "~~/services/api/rateLimit";
import { ApiError, handleOptions, jsonError, jsonOk, withApiErrorHandling } from "~~/services/api/respond";
import { parseTokenLookup } from "~~/services/api/validate";
import { TOKEN_INFO_SOURCE, buildMetaUrl, getTokenMeta } from "~~/services/binance/tokenInfo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_MINUTE = 60;

export async function GET(request: Request): Promise<Response> {
  const limit = checkRateLimit(clientIdentifier(request), RATE_LIMIT_PER_MINUTE);
  const headers = {
    ...rateLimitHeaders(limit),
    "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
  };

  if (!limit.allowed) {
    return jsonError(new ApiError("RATE_LIMITED", `Rate limit of ${limit.limit} requests per minute exceeded.`), {
      ...rateLimitHeaders(limit),
      "Cache-Control": "no-store",
    });
  }

  return withApiErrorHandling(async () => {
    const { chainId, contractAddress } = parseTokenLookup(new URL(request.url).searchParams);

    const token = await getTokenMeta(chainId, contractAddress).catch(error => {
      throw new ApiError(
        "UPSTREAM_RPC_ERROR",
        `Could not read token metadata from Binance: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    });

    return jsonOk(
      {
        ...token,
        provenance: {
          source: TOKEN_INFO_SOURCE,
          skill: "query-token-info",
          command: "meta",
          endpoint: buildMetaUrl(chainId, contractAddress),
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
