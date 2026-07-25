/**
 * GET /api/v1/binance/token/search?q=ETH&chainIds=1,56
 *
 * Proxies the Binance Web3 `query-token-info` search skill (public, unauthenticated).
 */
import { checkRateLimit, clientIdentifier, rateLimitHeaders } from "~~/services/api/rateLimit";
import { ApiError, handleOptions, jsonError, jsonOk, withApiErrorHandling } from "~~/services/api/respond";
import { TOKEN_INFO_SOURCE, buildSearchUrl, sanitizeChainIds, searchTokens } from "~~/services/binance/tokenInfo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_MINUTE = 60;
const MAX_KEYWORD_LENGTH = 64;

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
    const { searchParams } = new URL(request.url);
    const keyword = (searchParams.get("q") ?? searchParams.get("keyword") ?? "").trim();
    const chainIds = sanitizeChainIds(searchParams.get("chainIds") ?? undefined);

    if (!keyword) {
      throw new ApiError("INVALID_BODY", "Query parameter `q` (keyword) is required.", "q");
    }
    if (keyword.length > MAX_KEYWORD_LENGTH) {
      throw new ApiError("INVALID_BODY", `Keyword must be at most ${MAX_KEYWORD_LENGTH} characters.`, "q");
    }

    const results = await searchTokens(keyword, chainIds);

    return jsonOk(
      {
        keyword,
        chainIds: chainIds ?? null,
        count: results.length,
        results,
        provenance: {
          source: TOKEN_INFO_SOURCE,
          skill: "query-token-info",
          command: "search",
          endpoint: buildSearchUrl(keyword, chainIds),
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
