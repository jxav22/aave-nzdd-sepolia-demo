/**
 * GET /api/v1/borrow-risk
 *
 * Stress-tests a proposed dNZD borrow against a wallet's real position in the hackathon
 * Aave market. Public and unauthenticated; the app's own UI calls this same endpoint so
 * the documented contract cannot drift from what the demo actually uses.
 *
 * Query parameters:
 *   address              required, the wallet to assess
 *   borrowAmount         optional, proposed borrow in dNZD (default 0)
 *   targetHealthFactor   optional, decimal, minimum 1.0 (default 1.2)
 *   shockPercent         optional, ETH decline for the stress-tested amount (default 20)
 */
import { aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";
import { BORROW_SYMBOL } from "~~/services/aave/readPosition";
import { checkRateLimit, clientIdentifier, rateLimitHeaders } from "~~/services/api/rateLimit";
import { ApiError, handleOptions, jsonError, jsonOk, withApiErrorHandling } from "~~/services/api/respond";
import { parseAddress, parseShockPercent, parseTargetHealthFactor, parseTokenAmount } from "~~/services/api/validate";
import { runBorrowRiskAssistant } from "~~/services/risk/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_MINUTE = 60;

export async function GET(request: Request): Promise<Response> {
  const limit = checkRateLimit(clientIdentifier(request), RATE_LIMIT_PER_MINUTE);
  const headers = { ...rateLimitHeaders(limit), "Cache-Control": "no-store" };

  if (!limit.allowed) {
    return jsonError(
      new ApiError("RATE_LIMITED", `Rate limit of ${limit.limit} requests per minute exceeded.`),
      headers,
    );
  }

  return withApiErrorHandling(async () => {
    const params = new URL(request.url).searchParams;
    const borrowDecimals = aaveHackathonMnzdConfig.assets[BORROW_SYMBOL].decimals;

    const report = await runBorrowRiskAssistant({
      user: parseAddress(params.get("address")),
      proposedBorrowTokens: parseTokenAmount(params.get("borrowAmount"), borrowDecimals, "borrowAmount"),
      targetHealthFactorWad: parseTargetHealthFactor(params.get("targetHealthFactor")),
      stressShockBps: parseShockPercent(params.get("shockPercent")),
    }).catch(error => {
      // The Binance path degrades internally, so a failure here is the chain read.
      throw new ApiError(
        "UPSTREAM_RPC_ERROR",
        `Could not read the Aave position from Sepolia: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    });

    return jsonOk(report, { headers });
  }, headers);
}

export function OPTIONS(): Response {
  return handleOptions();
}
