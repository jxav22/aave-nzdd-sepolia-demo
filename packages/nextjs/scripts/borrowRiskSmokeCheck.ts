#!/usr/bin/env tsx
/**
 * Read-only end-to-end check of the Borrow Risk Assistant's two data sources.
 *
 * Hits the live hackathon market on Sepolia and the public Binance Skill endpoints,
 * then runs the deterministic stress engine over the result. Submits no transactions
 * and uses no private key or Binance credentials.
 *
 *   yarn risk:smoke [address]
 */
import {
  BORROW_SYMBOL,
  COLLATERAL_SYMBOL,
  collateralLegsCoverReportedTotal,
  readAavePosition,
} from "../services/aave/readPosition";
import { getEthMarketContext } from "../services/binance/ethMarket";
import {
  WAD,
  baseToTokenAmount,
  buildScenarios,
  deriveShocksFromMarket,
  fallbackShocks,
  formatHealthFactorWad,
  formatScaled,
  projectedHealthFactorWad,
  reconcileHealthFactor,
  solveLiquidationShockBps,
  solveStressedMaxBorrowBase,
  tokenAmountToBase,
} from "../utils/risk/stress";
import { type Address, isAddress } from "viem";

/** Vitalik's address: a real, well-known account with no position in this private market. */
const DEFAULT_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

async function main() {
  const input = process.argv[2] ?? DEFAULT_ADDRESS;
  if (!isAddress(input)) {
    throw new Error(`Not a valid address: ${input}`);
  }
  const user = input as Address;

  console.log("Borrow Risk Assistant smoke check");
  console.log("=================================\n");

  console.log("1. Aave position (source of truth)");
  console.log("-----------------------------------");
  const position = await readAavePosition(user);
  const collateral = position.reserves[COLLATERAL_SYMBOL];
  const borrowAsset = position.reserves[BORROW_SYMBOL];

  console.log(`  pool                 ${position.poolAddress}`);
  console.log(`  oracle               ${position.oracleAddress}`);
  console.log(`  block                ${position.blockNumber}`);
  console.log(`  user                 ${position.user}`);
  console.log(`  collateral (base)    ${formatScaled(position.totalCollateralBase, 8)}`);
  console.log(`  debt (base)          ${formatScaled(position.totalDebtBase, 8)}`);
  console.log(`  available to borrow  ${formatScaled(position.availableBorrowsBase, 8)}`);
  console.log(`  liquidation thresh.  ${position.currentLiquidationThresholdBps} bps`);
  console.log(`  health factor        ${formatHealthFactorWad(position.healthFactorWad)}`);
  console.log(
    `  ${COLLATERAL_SYMBOL} oracle price   ${formatScaled(collateral.priceBase, 8)} (LT ${collateral.liquidationThresholdBps} bps)`,
  );
  console.log(`  ${BORROW_SYMBOL} oracle price   ${formatScaled(borrowAsset.priceBase, 8)}`);
  console.log(`  ${BORROW_SYMBOL} pool liquidity ${formatScaled(position.borrowAssetLiquidity, borrowAsset.decimals)}`);
  console.log(`  collateral legs      ${position.collateralLegs.length}`);
  console.log(`  legs match Aave      ${collateralLegsCoverReportedTotal(position)}`);

  console.log("\n2. Binance Skill query-token-info (public, unauthenticated)");
  console.log("------------------------------------------------------------");
  const market = await getEthMarketContext();
  console.log(`  source               ${market.source}`);
  console.log(`  degraded             ${market.degraded}${market.degradedReason ? ` (${market.degradedReason})` : ""}`);
  console.log(`  ETH price (USD)      ${market.priceUsd ?? "n/a"}`);
  console.log(`  24h change           ${market.change24hPercent ?? "n/a"}%`);
  console.log(`  daily sigma          ${market.dailySigmaPercent}%`);
  console.log(`  30d max drawdown     ${market.maxDrawdown30dPercent}%`);
  console.log(`  candles              ${market.candleCount} (${market.windowStart} to ${market.windowEnd})`);

  console.log("\n3. Oracle divergence");
  console.log("---------------------");
  console.log(`  Aave books ${COLLATERAL_SYMBOL} at ${formatScaled(collateral.priceBase, 8)} base units`);
  console.log(`  Binance reports ETH at US$${market.priceUsd?.toFixed(2) ?? "n/a"}`);
  console.log("  Stress scenarios are relative moves, so this gap does not affect the table.");

  console.log("\n4. Deterministic stress test");
  console.log("-----------------------------");

  // Use the real position when there is one; otherwise show the engine on a 1 wETH example.
  const isHypothetical = position.collateralLegs.length === 0;
  const legs = isHypothetical
    ? [
        {
          symbol: COLLATERAL_SYMBOL,
          valueBase: collateral.priceBase,
          liquidationThresholdBps: collateral.liquidationThresholdBps,
          shockable: true,
        },
      ]
    : position.collateralLegs;

  if (isHypothetical) {
    console.log(`  (no on-chain collateral for this address, illustrating with 1 ${COLLATERAL_SYMBOL})\n`);
  }

  const proposedBorrowTokens = 400n * 10n ** BigInt(borrowAsset.decimals);
  const proposedBorrowBase = tokenAmountToBase(proposedBorrowTokens, borrowAsset.priceBase, borrowAsset.decimals);

  const shocks = market.degraded ? fallbackShocks() : deriveShocksFromMarket(market);
  const scenarios = buildScenarios({
    collateral: legs,
    existingDebtBase: position.totalDebtBase,
    additionalDebtBase: proposedBorrowBase,
    shocks,
  });

  console.log(`  proposed borrow      400 ${BORROW_SYMBOL}`);
  console.log("");
  console.log("  ETH move    Projected HF   Interpretation");
  for (const scenario of scenarios) {
    const move = `${(scenario.shockBps / 100).toFixed(2)}%`.padStart(9);
    const hf = formatHealthFactorWad(scenario.healthFactorWad).padStart(13);
    console.log(`  ${move} ${hf}   ${scenario.interpretation}`);
  }

  const liquidationShockBps = solveLiquidationShockBps({
    collateral: legs,
    existingDebtBase: position.totalDebtBase,
    additionalDebtBase: proposedBorrowBase,
  });
  console.log(
    `\n  liquidation point    ${liquidationShockBps === null ? "not reachable by an ETH move" : `${(liquidationShockBps / 100).toFixed(2)}%`}`,
  );

  const targetHealthFactorWad = (WAD * 12n) / 10n;
  const stressedMaxBase = solveStressedMaxBorrowBase({
    collateral: legs,
    existingDebtBase: position.totalDebtBase,
    shockBps: -2_000n,
    targetHealthFactorWad,
  });
  const cappedBase = isHypothetical
    ? stressedMaxBase
    : stressedMaxBase < position.availableBorrowsBase
      ? stressedMaxBase
      : position.availableBorrowsBase;

  console.log(
    `  stress-tested max    ${formatScaled(baseToTokenAmount(cappedBase, borrowAsset.priceBase, borrowAsset.decimals), borrowAsset.decimals)} ${BORROW_SYMBOL} (HF >= 1.20 after a 20% ETH fall)`,
  );
  console.log(
    `  Aave protocol max    ${formatScaled(baseToTokenAmount(position.availableBorrowsBase, borrowAsset.priceBase, borrowAsset.decimals), borrowAsset.decimals)} ${BORROW_SYMBOL}`,
  );

  console.log("\n5. Self-check against Aave's own health factor");
  console.log("-----------------------------------------------");
  const recomputed = projectedHealthFactorWad({
    collateral: position.collateralLegs,
    existingDebtBase: position.totalDebtBase,
  });
  const reconciliation = reconcileHealthFactor({
    recomputedWad: recomputed,
    aaveReportedWad: position.healthFactorWad,
  });
  console.log(`  Aave reported        ${formatHealthFactorWad(position.healthFactorWad, 6)}`);
  console.log(`  recomputed           ${formatHealthFactorWad(recomputed, 6)}`);
  console.log(`  matches              ${reconciliation.matches}`);

  if (!reconciliation.matches) {
    throw new Error("Recomputed health factor does not match Aave's. Collateral decomposition is wrong.");
  }

  if (position.borrowAssetLiquidity === 0n) {
    console.log(
      `\nNote: the ${BORROW_SYMBOL} reserve holds no liquidity, so borrowing will revert until the market is seeded.`,
    );
  }

  console.log("\nSmoke check passed.");
}

main().catch(error => {
  console.error("\nSmoke check failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
