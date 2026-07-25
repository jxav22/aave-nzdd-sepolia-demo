/**
 * Aave interest rate conversions.
 *
 * `liquidityRate` and `variableBorrowRate` from the ProtocolDataProvider are
 * per-second APRs scaled by ray (1e27). Aave's own interfaces display the
 * compounded APY, so we do the same conversion here.
 *
 * These are rates, not token amounts, a float is the right representation and
 * the precision rules that apply to balances do not apply here.
 */

export const RAY = 10n ** 27n;
export const SECONDS_PER_YEAR = 31_536_000;

/** Ray-scaled per-second APR → compounded annual percentage yield, as a percentage. */
export function rayAprToApyPercent(rateRay: bigint | undefined): number {
  if (rateRay === undefined || rateRay <= 0n) {
    return 0;
  }

  // Scale down before converting to Number: a ray value overflows the safe integer range.
  const apr = Number((rateRay * 1_000_000n) / RAY) / 1_000_000;
  if (!Number.isFinite(apr) || apr <= 0) {
    return 0;
  }

  const apy = (1 + apr / SECONDS_PER_YEAR) ** SECONDS_PER_YEAR - 1;
  return Number.isFinite(apy) ? apy * 100 : 0;
}

/**
 * Share of deposited liquidity currently borrowed, as a percentage.
 * Returns 0 for an empty reserve rather than dividing by zero.
 */
export function utilisationPercent(totalSupplied: bigint, totalBorrowed: bigint): number {
  if (totalSupplied <= 0n) {
    return 0;
  }
  // Ratio of two same-decimal amounts, safe to widen once scaled.
  const scaled = (totalBorrowed * 1_000_000n) / totalSupplied;
  return Number(scaled) / 10_000;
}

/** Basis points → percentage (8250 → 82.5). */
export function bpsToPercent(bps: bigint | number | undefined): number {
  if (bps === undefined) {
    return 0;
  }
  return Number(bps) / 100;
}
