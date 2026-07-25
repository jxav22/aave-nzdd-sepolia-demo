import {
  BPS,
  type CollateralLeg,
  WAD,
  baseToTokenAmount,
  buildScenarios,
  dedupeAndSortShocks,
  deriveShocksFromMarket,
  fallbackShocks,
  formatHealthFactorWad,
  formatScaled,
  interpretHealthFactor,
  liquidationValueBase,
  parseHealthFactorToWad,
  projectedHealthFactorWad,
  reconcileHealthFactor,
  shockedCollateralBase,
  solveLiquidationShockBps,
  solveStressedMaxBorrowBase,
  tokenAmountToBase,
} from "./stress";
import { describe, expect, it } from "vitest";

/** 1 wETH at the market's configured oracle price of 1800, in 8-decimal base units. */
const ONE_WETH_AT_1800 = 1_800n * 10n ** 8n;
const LIQUIDATION_THRESHOLD_BPS = 8_600n;

function wethLeg(valueBase: bigint): CollateralLeg {
  return { symbol: "wETH", valueBase, liquidationThresholdBps: LIQUIDATION_THRESHOLD_BPS, shockable: true };
}

function dnzdLeg(valueBase: bigint): CollateralLeg {
  return { symbol: "dNZD", valueBase, liquidationThresholdBps: LIQUIDATION_THRESHOLD_BPS, shockable: false };
}

/** Debt that puts the reference position at a health factor of exactly 1.29. */
const DEBT_FOR_HF_129 = 1_200n * 10n ** 8n;

describe("liquidationValueBase", () => {
  it("weights collateral by its liquidation threshold", () => {
    expect(liquidationValueBase([wethLeg(ONE_WETH_AT_1800)], 0n)).toBe(1_548n * 10n ** 8n);
  });

  it("applies the shock only to shockable legs", () => {
    const mixed = [wethLeg(ONE_WETH_AT_1800), dnzdLeg(1_000n * 10n ** 8n)];

    // wETH falls to 1440, dNZD holds at 1000; both weighted at 86%.
    expect(liquidationValueBase(mixed, -2_000n)).toBe((1_440n + 1_000n) * 86n * 10n ** 6n);
  });

  it("floors collateral value at zero for shocks beyond -100%", () => {
    expect(liquidationValueBase([wethLeg(ONE_WETH_AT_1800)], -12_000n)).toBe(0n);
  });
});

describe("shockedCollateralBase", () => {
  it("ignores liquidation thresholds", () => {
    expect(shockedCollateralBase([wethLeg(ONE_WETH_AT_1800)], -2_500n)).toBe(1_350n * 10n ** 8n);
  });
});

describe("projectedHealthFactorWad", () => {
  it("returns null for a debt-free position rather than a sentinel number", () => {
    expect(projectedHealthFactorWad({ collateral: [wethLeg(ONE_WETH_AT_1800)], existingDebtBase: 0n })).toBeNull();
  });

  it("computes the health factor from collateral, threshold and debt", () => {
    const healthFactor = projectedHealthFactorWad({
      collateral: [wethLeg(ONE_WETH_AT_1800)],
      existingDebtBase: DEBT_FOR_HF_129,
    });

    expect(healthFactor).toBe(1_290_000_000_000_000_000n);
  });

  it("counts the proposed borrow on top of existing debt", () => {
    const healthFactor = projectedHealthFactorWad({
      collateral: [wethLeg(ONE_WETH_AT_1800)],
      existingDebtBase: 600n * 10n ** 8n,
      additionalDebtBase: 600n * 10n ** 8n,
    });

    expect(healthFactor).toBe(1_290_000_000_000_000_000n);
  });

  it("scales the health factor exactly in proportion to an ETH-only shock", () => {
    const collateral = [wethLeg(ONE_WETH_AT_1800)];
    const base = projectedHealthFactorWad({ collateral, existingDebtBase: DEBT_FOR_HF_129 })!;

    for (const shockBps of [-1_000n, -2_000n, -2_500n, -3_000n]) {
      const shocked = projectedHealthFactorWad({ collateral, existingDebtBase: DEBT_FOR_HF_129, shockBps })!;
      expect(shocked).toBe((base * (BPS + shockBps)) / BPS);
    }
  });

  it("reproduces the documented stress table", () => {
    const collateral = [wethLeg(ONE_WETH_AT_1800)];
    const at = (shockBps: bigint) =>
      formatHealthFactorWad(projectedHealthFactorWad({ collateral, existingDebtBase: DEBT_FOR_HF_129, shockBps }));

    expect(at(0n)).toBe("1.29");
    expect(at(-1_000n)).toBe("1.16");
    expect(at(-2_000n)).toBe("1.03");
    expect(at(-2_500n)).toBe("0.96");
  });
});

describe("oracle scale invariance", () => {
  it("gives an identical stress table when the oracle denomination changes", () => {
    // Re-denominating the oracle scales collateral and debt by the same factor.
    // The mock market prices NZ$1 as US$1; correcting that must not move the table.
    const atMockPrices = [wethLeg(ONE_WETH_AT_1800)];
    const atCorrectedPrices = [wethLeg(ONE_WETH_AT_1800 * 2n)];
    const shocks = [0n, -1_000n, -2_000n, -2_500n];

    for (const shockBps of shocks) {
      const mock = projectedHealthFactorWad({ collateral: atMockPrices, existingDebtBase: DEBT_FOR_HF_129, shockBps });
      const corrected = projectedHealthFactorWad({
        collateral: atCorrectedPrices,
        existingDebtBase: DEBT_FOR_HF_129 * 2n,
        shockBps,
      });

      expect(corrected).toBe(mock);
    }
  });

  it("puts liquidation at the same ETH decline regardless of the price level", () => {
    const mock = solveLiquidationShockBps({
      collateral: [wethLeg(ONE_WETH_AT_1800)],
      existingDebtBase: DEBT_FOR_HF_129,
    });
    const corrected = solveLiquidationShockBps({
      collateral: [wethLeg(ONE_WETH_AT_1800 * 2n)],
      existingDebtBase: DEBT_FOR_HF_129 * 2n,
    });

    expect(corrected).toBe(mock);
  });
});

describe("solveLiquidationShockBps", () => {
  it("finds the decline at which the health factor reaches 1.0", () => {
    const shockBps = solveLiquidationShockBps({
      collateral: [wethLeg(ONE_WETH_AT_1800)],
      existingDebtBase: DEBT_FOR_HF_129,
    });

    // 1548 x (1 + x) = 1200  =>  x = -22.48%
    expect(shockBps).toBe(-2_248);
  });

  it("agrees with the projected health factor either side of the threshold", () => {
    const collateral = [wethLeg(ONE_WETH_AT_1800)];
    const shockBps = solveLiquidationShockBps({ collateral, existingDebtBase: DEBT_FOR_HF_129 })!;

    const justAbove = projectedHealthFactorWad({
      collateral,
      existingDebtBase: DEBT_FOR_HF_129,
      shockBps: BigInt(shockBps),
    })!;
    const justBelow = projectedHealthFactorWad({
      collateral,
      existingDebtBase: DEBT_FOR_HF_129,
      shockBps: BigInt(shockBps - 1),
    })!;

    expect(justAbove >= WAD).toBe(true);
    expect(justBelow < WAD).toBe(true);
  });

  it("returns null when there is no debt", () => {
    expect(solveLiquidationShockBps({ collateral: [wethLeg(ONE_WETH_AT_1800)], existingDebtBase: 0n })).toBeNull();
  });

  it("returns null when no collateral responds to an ETH move", () => {
    expect(
      solveLiquidationShockBps({ collateral: [dnzdLeg(1_000n * 10n ** 8n)], existingDebtBase: 100n * 10n ** 8n }),
    ).toBeNull();
  });

  it("returns null when unshockable collateral alone covers the debt", () => {
    const collateral = [wethLeg(ONE_WETH_AT_1800), dnzdLeg(1_000n * 10n ** 8n)];
    expect(solveLiquidationShockBps({ collateral, existingDebtBase: 100n * 10n ** 8n })).toBeNull();
  });

  it("accounts for the proposed borrow", () => {
    const collateral = [wethLeg(ONE_WETH_AT_1800)];
    const withoutBorrow = solveLiquidationShockBps({ collateral, existingDebtBase: DEBT_FOR_HF_129 })!;
    const withBorrow = solveLiquidationShockBps({
      collateral,
      existingDebtBase: DEBT_FOR_HF_129,
      additionalDebtBase: 100n * 10n ** 8n,
    })!;

    expect(withBorrow).toBeGreaterThan(withoutBorrow);
  });
});

describe("solveStressedMaxBorrowBase", () => {
  it("returns the borrow that hits the target health factor under the shock", () => {
    const maxBorrow = solveStressedMaxBorrowBase({
      collateral: [wethLeg(ONE_WETH_AT_1800)],
      existingDebtBase: 0n,
      shockBps: -2_000n,
      targetHealthFactorWad: (WAD * 12n) / 10n,
    });

    // 1800 x 0.8 x 0.86 / 1.2 = 1032
    expect(maxBorrow).toBe(1_032n * 10n ** 8n);
  });

  it("produces a position that survives the shock at exactly the target", () => {
    const collateral = [wethLeg(ONE_WETH_AT_1800)];
    const targetHealthFactorWad = (WAD * 12n) / 10n;
    const maxBorrow = solveStressedMaxBorrowBase({
      collateral,
      existingDebtBase: 0n,
      shockBps: -2_000n,
      targetHealthFactorWad,
    });

    const achieved = projectedHealthFactorWad({
      collateral,
      existingDebtBase: 0n,
      additionalDebtBase: maxBorrow,
      shockBps: -2_000n,
    })!;

    expect(achieved).toBeGreaterThanOrEqual(targetHealthFactorWad);
  });

  it("subtracts debt the user already carries", () => {
    const shared = {
      collateral: [wethLeg(ONE_WETH_AT_1800)],
      shockBps: -2_000n,
      targetHealthFactorWad: (WAD * 12n) / 10n,
    };

    expect(solveStressedMaxBorrowBase({ ...shared, existingDebtBase: 32n * 10n ** 8n })).toBe(1_000n * 10n ** 8n);
  });

  it("never returns a negative amount for an already-stretched position", () => {
    const maxBorrow = solveStressedMaxBorrowBase({
      collateral: [wethLeg(ONE_WETH_AT_1800)],
      existingDebtBase: 5_000n * 10n ** 8n,
      shockBps: -2_000n,
      targetHealthFactorWad: (WAD * 12n) / 10n,
    });

    expect(maxBorrow).toBe(0n);
  });

  it("recommends less as the stress tolerance tightens", () => {
    const shared = { collateral: [wethLeg(ONE_WETH_AT_1800)], existingDebtBase: 0n };
    const mild = solveStressedMaxBorrowBase({ ...shared, shockBps: -1_000n, targetHealthFactorWad: WAD });
    const severe = solveStressedMaxBorrowBase({
      ...shared,
      shockBps: -3_000n,
      targetHealthFactorWad: (WAD * 15n) / 10n,
    });

    expect(severe).toBeLessThan(mild);
  });

  it("rejects a non-positive target", () => {
    expect(() =>
      solveStressedMaxBorrowBase({
        collateral: [wethLeg(ONE_WETH_AT_1800)],
        existingDebtBase: 0n,
        shockBps: 0n,
        targetHealthFactorWad: 0n,
      }),
    ).toThrow(/must be positive/i);
  });
});

describe("buildScenarios", () => {
  it("flags the scenarios that fall below a health factor of 1", () => {
    const scenarios = buildScenarios({
      collateral: [wethLeg(ONE_WETH_AT_1800)],
      existingDebtBase: DEBT_FOR_HF_129,
      shocks: [
        { label: "Current price", shockBps: 0, derivedFrom: "current" },
        { label: "Falls 20%", shockBps: -2_000, derivedFrom: "fallback" },
        { label: "Falls 25%", shockBps: -2_500, derivedFrom: "fallback" },
      ],
    });

    expect(scenarios.map(s => s.liquidatable)).toEqual([false, false, true]);
    expect(scenarios[2].interpretation).toBe("Liquidatable");
  });

  it("reports every scenario as debt-free when there is no debt", () => {
    const scenarios = buildScenarios({
      collateral: [wethLeg(ONE_WETH_AT_1800)],
      existingDebtBase: 0n,
      shocks: fallbackShocks(),
    });

    expect(scenarios.every(s => s.healthFactorWad === null && !s.liquidatable)).toBe(true);
  });
});

describe("deriveShocksFromMarket", () => {
  const stats = { dailySigmaPercent: 2.17, maxDrawdown30dPercent: -9.62 };

  it("derives sigma, drawdown and reference scenarios from observed behaviour", () => {
    expect(deriveShocksFromMarket(stats).map(s => s.shockBps)).toEqual([0, -217, -434, -962, -1148, -2500]);
  });

  it("orders scenarios from mildest to most severe", () => {
    const shocks = deriveShocksFromMarket(stats).map(s => s.shockBps);
    expect([...shocks].sort((a, b) => b - a)).toEqual(shocks);
  });

  it("treats the drawdown as a decline whichever sign the caller supplies", () => {
    const negative = deriveShocksFromMarket({ dailySigmaPercent: 2, maxDrawdown30dPercent: -15 });
    const positive = deriveShocksFromMarket({ dailySigmaPercent: 2, maxDrawdown30dPercent: 15 });

    expect(positive.map(s => s.shockBps)).toEqual(negative.map(s => s.shockBps));
  });

  it("collapses duplicates when a calm month coincides with a reference scenario", () => {
    const shocks = deriveShocksFromMarket({ dailySigmaPercent: 0, maxDrawdown30dPercent: 0 });
    expect(shocks.map(s => s.shockBps)).toEqual([0, -2500]);
  });

  it("always keeps a severe reference scenario", () => {
    const shocks = deriveShocksFromMarket({ dailySigmaPercent: 0.1, maxDrawdown30dPercent: -0.5 });
    expect(shocks.some(s => s.derivedFrom === "reference")).toBe(true);
  });
});

describe("dedupeAndSortShocks", () => {
  it("keeps the first label for a repeated shock", () => {
    const shocks = dedupeAndSortShocks([
      { shockBps: -1_000, label: "first" },
      { shockBps: -1_000, label: "second" },
    ]);

    expect(shocks).toEqual([{ shockBps: -1_000, label: "first" }]);
  });
});

describe("base and token conversion", () => {
  it("converts base-currency value into dNZD units at the oracle price", () => {
    expect(baseToTokenAmount(400n * 10n ** 8n, 10n ** 8n, 6)).toBe(400_000_000n);
  });

  it("converts a wETH amount into base-currency value", () => {
    expect(tokenAmountToBase(10n ** 18n, ONE_WETH_AT_1800, 18)).toBe(ONE_WETH_AT_1800);
  });

  it("round-trips through base currency", () => {
    const amount = 1_234_567_890n;
    const base = tokenAmountToBase(amount, 10n ** 8n, 6);
    expect(baseToTokenAmount(base, 10n ** 8n, 6)).toBe(amount);
  });

  it("rejects a zero price", () => {
    expect(() => baseToTokenAmount(1n, 0n, 6)).toThrow(/price must be positive/i);
  });
});

describe("reconcileHealthFactor", () => {
  it("accepts a rounding-level difference from Aave's own figure", () => {
    const result = reconcileHealthFactor({
      recomputedWad: 1_290_000_000_000_000_000n,
      aaveReportedWad: 1_290_000_000_000_001_000n,
    });

    expect(result.matches).toBe(true);
    expect(result.differenceBps).toBe(0);
  });

  it("rejects a difference that implies the collateral model is wrong", () => {
    const result = reconcileHealthFactor({
      recomputedWad: 1_290_000_000_000_000_000n,
      aaveReportedWad: 1_500_000_000_000_000_000n,
    });

    expect(result.matches).toBe(false);
    expect(result.differenceBps).toBe(1_400);
  });

  it("treats two debt-free positions as agreeing", () => {
    expect(reconcileHealthFactor({ recomputedWad: null, aaveReportedWad: null }).matches).toBe(true);
    expect(reconcileHealthFactor({ recomputedWad: null, aaveReportedWad: WAD }).matches).toBe(false);
  });
});

describe("interpretHealthFactor", () => {
  it("describes the buffer without ever calling a position safe", () => {
    const labels = [null, WAD / 2n, WAD, (WAD * 115n) / 100n, (WAD * 13n) / 10n, (WAD * 17n) / 10n, WAD * 3n].map(
      interpretHealthFactor,
    );

    expect(labels).toEqual([
      "No debt",
      "Liquidatable",
      "Very small liquidation buffer",
      "Small liquidation buffer",
      "Moderate liquidation buffer",
      "Comfortable liquidation buffer",
      "Large liquidation buffer",
    ]);
    expect(labels.join(" ")).not.toMatch(/safe/i);
  });
});

describe("formatting", () => {
  it("formats health factors and infinity", () => {
    expect(formatHealthFactorWad(null)).toBe("∞");
    expect(formatHealthFactorWad(1_290_000_000_000_000_000n)).toBe("1.29");
    expect(formatHealthFactorWad(WAD)).toBe("1");
    expect(formatHealthFactorWad(1_234_500_000_000_000_000n, 4)).toBe("1.2345");
  });

  it("formats scaled integers without floating point", () => {
    expect(formatScaled(1_548n * 10n ** 8n, 8)).toBe("1548");
    expect(formatScaled(150_000_000n, 8)).toBe("1.5");
    expect(formatScaled(-150_000_000n, 8)).toBe("-1.5");
    expect(formatScaled(1n, 8, 8)).toBe("0.00000001");
  });

  it("parses target health factors into WAD scale", () => {
    expect(parseHealthFactorToWad("1.2")).toBe((WAD * 12n) / 10n);
    expect(parseHealthFactorToWad("1")).toBe(WAD);
    expect(() => parseHealthFactorToWad("abc")).toThrow(/positive decimal/i);
    expect(() => parseHealthFactorToWad("-1")).toThrow(/positive decimal/i);
  });
});
