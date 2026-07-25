/**
 * The Borrow Risk Assistant agent.
 *
 * A fixed tool sequence rather than an LLM: interpret the request, read the Aave
 * position, identify the ETH-correlated collateral, call the Binance Skill for market
 * context, choose scenarios from what that data actually shows, compute the projected
 * health factors, reconcile against Aave's own figure, and explain the result.
 *
 * Every step is recorded in a trace the caller can display, so the Binance Skill call is
 * visible rather than implied. Because no model is in the loop, no number in the output
 * can be invented — all of them come from the chain or from `utils/risk/stress.ts`.
 */
import type { Address } from "viem";
import { aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";
import {
  type AavePositionSnapshot,
  BORROW_SYMBOL,
  COLLATERAL_SYMBOL,
  collateralLegsCoverReportedTotal,
  readAavePosition,
} from "~~/services/aave/readPosition";
import {
  type EthMarketContext,
  buildDynamicUrl,
  buildKlineUrl,
  getEthMarketContext,
} from "~~/services/binance/ethMarket";
import {
  type CollateralLeg,
  type StressScenario,
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
} from "~~/utils/risk/stress";
import {
  DISCLAIMER,
  LIQUIDITY_WARNING,
  METHODOLOGY_NOTE,
  NO_COLLATERAL_EXPLANATION,
  ORACLE_DIVERGENCE_NOTE,
  OTHER_COLLATERAL_NOTE,
  PARTIAL_LIQUIDITY_WARNING,
  RECONCILIATION_WARNING,
  SOURCES,
} from "~~/utils/risk/wording";

export type AgentStep = {
  step: number;
  tool: string;
  detail: string;
  durationMs: number;
};

export type Amount = {
  /** Integer value in the smallest unit, as a string so no precision is lost in JSON. */
  raw: string;
  decimals: number;
  /** Human-readable decimal rendering of the same value. */
  formatted: string;
  symbol?: string;
};

export type HealthFactor = {
  /** WAD-scaled (1e18 = 1.0), or null when the position carries no debt. */
  raw: string | null;
  formatted: string;
};

export type ScenarioOutput = {
  label: string;
  ethPriceChangePercent: number;
  derivedFrom: StressScenario["derivedFrom"];
  projectedHealthFactor: HealthFactor;
  liquidatable: boolean;
  interpretation: string;
};

export type BorrowRiskReport = {
  market: {
    chainId: number;
    marketId: string;
    pool: Address;
    oracle: Address;
    blockNumber: string;
    collateralSymbol: string;
    borrowSymbol: string;
  };
  position: {
    address: Address;
    collateralSupplied: Amount;
    totalCollateralBase: Amount;
    totalDebtBase: Amount;
    existingBorrowAssetDebt: Amount;
    availableBorrowsBase: Amount;
    liquidationThresholdBps: number;
    ltvBps: number;
    currentHealthFactor: HealthFactor;
    hasOtherCollateral: boolean;
  };
  proposal: {
    protocolMaximum: Amount;
    proposedBorrow: Amount;
    exceedsProtocolMaximum: boolean;
    projectedHealthFactor: HealthFactor;
    /** ETH decline at which the projected position reaches a health factor of 1.0. */
    liquidationAtEthChangePercent: number | null;
  };
  stressTest: {
    targetHealthFactor: HealthFactor;
    shockEthPriceChangePercent: number;
    stressTestedMaximum: Amount;
    /** True when Aave's own limit, not the stress test, is the binding constraint. */
    cappedByProtocolMaximum: boolean;
  };
  scenarios: ScenarioOutput[];
  marketContext: {
    source: string;
    symbol: string;
    ethPriceUsd: number | null;
    change24hPercent: number | null;
    dailyVolatilityPercent: number;
    maxDrawdown30dPercent: number;
    candleCount: number;
    windowStart: string | null;
    windowEnd: string | null;
    asOf: string;
    degraded: boolean;
    degradedReason: string | null;
    endpoints: string[];
    authenticationRequired: false;
  };
  oracleDivergence: {
    aaveCollateralPrice: Amount;
    aaveBorrowAssetPrice: Amount;
    binanceEthPriceUsd: number | null;
    note: string;
  };
  selfCheck: {
    aaveReportedHealthFactor: HealthFactor;
    recomputedHealthFactor: HealthFactor;
    matches: boolean;
    differenceBps: number | null;
    note: string;
  };
  warnings: string[];
  explanation: string;
  methodology: string;
  steps: AgentStep[];
  sources: string[];
  disclaimer: string;
};

function amount(value: bigint, decimals: number, symbol?: string, precision = 2): Amount {
  return { raw: value.toString(), decimals, formatted: formatScaled(value, decimals, precision), symbol };
}

function healthFactor(value: bigint | null): HealthFactor {
  return { raw: value === null ? null : value.toString(), formatted: formatHealthFactorWad(value) };
}

function percentFromBps(bps: number): number {
  return Number((bps / 100).toFixed(2));
}

function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export class StepRecorder {
  private steps: AgentStep[] = [];

  async run<T>(tool: string, detail: string | ((result: T) => string), fn: () => Promise<T> | T): Promise<T> {
    const startedAt = Date.now();
    const result = await fn();
    this.steps.push({
      step: this.steps.length + 1,
      tool,
      detail: typeof detail === "function" ? detail(result) : detail,
      durationMs: Date.now() - startedAt,
    });
    return result;
  }

  record(tool: string, detail: string): void {
    this.steps.push({ step: this.steps.length + 1, tool, detail, durationMs: 0 });
  }

  all(): AgentStep[] {
    return this.steps;
  }
}

export type BorrowRiskRequest = {
  user: Address;
  /** Proposed borrow in dNZD base units (6 decimals). */
  proposedBorrowTokens: bigint;
  targetHealthFactorWad: bigint;
  /** Signed basis points, e.g. -2000 for a 20% ETH decline. */
  stressShockBps: number;
};

export async function runBorrowRiskAssistant(request: BorrowRiskRequest): Promise<BorrowRiskReport> {
  const recorder = new StepRecorder();

  recorder.record(
    "interpret-request",
    `Assess a proposed borrow of ${formatScaled(request.proposedBorrowTokens, aaveHackathonMnzdConfig.assets[BORROW_SYMBOL].decimals)} ${BORROW_SYMBOL} ` +
      `against a target health factor of ${formatHealthFactorWad(request.targetHealthFactorWad)} after a ` +
      `${Math.abs(percentFromBps(request.stressShockBps))}% ETH decline.`,
  );

  const position = await recorder.run<AavePositionSnapshot>(
    "read-aave-position",
    result =>
      `Read Aave Pool ${result.poolAddress} at block ${result.blockNumber}: collateral ` +
      `${formatScaled(result.totalCollateralBase, 8)} base, debt ${formatScaled(result.totalDebtBase, 8)} base, ` +
      `liquidation threshold ${result.currentLiquidationThresholdBps} bps.`,
    () => readAavePosition(request.user),
  );

  const shockableLegs = position.collateralLegs.filter(leg => leg.shockable);
  const otherLegs = position.collateralLegs.filter(leg => !leg.shockable);

  recorder.record(
    "identify-collateral",
    shockableLegs.length > 0
      ? `ETH-correlated collateral: ${shockableLegs.map(l => l.symbol).join(", ")}. ` +
          (otherLegs.length > 0
            ? `Held at current value: ${otherLegs.map(l => l.symbol).join(", ")}.`
            : "No other collateral.")
      : "No ETH-correlated collateral supplied.",
  );

  const marketContext = await recorder.run<EthMarketContext>(
    "binance-skill:query-token-info",
    result =>
      result.degraded
        ? `Binance market data unavailable (${result.degradedReason}); falling back to fixed scenarios.`
        : `Called public endpoints dynamic + kline for WETH: price US$${result.priceUsd?.toFixed(2)}, ` +
          `24h ${result.change24hPercent}%, daily volatility ${result.dailySigmaPercent}%, ` +
          `deepest 30-day drawdown ${result.maxDrawdown30dPercent}% over ${result.candleCount} candles.`,
    () => getEthMarketContext(),
  );

  const shocks = marketContext.degraded ? fallbackShocks() : deriveShocksFromMarket(marketContext);

  recorder.record(
    "select-scenarios",
    marketContext.degraded
      ? `Selected ${shocks.length} fixed fallback scenarios because live market data was unavailable.`
      : `Derived ${shocks.length} scenarios from observed behaviour: 1σ and 2σ daily moves, a 7-day 2σ move, ` +
          `the observed 30-day drawdown, and a fixed severe reference.`,
  );

  return buildBorrowRiskReport({ request, position, marketContext, shocks, recorder });
}

/**
 * Assemble the report from already-gathered inputs.
 *
 * Split out from the fetching so the whole output shape can be tested against fixed
 * inputs, with no chain and no network.
 */
export function buildBorrowRiskReport(params: {
  request: BorrowRiskRequest;
  position: AavePositionSnapshot;
  marketContext: EthMarketContext;
  shocks: { label: string; shockBps: number; derivedFrom: StressScenario["derivedFrom"] }[];
  recorder?: StepRecorder;
}): BorrowRiskReport {
  const { request, position, marketContext, shocks } = params;
  const recorder = params.recorder ?? new StepRecorder();

  const collateralReserve = position.reserves[COLLATERAL_SYMBOL];
  const borrowReserve = position.reserves[BORROW_SYMBOL];
  const borrowDecimals = borrowReserve.decimals;

  const proposedBorrowBase = tokenAmountToBase(request.proposedBorrowTokens, borrowReserve.priceBase, borrowDecimals);
  const legs: CollateralLeg[] = position.collateralLegs;

  const projected = projectedHealthFactorWad({
    collateral: legs,
    existingDebtBase: position.totalDebtBase,
    additionalDebtBase: proposedBorrowBase,
  });

  const scenarios = buildScenarios({
    collateral: legs,
    existingDebtBase: position.totalDebtBase,
    additionalDebtBase: proposedBorrowBase,
    shocks,
  });

  const liquidationShockBps = solveLiquidationShockBps({
    collateral: legs,
    existingDebtBase: position.totalDebtBase,
    additionalDebtBase: proposedBorrowBase,
  });

  const stressedMaxBase = solveStressedMaxBorrowBase({
    collateral: legs,
    existingDebtBase: position.totalDebtBase,
    shockBps: BigInt(request.stressShockBps),
    targetHealthFactorWad: request.targetHealthFactorWad,
  });

  // Never recommend more than the protocol itself permits, whatever the stress test says.
  const cappedStressedMaxBase = minBigInt(stressedMaxBase, position.availableBorrowsBase);
  const cappedByProtocolMaximum = stressedMaxBase > position.availableBorrowsBase;

  const protocolMaximumTokens = baseToTokenAmount(
    position.availableBorrowsBase,
    borrowReserve.priceBase,
    borrowDecimals,
  );
  const stressedMaximumTokens = baseToTokenAmount(cappedStressedMaxBase, borrowReserve.priceBase, borrowDecimals);

  const recomputedCurrent = projectedHealthFactorWad({
    collateral: legs,
    existingDebtBase: position.totalDebtBase,
  });
  const reconciliation = reconcileHealthFactor({
    recomputedWad: recomputedCurrent,
    aaveReportedWad: position.healthFactorWad,
  });

  recorder.record(
    "compute-stress",
    `Computed ${scenarios.length} projected health factors, the stress-tested maximum ` +
      `(${formatScaled(stressedMaximumTokens, borrowDecimals)} ${BORROW_SYMBOL}) and the liquidation point ` +
      `(${liquidationShockBps === null ? "not reachable by an ETH move" : `${percentFromBps(liquidationShockBps)}%`}).`,
  );

  recorder.record(
    "reconcile-with-aave",
    reconciliation.matches
      ? `Recomputed health factor matches the value Aave reports (${formatHealthFactorWad(position.healthFactorWad)}).`
      : `Recomputed health factor ${formatHealthFactorWad(recomputedCurrent)} differs from Aave's ` +
          `${formatHealthFactorWad(position.healthFactorWad)} by ${reconciliation.differenceBps} bps.`,
  );

  const warnings = collectWarnings({ position, borrowDecimals, reconciliationMatches: reconciliation.matches, legs });

  const explanation = buildExplanation({
    position,
    borrowDecimals,
    protocolMaximumTokens,
    proposedBorrowTokens: request.proposedBorrowTokens,
    projected,
    liquidationShockBps,
    stressedMaximumTokens,
    targetHealthFactorWad: request.targetHealthFactorWad,
    stressShockBps: request.stressShockBps,
    marketContext,
    cappedByProtocolMaximum,
  });

  recorder.record("explain", "Rendered a plain-language summary from the computed figures.");

  return {
    market: {
      chainId: position.chainId,
      marketId: aaveHackathonMnzdConfig.marketId,
      pool: position.poolAddress,
      oracle: position.oracleAddress,
      blockNumber: position.blockNumber.toString(),
      collateralSymbol: COLLATERAL_SYMBOL,
      borrowSymbol: BORROW_SYMBOL,
    },
    position: {
      address: position.user,
      collateralSupplied: amount(collateralReserve.suppliedBalance, collateralReserve.decimals, COLLATERAL_SYMBOL, 6),
      totalCollateralBase: amount(position.totalCollateralBase, 8),
      totalDebtBase: amount(position.totalDebtBase, 8),
      existingBorrowAssetDebt: amount(position.borrowAssetDebt, borrowDecimals, BORROW_SYMBOL),
      availableBorrowsBase: amount(position.availableBorrowsBase, 8),
      liquidationThresholdBps: Number(position.currentLiquidationThresholdBps),
      ltvBps: Number(position.ltvBps),
      currentHealthFactor: healthFactor(position.healthFactorWad),
      hasOtherCollateral: legs.some(leg => !leg.shockable),
    },
    proposal: {
      protocolMaximum: amount(protocolMaximumTokens, borrowDecimals, BORROW_SYMBOL),
      proposedBorrow: amount(request.proposedBorrowTokens, borrowDecimals, BORROW_SYMBOL),
      exceedsProtocolMaximum: proposedBorrowBase > position.availableBorrowsBase,
      projectedHealthFactor: healthFactor(projected),
      liquidationAtEthChangePercent: liquidationShockBps === null ? null : percentFromBps(liquidationShockBps),
    },
    stressTest: {
      targetHealthFactor: healthFactor(request.targetHealthFactorWad),
      shockEthPriceChangePercent: percentFromBps(request.stressShockBps),
      stressTestedMaximum: amount(stressedMaximumTokens, borrowDecimals, BORROW_SYMBOL),
      cappedByProtocolMaximum,
    },
    scenarios: scenarios.map(scenario => ({
      label: scenario.label,
      ethPriceChangePercent: percentFromBps(scenario.shockBps),
      derivedFrom: scenario.derivedFrom,
      projectedHealthFactor: healthFactor(scenario.healthFactorWad),
      liquidatable: scenario.liquidatable,
      interpretation: scenario.interpretation,
    })),
    marketContext: {
      source: marketContext.source,
      symbol: marketContext.symbol,
      ethPriceUsd: marketContext.priceUsd,
      change24hPercent: marketContext.change24hPercent,
      dailyVolatilityPercent: marketContext.dailySigmaPercent,
      maxDrawdown30dPercent: marketContext.maxDrawdown30dPercent,
      candleCount: marketContext.candleCount,
      windowStart: marketContext.windowStart,
      windowEnd: marketContext.windowEnd,
      asOf: marketContext.asOf,
      degraded: marketContext.degraded,
      degradedReason: marketContext.degradedReason,
      endpoints: [buildDynamicUrl(), buildKlineUrl()],
      authenticationRequired: false,
    },
    oracleDivergence: {
      aaveCollateralPrice: amount(collateralReserve.priceBase, 8, COLLATERAL_SYMBOL),
      aaveBorrowAssetPrice: amount(borrowReserve.priceBase, 8, BORROW_SYMBOL),
      binanceEthPriceUsd: marketContext.priceUsd,
      note: ORACLE_DIVERGENCE_NOTE,
    },
    selfCheck: {
      aaveReportedHealthFactor: healthFactor(position.healthFactorWad),
      recomputedHealthFactor: healthFactor(recomputedCurrent),
      matches: reconciliation.matches,
      differenceBps: reconciliation.differenceBps,
      note: "The per-asset model is recomputed and compared against the health factor Aave itself reports.",
    },
    warnings,
    explanation,
    methodology: METHODOLOGY_NOTE,
    steps: recorder.all(),
    sources: [SOURCES.aavePosition, SOURCES.aaveOracle, SOURCES.binance, SOURCES.engine],
    disclaimer: DISCLAIMER,
  };
}

function collectWarnings(params: {
  position: AavePositionSnapshot;
  borrowDecimals: number;
  reconciliationMatches: boolean;
  legs: CollateralLeg[];
}): string[] {
  const { position, borrowDecimals, reconciliationMatches, legs } = params;
  const warnings: string[] = [];

  if (position.borrowAssetLiquidity === 0n) {
    warnings.push(LIQUIDITY_WARNING(BORROW_SYMBOL));
  } else {
    const availableBase = tokenAmountToBase(
      position.borrowAssetLiquidity,
      position.reserves[BORROW_SYMBOL].priceBase,
      borrowDecimals,
    );
    if (availableBase < position.availableBorrowsBase) {
      warnings.push(
        PARTIAL_LIQUIDITY_WARNING(BORROW_SYMBOL, formatScaled(position.borrowAssetLiquidity, borrowDecimals)),
      );
    }
  }

  if (legs.some(leg => !leg.shockable)) {
    warnings.push(OTHER_COLLATERAL_NOTE);
  }

  if (!reconciliationMatches) {
    warnings.push(RECONCILIATION_WARNING);
  }

  if (!collateralLegsCoverReportedTotal(position)) {
    warnings.push(
      "Aave counts a different collateral total than the sum of your supplied balances, which usually means a " +
        "reserve is not enabled as collateral for this wallet.",
    );
  }

  return warnings;
}

function buildExplanation(params: {
  position: AavePositionSnapshot;
  borrowDecimals: number;
  protocolMaximumTokens: bigint;
  proposedBorrowTokens: bigint;
  projected: bigint | null;
  liquidationShockBps: number | null;
  stressedMaximumTokens: bigint;
  targetHealthFactorWad: bigint;
  stressShockBps: number;
  marketContext: EthMarketContext;
  cappedByProtocolMaximum: boolean;
}): string {
  const {
    position,
    borrowDecimals,
    protocolMaximumTokens,
    proposedBorrowTokens,
    projected,
    liquidationShockBps,
    stressedMaximumTokens,
    targetHealthFactorWad,
    stressShockBps,
    marketContext,
    cappedByProtocolMaximum,
  } = params;

  if (position.collateralLegs.length === 0) {
    return NO_COLLATERAL_EXPLANATION;
  }

  const sentences: string[] = [];
  const fmt = (value: bigint) => formatScaled(value, borrowDecimals);
  const shockPercent = Math.abs(percentFromBps(stressShockBps));

  sentences.push(
    `Aave permits you to borrow up to ${fmt(protocolMaximumTokens)} ${BORROW_SYMBOL} against your current collateral.`,
  );

  if (proposedBorrowTokens > 0n) {
    sentences.push(
      `Borrowing ${fmt(proposedBorrowTokens)} ${BORROW_SYMBOL} would leave a projected health factor of ` +
        `${formatHealthFactorWad(projected)}.`,
    );
  } else {
    sentences.push(`You have not entered a borrow amount yet, so the scenarios below reflect your existing position.`);
  }

  if (marketContext.degraded) {
    sentences.push(
      "Live market data was unavailable, so the scenarios below use fixed reference declines rather than recent " +
        "ETH behaviour.",
    );
  } else {
    sentences.push(
      `Over the last ${marketContext.candleCount} days ETH moved about ${marketContext.dailySigmaPercent}% per ` +
        `day, with a deepest peak-to-trough fall of ${Math.abs(marketContext.maxDrawdown30dPercent)}%.`,
    );
  }

  if (liquidationShockBps !== null) {
    sentences.push(
      `On these figures, ETH would need to fall about ${Math.abs(percentFromBps(liquidationShockBps))}% before this ` +
        `position could be liquidated.`,
    );
  } else if (
    position.totalDebtBase +
      tokenAmountToBase(proposedBorrowTokens, position.reserves[BORROW_SYMBOL].priceBase, borrowDecimals) >
    0n
  ) {
    sentences.push("No ETH decline alone would bring this position to a health factor of 1.");
  }

  if (stressedMaximumTokens > 0n) {
    sentences.push(
      `To keep the projected health factor at or above ${formatHealthFactorWad(targetHealthFactorWad)} after a ` +
        `${shockPercent}% ETH decline, the stress-tested amount is about ${fmt(stressedMaximumTokens)} ` +
        `${BORROW_SYMBOL}${cappedByProtocolMaximum ? ", which is the protocol limit rather than the stress limit" : ""}.`,
    );
  } else {
    sentences.push(
      `A ${shockPercent}% ETH decline would leave no room to borrow while holding a health factor of ` +
        `${formatHealthFactorWad(targetHealthFactorWad)}.`,
    );
  }

  return sentences.join(" ");
}
