/**
 * POST /api/v1/borrow-risk/simulate
 *
 * Runs the stress engine over a caller-supplied position. No wallet, no chain read and
 * no dependency on our market, any Aave-compatible position expressed in a common base
 * currency can be assessed here.
 *
 * Body:
 *   collateral[]        required, each { symbol?, valueBase, liquidationThresholdBps, shockable? }
 *   debtBase            optional, existing debt in base units (default 0)
 *   proposedBorrowBase  optional, proposed additional debt in base units (default 0)
 *   targetHealthFactor  optional, decimal, minimum 1.0 (default 1.2)
 *   shockPercent        optional, ETH decline for the stress-tested amount (default 20)
 *   shocksBps           optional, explicit scenarios; supplying these skips the Binance call
 *   baseDecimals        optional, decimals of the base currency (default 8)
 */
import { checkRateLimit, clientIdentifier, rateLimitHeaders } from "~~/services/api/rateLimit";
import { ApiError, handleOptions, jsonError, jsonOk, withApiErrorHandling } from "~~/services/api/respond";
import {
  parseBaseUnits,
  parseCollateralLegs,
  parseJsonBody,
  parseShockList,
  parseShockPercent,
  parseTargetHealthFactor,
} from "~~/services/api/validate";
import { runSimulation } from "~~/services/risk/simulate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Higher than the chain-reading routes: this path touches no RPC and caches Binance. */
const RATE_LIMIT_PER_MINUTE = 120;

function parseBaseDecimals(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return 8;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 36) {
    throw new ApiError("INVALID_BODY", '"baseDecimals" must be an integer between 0 and 36.', "baseDecimals");
  }
  return parsed;
}

export async function POST(request: Request): Promise<Response> {
  const limit = checkRateLimit(clientIdentifier(request), RATE_LIMIT_PER_MINUTE);
  const headers = { ...rateLimitHeaders(limit), "Cache-Control": "no-store" };

  if (!limit.allowed) {
    return jsonError(
      new ApiError("RATE_LIMITED", `Rate limit of ${limit.limit} requests per minute exceeded.`),
      headers,
    );
  }

  return withApiErrorHandling(async () => {
    const body = await parseJsonBody(request);

    const result = await runSimulation({
      collateral: parseCollateralLegs(body.collateral),
      existingDebtBase: parseBaseUnits(body.debtBase, "debtBase"),
      proposedBorrowBase: parseBaseUnits(body.proposedBorrowBase, "proposedBorrowBase"),
      targetHealthFactorWad: parseTargetHealthFactor(body.targetHealthFactor as string | undefined),
      stressShockBps: parseShockPercent(body.shockPercent as string | undefined),
      baseDecimals: parseBaseDecimals(body.baseDecimals),
      shocksBps: parseShockList(body.shocksBps),
    });

    return jsonOk(result, { headers });
  }, headers);
}

export function OPTIONS(): Response {
  return handleOptions();
}
