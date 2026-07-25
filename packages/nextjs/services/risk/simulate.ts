/**
 * Stateless stress simulation for an arbitrary, caller-supplied position.
 *
 * No chain reads, no wallet, no dependency on our market: the caller passes collateral
 * legs, debt and liquidation thresholds already denominated in a common base currency.
 * That makes the same engine usable against any Aave-compatible market, which is the
 * point of exposing it publicly.
 */
import type { CollateralLegInput } from "~~/services/api/validate";
import { type EthMarketContext, getEthMarketContext } from "~~/services/binance/ethMarket";
import {
  type StressScenario,
  buildScenarios,
  deriveShocksFromMarket,
  fallbackShocks,
  formatHealthFactorWad,
  formatScaled,
  projectedHealthFactorWad,
  solveLiquidationShockBps,
  solveStressedMaxBorrowBase,
} from "~~/utils/risk/stress";
import { DISCLAIMER, METHODOLOGY_NOTE, SOURCES } from "~~/utils/risk/wording";

export type SimulationRequest = {
  collateral: CollateralLegInput[];
  existingDebtBase: bigint;
  proposedBorrowBase: bigint;
  targetHealthFactorWad: bigint;
  stressShockBps: number;
  /** Decimals of the shared base currency the caller expressed values in. */
  baseDecimals: number;
  /** Explicit scenarios. When omitted, they are derived from live Binance market data. */
  shocksBps: number[] | null;
};

export type SimulationResult = {
  input: {
    collateral: { symbol: string; valueBase: string; liquidationThresholdBps: number; shockable: boolean }[];
    existingDebtBase: string;
    proposedBorrowBase: string;
    baseDecimals: number;
  };
  projectedHealthFactor: { raw: string | null; formatted: string };
  liquidationAtEthChangePercent: number | null;
  stressTest: {
    targetHealthFactor: { raw: string; formatted: string };
    shockEthPriceChangePercent: number;
    stressTestedMaximumBase: string;
    stressTestedMaximumFormatted: string;
  };
  scenarios: {
    label: string;
    ethPriceChangePercent: number;
    derivedFrom: StressScenario["derivedFrom"];
    projectedHealthFactor: { raw: string | null; formatted: string };
    liquidatable: boolean;
    interpretation: string;
  }[];
  scenarioSource: "caller-supplied" | "binance-market-data" | "fixed-fallback";
  marketContext: {
    source: string;
    ethPriceUsd: number | null;
    dailyVolatilityPercent: number;
    maxDrawdown30dPercent: number;
    asOf: string;
    degraded: boolean;
  } | null;
  methodology: string;
  sources: string[];
  disclaimer: string;
};

export async function runSimulation(request: SimulationRequest): Promise<SimulationResult> {
  const {
    collateral,
    existingDebtBase,
    proposedBorrowBase,
    targetHealthFactorWad,
    stressShockBps,
    baseDecimals,
    shocksBps,
  } = request;

  let marketContext: EthMarketContext | null = null;
  let shocks: { label: string; shockBps: number; derivedFrom: StressScenario["derivedFrom"] }[];
  let scenarioSource: SimulationResult["scenarioSource"];

  if (shocksBps) {
    // Caller chose the scenarios, so there is no reason to call Binance at all.
    shocks = [
      { label: "Current price", shockBps: 0, derivedFrom: "current" as const },
      ...shocksBps.map(shockBps => ({
        label: `Falls ${Math.abs(shockBps / 100)}%`,
        shockBps,
        derivedFrom: "user" as const,
      })),
    ];
    scenarioSource = "caller-supplied";
  } else {
    marketContext = await getEthMarketContext();
    shocks = marketContext.degraded ? fallbackShocks() : deriveShocksFromMarket(marketContext);
    scenarioSource = marketContext.degraded ? "fixed-fallback" : "binance-market-data";
  }

  const legs = collateral.map(leg => ({
    symbol: leg.symbol,
    valueBase: leg.valueBase,
    liquidationThresholdBps: leg.liquidationThresholdBps,
    shockable: leg.shockable,
  }));

  const projected = projectedHealthFactorWad({
    collateral: legs,
    existingDebtBase,
    additionalDebtBase: proposedBorrowBase,
  });

  const scenarios = buildScenarios({
    collateral: legs,
    existingDebtBase,
    additionalDebtBase: proposedBorrowBase,
    shocks,
  });

  const liquidationShockBps = solveLiquidationShockBps({
    collateral: legs,
    existingDebtBase,
    additionalDebtBase: proposedBorrowBase,
  });

  const stressedMaximumBase = solveStressedMaxBorrowBase({
    collateral: legs,
    existingDebtBase,
    shockBps: BigInt(stressShockBps),
    targetHealthFactorWad,
  });

  return {
    input: {
      collateral: legs.map(leg => ({
        symbol: leg.symbol,
        valueBase: leg.valueBase.toString(),
        liquidationThresholdBps: Number(leg.liquidationThresholdBps),
        shockable: leg.shockable,
      })),
      existingDebtBase: existingDebtBase.toString(),
      proposedBorrowBase: proposedBorrowBase.toString(),
      baseDecimals,
    },
    projectedHealthFactor: {
      raw: projected === null ? null : projected.toString(),
      formatted: formatHealthFactorWad(projected),
    },
    liquidationAtEthChangePercent: liquidationShockBps === null ? null : Number((liquidationShockBps / 100).toFixed(2)),
    stressTest: {
      targetHealthFactor: {
        raw: targetHealthFactorWad.toString(),
        formatted: formatHealthFactorWad(targetHealthFactorWad),
      },
      shockEthPriceChangePercent: Number((stressShockBps / 100).toFixed(2)),
      stressTestedMaximumBase: stressedMaximumBase.toString(),
      stressTestedMaximumFormatted: formatScaled(stressedMaximumBase, baseDecimals),
    },
    scenarios: scenarios.map(scenario => ({
      label: scenario.label,
      ethPriceChangePercent: Number((scenario.shockBps / 100).toFixed(2)),
      derivedFrom: scenario.derivedFrom,
      projectedHealthFactor: {
        raw: scenario.healthFactorWad === null ? null : scenario.healthFactorWad.toString(),
        formatted: formatHealthFactorWad(scenario.healthFactorWad),
      },
      liquidatable: scenario.liquidatable,
      interpretation: scenario.interpretation,
    })),
    scenarioSource,
    marketContext: marketContext
      ? {
          source: marketContext.source,
          ethPriceUsd: marketContext.priceUsd,
          dailyVolatilityPercent: marketContext.dailySigmaPercent,
          maxDrawdown30dPercent: marketContext.maxDrawdown30dPercent,
          asOf: marketContext.asOf,
          degraded: marketContext.degraded,
        }
      : null,
    methodology: METHODOLOGY_NOTE,
    sources: shocksBps ? [SOURCES.engine] : [SOURCES.binance, SOURCES.engine],
    disclaimer: DISCLAIMER,
  };
}

/** Exported for the openapi example and tests. */
export const SIMULATE_EXAMPLE_REQUEST = {
  collateral: [{ symbol: "WETH", valueBase: "180000000000", liquidationThresholdBps: 8600, shockable: true }],
  debtBase: "0",
  proposedBorrowBase: "40000000000",
  targetHealthFactor: "1.2",
  shockPercent: 20,
  baseDecimals: 8,
};
