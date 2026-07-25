import { describe, expect, it } from "vitest";
import { RAY, SECONDS_PER_YEAR, bpsToPercent, rayAprToApyPercent, utilisationPercent } from "~~/utils/aave/rates";

/**
 * The live market has never been borrowed against, so every on-chain rate currently reads zero
 * and the interface cannot be validated against real non-zero values. These tests pin the
 * conversion against known inputs so the rate display is correct once the market is in use.
 */

/** A ray-scaled APR from a plain percentage, e.g. 5 → 0.05 * 1e27. */
function aprRay(percent: number): bigint {
  return (BigInt(Math.round(percent * 1_000_000)) * RAY) / 100_000_000n;
}

describe("rayAprToApyPercent", () => {
  it("returns zero for an unborrowed reserve", () => {
    expect(rayAprToApyPercent(0n)).toBe(0);
  });

  it("treats a missing rate as zero rather than throwing", () => {
    expect(rayAprToApyPercent(undefined)).toBe(0);
  });

  it("compounds a 5% APR to approximately 5.13% APY", () => {
    // Continuous compounding limit: e^0.05 - 1 = 5.127%.
    expect(rayAprToApyPercent(aprRay(5))).toBeCloseTo(5.127, 2);
  });

  it("compounds a 2.5% APR to approximately 2.53% APY", () => {
    expect(rayAprToApyPercent(aprRay(2.5))).toBeCloseTo(2.532, 2);
  });

  it("compounds a 50% APR to approximately 64.87% APY", () => {
    expect(rayAprToApyPercent(aprRay(50))).toBeCloseTo(64.872, 1);
  });

  it("stays finite for an implausibly large rate", () => {
    const result = rayAprToApyPercent(aprRay(10_000));
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });

  it("does not lose the rate to integer truncation at small values", () => {
    // A 0.01% APR must not round to zero, a low but real rate is not the same as no rate.
    expect(rayAprToApyPercent(aprRay(0.01))).toBeGreaterThan(0);
  });

  it("uses a 31,536,000 second year, matching the protocol", () => {
    expect(SECONDS_PER_YEAR).toBe(365 * 24 * 60 * 60);
  });
});

describe("utilisationPercent", () => {
  it("reports zero for an empty reserve instead of dividing by zero", () => {
    expect(utilisationPercent(0n, 0n)).toBe(0);
  });

  it("reports zero when nothing is borrowed", () => {
    expect(utilisationPercent(1_000_000n, 0n)).toBe(0);
  });

  it("reports half of a reserve lent out as 50%", () => {
    expect(utilisationPercent(1_000_000n, 500_000n)).toBeCloseTo(50, 4);
  });

  it("reports a fully lent reserve as 100%", () => {
    expect(utilisationPercent(1_000_000n, 1_000_000n)).toBeCloseTo(100, 4);
  });

  it("handles amounts far beyond the safe integer range", () => {
    const supplied = 10n ** 30n;
    expect(utilisationPercent(supplied, supplied / 4n)).toBeCloseTo(25, 4);
  });
});

describe("bpsToPercent", () => {
  it("converts the market's loan-to-value of 8250 bps to 82.5%", () => {
    expect(bpsToPercent(8250n)).toBe(82.5);
  });

  it("converts the market's liquidation threshold of 8600 bps to 86%", () => {
    expect(bpsToPercent(8600n)).toBe(86);
  });

  it("treats a missing value as zero", () => {
    expect(bpsToPercent(undefined)).toBe(0);
  });
});
