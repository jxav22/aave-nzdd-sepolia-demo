/**
 * GET /api/v1/position/{address}
 *
 * The raw Aave read behind the assistant: account data, per-reserve oracle prices and
 * liquidation thresholds, supplied balances, and the borrow reserve's available liquidity.
 * Includes `currentLiquidationThreshold`, which the dApp's own hooks discard.
 */
import { aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";
import {
  BORROW_SYMBOL,
  COLLATERAL_SYMBOL,
  collateralLegsCoverReportedTotal,
  readAavePosition,
} from "~~/services/aave/readPosition";
import { checkRateLimit, clientIdentifier, rateLimitHeaders } from "~~/services/api/rateLimit";
import { ApiError, handleOptions, jsonError, jsonOk, withApiErrorHandling } from "~~/services/api/respond";
import { parseAddress } from "~~/services/api/validate";
import { formatHealthFactorWad, formatScaled } from "~~/utils/risk/stress";
import { SOURCES } from "~~/utils/risk/wording";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_MINUTE = 60;

export async function GET(request: Request, context: { params: Promise<{ address: string }> }): Promise<Response> {
  const limit = checkRateLimit(clientIdentifier(request), RATE_LIMIT_PER_MINUTE);
  const headers = { ...rateLimitHeaders(limit), "Cache-Control": "no-store" };

  if (!limit.allowed) {
    return jsonError(
      new ApiError("RATE_LIMITED", `Rate limit of ${limit.limit} requests per minute exceeded.`),
      headers,
    );
  }

  return withApiErrorHandling(async () => {
    const { address } = await context.params;
    const user = parseAddress(address);

    const position = await readAavePosition(user).catch(error => {
      throw new ApiError(
        "UPSTREAM_RPC_ERROR",
        `Could not read the Aave position from Sepolia: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    });

    const borrowReserve = position.reserves[BORROW_SYMBOL];

    return jsonOk(
      {
        market: {
          chainId: position.chainId,
          marketId: aaveHackathonMnzdConfig.marketId,
          pool: position.poolAddress,
          oracle: position.oracleAddress,
          protocolDataProvider: aaveHackathonMnzdConfig.protocolDataProvider,
          blockNumber: position.blockNumber.toString(),
          baseCurrencyDecimals: 8,
          collateralSymbol: COLLATERAL_SYMBOL,
          borrowSymbol: BORROW_SYMBOL,
        },
        account: {
          address: position.user,
          totalCollateralBase: position.totalCollateralBase.toString(),
          totalDebtBase: position.totalDebtBase.toString(),
          availableBorrowsBase: position.availableBorrowsBase.toString(),
          currentLiquidationThresholdBps: Number(position.currentLiquidationThresholdBps),
          ltvBps: Number(position.ltvBps),
          healthFactor: {
            raw: position.healthFactorWad?.toString() ?? null,
            formatted: formatHealthFactorWad(position.healthFactorWad),
          },
          collateralLegsMatchReportedTotal: collateralLegsCoverReportedTotal(position),
        },
        reserves: Object.values(position.reserves).map(reserve => ({
          symbol: reserve.symbol,
          decimals: reserve.decimals,
          oraclePriceBase: reserve.priceBase.toString(),
          oraclePriceFormatted: formatScaled(reserve.priceBase, 8),
          liquidationThresholdBps: Number(reserve.liquidationThresholdBps),
          ltvBps: Number(reserve.ltvBps),
          suppliedBalance: reserve.suppliedBalance.toString(),
          suppliedBalanceFormatted: formatScaled(reserve.suppliedBalance, reserve.decimals, 6),
          collateralValueBase: reserve.collateralValueBase.toString(),
          borrowingEnabled: reserve.borrowingEnabled,
          isActive: reserve.isActive,
          isFrozen: reserve.isFrozen,
        })),
        borrowAsset: {
          symbol: BORROW_SYMBOL,
          decimals: borrowReserve.decimals,
          userDebt: position.borrowAssetDebt.toString(),
          userDebtFormatted: formatScaled(position.borrowAssetDebt, borrowReserve.decimals),
          poolLiquidity: position.borrowAssetLiquidity.toString(),
          poolLiquidityFormatted: formatScaled(position.borrowAssetLiquidity, borrowReserve.decimals),
        },
        sources: [SOURCES.aavePosition, SOURCES.aaveOracle],
      },
      { headers },
    );
  }, headers);
}

export function OPTIONS(): Response {
  return handleOptions();
}
