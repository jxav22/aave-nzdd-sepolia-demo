/**
 * Deterministic borrow stress-testing math.
 *
 * Pure integer arithmetic over Aave base-currency units, no I/O, no floats in the
 * core path, no dependency on the caller's market. Every figure the Borrow Risk
 * Assistant reports comes from here so that nothing downstream (UI, API, or an LLM
 * summarising the result) can invent a number.
 *
 * Units:
 *  - `*Base` values are Aave base-currency units (8 decimals for this market).
 *  - `*Bps` values are basis points; shocks are signed, so -2000 means "ETH falls 20%".
 *  - Health factors are WAD-scaled (1e18 = 1.0), matching `getUserAccountData`.
 */

export const BPS = 10_000n;
export const WAD = 10n ** 18n;

/** Aave prices and base-currency totals both use 8 decimals in this market. */
export const AAVE_BASE_DECIMALS = 8;

/**
 * One collateral position, already converted to base currency.
 *
 * `shockable` marks the legs a given price shock applies to. Only ETH-correlated
 * collateral is shocked; a stablecoin leg holds its value in the same scenario.
 */
export type CollateralLeg = {
  symbol: string;
  valueBase: bigint;
  liquidationThresholdBps: bigint;
  shockable: boolean;
};

export type ScenarioSource = "current" | "volatility" | "drawdown" | "reference" | "user" | "fallback";

export type StressScenario = {
  label: string;
  shockBps: number;
  derivedFrom: ScenarioSource;
  /** Null when the position carries no debt, which Aave reports as an infinite health factor. */
  healthFactorWad: bigint | null;
  liquidatable: boolean;
  interpretation: string;
};

function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/** Integer division rounding toward +infinity, so conservative bounds stay conservative. */
function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new Error("ceilDiv: division by zero");
  }
  const quotient = numerator / denominator;
  const hasRemainder = quotient * denominator !== numerator;
  const isPositive = numerator > 0n === denominator > 0n;
  return hasRemainder && isPositive ? quotient + 1n : quotient;
}

/**
 * Sum of `value x liquidationThreshold` across legs, scaled by BPS^2 so the whole
 * calculation divides exactly once. Dividing per-leg would compound truncation error.
 */
function liquidationValueNumerator(collateral: CollateralLeg[], shockBps: bigint): bigint {
  let numerator = 0n;
  for (const leg of collateral) {
    const factor = leg.shockable ? maxBigInt(0n, BPS + shockBps) : BPS;
    numerator += leg.valueBase * factor * leg.liquidationThresholdBps;
  }
  return numerator;
}

/**
 * Collateral value weighted by each asset's liquidation threshold, after applying
 * `shockBps` to the shockable legs. This is the numerator of Aave's health factor.
 */
export function liquidationValueBase(collateral: CollateralLeg[], shockBps: bigint): bigint {
  return liquidationValueNumerator(collateral, shockBps) / (BPS * BPS);
}

/** Plain collateral value after the shock, ignoring liquidation thresholds. */
export function shockedCollateralBase(collateral: CollateralLeg[], shockBps: bigint): bigint {
  let total = 0n;
  for (const leg of collateral) {
    const factor = leg.shockable ? maxBigInt(0n, BPS + shockBps) : BPS;
    total += (leg.valueBase * factor) / BPS;
  }
  return total;
}

/**
 * Health factor after applying a price shock and optionally taking on more debt.
 *
 * Returns null for a debt-free position: Aave reports `maxUint256` there, and
 * propagating null keeps callers from formatting that sentinel as a real number.
 */
export function projectedHealthFactorWad(params: {
  collateral: CollateralLeg[];
  existingDebtBase: bigint;
  additionalDebtBase?: bigint;
  shockBps?: bigint;
}): bigint | null {
  const { collateral, existingDebtBase, additionalDebtBase = 0n, shockBps = 0n } = params;
  const totalDebtBase = existingDebtBase + additionalDebtBase;

  if (totalDebtBase <= 0n) {
    return null;
  }

  return (liquidationValueBase(collateral, shockBps) * WAD) / totalDebtBase;
}

/**
 * The ETH price move at which the health factor reaches exactly 1.0.
 *
 * Solved in closed form from `A x (BPS + x) + B x BPS >= debt x BPS^2`, where A and B
 * are the shockable and non-shockable liquidation-weighted values. Returns null when
 * no ETH decline can trigger liquidation, either there is no debt, no ETH-correlated
 * collateral, or the unshockable collateral alone already covers the debt.
 */
export function solveLiquidationShockBps(params: {
  collateral: CollateralLeg[];
  existingDebtBase: bigint;
  additionalDebtBase?: bigint;
}): number | null {
  const { collateral, existingDebtBase, additionalDebtBase = 0n } = params;
  const totalDebtBase = existingDebtBase + additionalDebtBase;

  if (totalDebtBase <= 0n) {
    return null;
  }

  let shockableWeighted = 0n;
  let fixedWeighted = 0n;
  for (const leg of collateral) {
    const weighted = leg.valueBase * leg.liquidationThresholdBps;
    if (leg.shockable) {
      shockableWeighted += weighted;
    } else {
      fixedWeighted += weighted;
    }
  }

  if (shockableWeighted <= 0n) {
    return null;
  }

  // Rounding up reports liquidation at a slightly smaller decline than the exact
  // threshold, which is the conservative direction for a risk warning.
  const threshold = ceilDiv(totalDebtBase * BPS * BPS - fixedWeighted * BPS, shockableWeighted) - BPS;

  if (threshold <= -BPS) {
    return null;
  }

  return Number(threshold);
}

/**
 * Largest additional borrow that still leaves the health factor at or above
 * `targetHealthFactorWad` once `shockBps` is applied. Never negative.
 */
export function solveStressedMaxBorrowBase(params: {
  collateral: CollateralLeg[];
  existingDebtBase: bigint;
  shockBps: bigint;
  targetHealthFactorWad: bigint;
}): bigint {
  const { collateral, existingDebtBase, shockBps, targetHealthFactorWad } = params;

  if (targetHealthFactorWad <= 0n) {
    throw new Error("solveStressedMaxBorrowBase: target health factor must be positive");
  }

  const maxTotalDebtBase = (liquidationValueBase(collateral, shockBps) * WAD) / targetHealthFactorWad;
  return maxBigInt(0n, maxTotalDebtBase - existingDebtBase);
}

/** Plain-language reading of a health factor. Deliberately avoids the word "safe". */
export function interpretHealthFactor(healthFactorWad: bigint | null): string {
  if (healthFactorWad === null) {
    return "No debt";
  }
  if (healthFactorWad < WAD) {
    return "Liquidatable";
  }
  if (healthFactorWad < (WAD * 110n) / 100n) {
    return "Very small liquidation buffer";
  }
  if (healthFactorWad < (WAD * 125n) / 100n) {
    return "Small liquidation buffer";
  }
  if (healthFactorWad < (WAD * 150n) / 100n) {
    return "Moderate liquidation buffer";
  }
  if (healthFactorWad < (WAD * 200n) / 100n) {
    return "Comfortable liquidation buffer";
  }
  return "Large liquidation buffer";
}

/**
 * Build the stress table. The caller supplies the shocks so that scenario
 * selection stays separable from, and testable independently of, the arithmetic.
 */
export function buildScenarios(params: {
  collateral: CollateralLeg[];
  existingDebtBase: bigint;
  additionalDebtBase?: bigint;
  shocks: { label: string; shockBps: number; derivedFrom: ScenarioSource }[];
}): StressScenario[] {
  const { collateral, existingDebtBase, additionalDebtBase = 0n, shocks } = params;

  return shocks.map(({ label, shockBps, derivedFrom }) => {
    const healthFactorWad = projectedHealthFactorWad({
      collateral,
      existingDebtBase,
      additionalDebtBase,
      shockBps: BigInt(shockBps),
    });

    return {
      label,
      shockBps,
      derivedFrom,
      healthFactorWad,
      liquidatable: healthFactorWad !== null && healthFactorWad < WAD,
      interpretation: interpretHealthFactor(healthFactorWad),
    };
  });
}

export type MarketStats = {
  dailySigmaPercent: number;
  maxDrawdown30dPercent: number;
};

/**
 * Derive stress scenarios from observed ETH behaviour rather than hard-coding them.
 *
 * One- and two-sigma daily moves describe ordinary volatility, the seven-day
 * two-sigma move (sigma x sqrt(7)) describes a sustained slide, and the observed
 * 30-day drawdown is what actually happened. A fixed -25% anchor is always included
 * so the table still shows a severe case during a calm month.
 */
export function deriveShocksFromMarket(
  stats: MarketStats,
): { label: string; shockBps: number; derivedFrom: ScenarioSource }[] {
  const sigma = Math.abs(stats.dailySigmaPercent);
  const drawdown = -Math.abs(stats.maxDrawdown30dPercent);

  const candidates: { label: string; shockBps: number; derivedFrom: ScenarioSource }[] = [
    { label: "Current price", shockBps: 0, derivedFrom: "current" },
    {
      label: `1-day 1 sigma move (-${sigma.toFixed(1)}%)`,
      shockBps: Math.round(-sigma * 100),
      derivedFrom: "volatility",
    },
    {
      label: `1-day 2 sigma move (-${(sigma * 2).toFixed(1)}%)`,
      shockBps: Math.round(-sigma * 2 * 100),
      derivedFrom: "volatility",
    },
    {
      label: `7-day 2 sigma move (-${(sigma * 2 * Math.sqrt(7)).toFixed(1)}%)`,
      shockBps: Math.round(-sigma * 2 * Math.sqrt(7) * 100),
      derivedFrom: "volatility",
    },
    {
      label: `Observed 30-day drawdown (${drawdown.toFixed(1)}%)`,
      shockBps: Math.round(drawdown * 100),
      derivedFrom: "drawdown",
    },
    { label: "Severe reference (-25%)", shockBps: -2500, derivedFrom: "reference" },
  ];

  return dedupeAndSortShocks(candidates);
}

/** Fixed scenarios used when live market data is unavailable, so the API still responds. */
export function fallbackShocks(): { label: string; shockBps: number; derivedFrom: ScenarioSource }[] {
  return [
    { label: "Current price", shockBps: 0, derivedFrom: "current" },
    { label: "Falls 10%", shockBps: -1000, derivedFrom: "fallback" },
    { label: "Falls 20%", shockBps: -2000, derivedFrom: "fallback" },
    { label: "Falls 30%", shockBps: -3000, derivedFrom: "fallback" },
  ];
}

/** Drop duplicate shocks (a calm month can collapse two scenarios) and order worst-last. */
export function dedupeAndSortShocks<T extends { shockBps: number }>(shocks: T[]): T[] {
  const seen = new Set<number>();
  const unique: T[] = [];
  for (const shock of shocks) {
    if (seen.has(shock.shockBps)) {
      continue;
    }
    seen.add(shock.shockBps);
    unique.push(shock);
  }
  return unique.sort((a, b) => b.shockBps - a.shockBps);
}

/** Convert a base-currency amount into token units using an 8-decimal oracle price. */
export function baseToTokenAmount(valueBase: bigint, priceBase: bigint, tokenDecimals: number): bigint {
  if (priceBase <= 0n) {
    throw new Error("baseToTokenAmount: price must be positive");
  }
  return (valueBase * 10n ** BigInt(tokenDecimals)) / priceBase;
}

/** Convert a token amount into base-currency units using an 8-decimal oracle price. */
export function tokenAmountToBase(amount: bigint, priceBase: bigint, tokenDecimals: number): bigint {
  return (amount * priceBase) / 10n ** BigInt(tokenDecimals);
}

/**
 * Confirm our per-asset model reproduces the health factor Aave itself reports.
 *
 * Aave computes this from the same inputs, so a mismatch beyond rounding means our
 * collateral decomposition is wrong and the whole stress table should be distrusted.
 * Surfaced in the API response rather than kept as a test-only assertion.
 */
export function reconcileHealthFactor(params: {
  recomputedWad: bigint | null;
  aaveReportedWad: bigint | null;
  toleranceBps?: bigint;
}): { matches: boolean; differenceBps: number | null } {
  const { recomputedWad, aaveReportedWad, toleranceBps = 10n } = params;

  if (recomputedWad === null || aaveReportedWad === null) {
    return { matches: recomputedWad === aaveReportedWad, differenceBps: null };
  }

  if (aaveReportedWad === 0n) {
    return { matches: recomputedWad === 0n, differenceBps: null };
  }

  const difference =
    recomputedWad > aaveReportedWad ? recomputedWad - aaveReportedWad : aaveReportedWad - recomputedWad;
  const differenceBps = (difference * BPS) / aaveReportedWad;

  return { matches: differenceBps <= toleranceBps, differenceBps: Number(differenceBps) };
}

/** Format a WAD health factor for display, trimming to `precision` fractional digits. */
export function formatHealthFactorWad(healthFactorWad: bigint | null, precision = 2): string {
  if (healthFactorWad === null) {
    return "∞";
  }
  const whole = healthFactorWad / WAD;
  const fraction = healthFactorWad % WAD;
  const fractionDigits = fraction.toString().padStart(18, "0").slice(0, precision).replace(/0+$/, "");

  return fractionDigits ? `${whole}.${fractionDigits}` : whole.toString();
}

/** Format an integer-scaled amount as a decimal string without going through a float. */
export function formatScaled(value: bigint, decimals: number, precision = 2): string {
  const unit = 10n ** BigInt(decimals);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / unit;
  const fraction = absolute % unit;
  const fractionDigits = fraction.toString().padStart(decimals, "0").slice(0, precision).replace(/0+$/, "");

  const body = fractionDigits ? `${whole}.${fractionDigits}` : whole.toString();
  return negative ? `-${body}` : body;
}

/** Parse a target health factor supplied as a decimal string into WAD scale. */
export function parseHealthFactorToWad(value: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) {
    throw new Error("Target health factor must be a positive decimal number.");
  }
  const [whole, fraction = ""] = value.trim().split(".");
  const padded = fraction.padEnd(18, "0").slice(0, 18);
  return BigInt(whole) * WAD + BigInt(padded || "0");
}
