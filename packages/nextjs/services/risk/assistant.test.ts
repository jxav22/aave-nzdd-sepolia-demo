/**
 * Report-assembly tests for the Borrow Risk Assistant.
 *
 * The hackathon pool is currently unseeded, so no wallet on Sepolia holds collateral in
 * it. These build the position snapshot directly, which covers the funded path the live
 * market cannot yet exercise, and keeps the assertions deterministic either way.
 */
import { buildBorrowRiskReport } from "./assistant";
import { describe, expect, it } from "vitest";
import { type AavePositionSnapshot } from "~~/services/aave/readPosition";
import { type EthMarketContext } from "~~/services/binance/ethMarket";
import { WAD, deriveShocksFromMarket, fallbackShocks } from "~~/utils/risk/stress";
import { FORBIDDEN_PHRASES } from "~~/utils/risk/wording";

const POOL = "0xe1556e1f65Aa99682e96Ad3de866f446D2A1275e" as const;
const ORACLE = "0x809779d09cB0B9F85D191761Ef4a0a0076eED429" as const;
const USER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const;

const WETH_PRICE = 1_800n * 10n ** 8n;
const DNZD_PRICE = 10n ** 8n;
const LT_BPS = 8_600n;
const LTV_BPS = 8_250n;

function reserve(overrides: Partial<AavePositionSnapshot["reserves"]["wETH"]> & { symbol: "dNZD" | "wETH" | "wBTC" }) {
  return {
    decimals: 18,
    priceBase: WETH_PRICE,
    liquidationThresholdBps: LT_BPS,
    ltvBps: LTV_BPS,
    suppliedBalance: 0n,
    collateralValueBase: 0n,
    borrowingEnabled: true,
    isActive: true,
    isFrozen: false,
    ...overrides,
  };
}

/** 1 wETH supplied, no debt: collateral 1800 base, liquidation-weighted 1548 base. */
function fundedPosition(overrides: Partial<AavePositionSnapshot> = {}): AavePositionSnapshot {
  const wethCollateralBase = WETH_PRICE;

  return {
    chainId: 11155111,
    poolAddress: POOL,
    oracleAddress: ORACLE,
    user: USER,
    blockNumber: 11_346_107n,
    totalCollateralBase: wethCollateralBase,
    totalDebtBase: 0n,
    availableBorrowsBase: (wethCollateralBase * LTV_BPS) / 10_000n,
    currentLiquidationThresholdBps: LT_BPS,
    ltvBps: LTV_BPS,
    healthFactorWad: null,
    reserves: {
      dNZD: reserve({ symbol: "dNZD", decimals: 6, priceBase: DNZD_PRICE }),
      wETH: reserve({
        symbol: "wETH",
        suppliedBalance: 10n ** 18n,
        collateralValueBase: wethCollateralBase,
      }),
      wBTC: reserve({ symbol: "wBTC", decimals: 8, priceBase: 27_000n * 10n ** 8n }),
    },
    collateralLegs: [
      { symbol: "wETH", valueBase: wethCollateralBase, liquidationThresholdBps: LT_BPS, shockable: true },
    ],
    borrowAssetDebt: 0n,
    borrowAssetLiquidity: 100_000n * 10n ** 6n,
    ...overrides,
  };
}

const MARKET: EthMarketContext = {
  source: "Binance Skill query-token-info (dynamic + kline), public endpoints",
  symbol: "WETH",
  chainId: "1",
  contractAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  priceUsd: 1856.73,
  change24hPercent: -1.83,
  high24hUsd: 1958.09,
  low24hUsd: 1845.93,
  volume24hUsd: 81_102_510,
  liquidityUsd: 309_104_078,
  dailySigmaPercent: 2.167,
  maxDrawdown30dPercent: -9.6164,
  candleCount: 31,
  lastClose: 1856.73,
  windowStart: "2026-06-25T00:00:00.000Z",
  windowEnd: "2026-07-25T00:00:00.000Z",
  asOf: "2026-07-25T07:07:08.869Z",
  degraded: false,
  degradedReason: null,
};

/** 1200 dNZD, the amount that puts the reference position at a health factor of 1.29. */
const BORROW_1200_DNZD = 1_200n * 10n ** 6n;

function report(
  overrides: {
    position?: AavePositionSnapshot;
    marketContext?: EthMarketContext;
    proposedBorrowTokens?: bigint;
    targetHealthFactorWad?: bigint;
    stressShockBps?: number;
  } = {},
) {
  const marketContext = overrides.marketContext ?? MARKET;

  return buildBorrowRiskReport({
    request: {
      user: USER,
      proposedBorrowTokens: overrides.proposedBorrowTokens ?? BORROW_1200_DNZD,
      targetHealthFactorWad: overrides.targetHealthFactorWad ?? (WAD * 12n) / 10n,
      stressShockBps: overrides.stressShockBps ?? -2_000,
    },
    position: overrides.position ?? fundedPosition(),
    marketContext,
    shocks: marketContext.degraded ? fallbackShocks() : deriveShocksFromMarket(marketContext),
  });
}

describe("borrow risk report", () => {
  it("reports Aave's own limit as the protocol maximum", () => {
    // 1800 base x 82.5% LTV = 1485, at a dNZD price of 1.
    expect(report().proposal.protocolMaximum.formatted).toBe("1485");
  });

  it("projects the health factor for the proposed borrow", () => {
    const { proposal } = report();

    expect(proposal.projectedHealthFactor.formatted).toBe("1.29");
    expect(proposal.exceedsProtocolMaximum).toBe(false);
  });

  it("flags a borrow above what Aave permits", () => {
    expect(report({ proposedBorrowTokens: 2_000n * 10n ** 6n }).proposal.exceedsProtocolMaximum).toBe(true);
  });

  it("solves the ETH decline at which the position becomes liquidatable", () => {
    expect(report().proposal.liquidationAtEthChangePercent).toBe(-22.48);
  });

  it("builds the stress table from the observed market, ordered mildest to worst", () => {
    const { scenarios } = report();

    expect(scenarios.map(s => [s.ethPriceChangePercent, s.projectedHealthFactor.formatted, s.liquidatable])).toEqual([
      [0, "1.29", false],
      [-2.17, "1.26", false],
      [-4.33, "1.23", false],
      [-9.62, "1.16", false],
      [-11.47, "1.14", false],
      [-25, "0.96", true],
    ]);
  });

  it("labels where each scenario came from", () => {
    expect(new Set(report().scenarios.map(s => s.derivedFrom))).toEqual(
      new Set(["current", "volatility", "drawdown", "reference"]),
    );
  });

  it("recommends an amount that survives the selected stress", () => {
    const { stressTest } = report();

    // 1800 x 0.8 x 0.86 / 1.2 = 1032
    expect(stressTest.stressTestedMaximum.formatted).toBe("1032");
    expect(stressTest.shockEthPriceChangePercent).toBe(-20);
    expect(stressTest.cappedByProtocolMaximum).toBe(false);
  });

  it("recommends less as the requested buffer grows", () => {
    const amounts = ["1.1", "1.2", "1.5"].map(target => {
      const [whole, fraction = ""] = target.split(".");
      const wad = BigInt(whole) * WAD + BigInt(fraction.padEnd(18, "0"));
      return BigInt(report({ targetHealthFactorWad: wad }).stressTest.stressTestedMaximum.raw);
    });

    expect(amounts[0]).toBeGreaterThan(amounts[1]);
    expect(amounts[1]).toBeGreaterThan(amounts[2]);
  });

  it("never recommends more than Aave itself permits", () => {
    const { stressTest, proposal } = report({ targetHealthFactorWad: WAD, stressShockBps: 0 });

    // Unstressed at a target of 1.0 the engine would allow 1548, above Aave's 1485.
    expect(stressTest.stressTestedMaximum.formatted).toBe("1485");
    expect(stressTest.stressTestedMaximum.raw).toBe(proposal.protocolMaximum.raw);
    expect(stressTest.cappedByProtocolMaximum).toBe(true);
  });

  it("keeps the Aave oracle and the Binance price visibly separate", () => {
    const { oracleDivergence } = report();

    expect(oracleDivergence.aaveCollateralPrice.formatted).toBe("1800");
    expect(oracleDivergence.binanceEthPriceUsd).toBe(1856.73);
    expect(oracleDivergence.note).toMatch(/Chainlink/i);
    // The note must state that dNZD is valued at one base-currency unit, so a reader can see
    // where the figures' common unit of account comes from, and must mark the exchange price
    // as comparison only so it is not mistaken for what the market prices against.
    expect(oracleDivergence.note).toMatch(/base currency/i);
    expect(oracleDivergence.note).toMatch(/one dNZD/i);
    expect(oracleDivergence.note).toMatch(/comparison only/i);
  });

  it("reconciles the recomputed health factor against the one Aave reports", () => {
    const position = fundedPosition({
      totalDebtBase: 1_200n * 10n ** 8n,
      healthFactorWad: 1_290_000_000_000_000_000n,
      borrowAssetDebt: BORROW_1200_DNZD,
    });
    const { selfCheck } = report({ position, proposedBorrowTokens: 0n });

    expect(selfCheck.recomputedHealthFactor.formatted).toBe("1.29");
    expect(selfCheck.aaveReportedHealthFactor.formatted).toBe("1.29");
    expect(selfCheck.matches).toBe(true);
  });

  it("warns when the recomputed health factor disagrees with Aave", () => {
    const position = fundedPosition({
      totalDebtBase: 1_200n * 10n ** 8n,
      healthFactorWad: 3_000_000_000_000_000_000n,
    });
    const result = report({ position, proposedBorrowTokens: 0n });

    expect(result.selfCheck.matches).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/may not reflect how the protocol values this position/i);
  });

  it("records the assembly steps in the trace", () => {
    // The data-gathering steps are appended by `runBorrowRiskAssistant`, which owns the
    // recorder; assembling from fixed inputs contributes only these three.
    const { steps } = report();

    expect(steps.map(s => s.tool)).toEqual(["compute-stress", "reconcile-with-aave", "explain"]);
    expect(steps.every(step => step.detail.length > 0)).toBe(true);
  });

  it("names the data sources behind the numbers", () => {
    const { sources } = report();

    expect(sources.join(" ")).toMatch(/getUserAccountData/);
    expect(sources.join(" ")).toMatch(/query-token-info/);
    expect(sources.join(" ")).toMatch(/no authentication/);
  });

  it("declares the Binance endpoints and that they need no credentials", () => {
    const { marketContext } = report();

    expect(marketContext.authenticationRequired).toBe(false);
    expect(marketContext.endpoints).toHaveLength(2);
  });
});

describe("degraded and empty states", () => {
  it("falls back to fixed scenarios when market data is unavailable", () => {
    const degraded: EthMarketContext = { ...MARKET, degraded: true, degradedReason: "network down", priceUsd: null };
    const result = report({ marketContext: degraded });

    expect(result.scenarios.map(s => s.ethPriceChangePercent)).toEqual([0, -10, -20, -30]);
    expect(result.marketContext.degraded).toBe(true);
    expect(result.explanation).toMatch(/live market data was unavailable/i);
  });

  it("explains that there is nothing to stress-test without collateral", () => {
    const empty = fundedPosition({
      totalCollateralBase: 0n,
      availableBorrowsBase: 0n,
      currentLiquidationThresholdBps: 0n,
      ltvBps: 0n,
      collateralLegs: [],
      reserves: {
        ...fundedPosition().reserves,
        wETH: reserve({ symbol: "wETH", suppliedBalance: 0n, collateralValueBase: 0n }),
      },
    });

    expect(report({ position: empty }).explanation).toMatch(/no collateral deposited/i);
  });

  it("warns that a borrow would revert while the reserve holds no liquidity", () => {
    const dry = fundedPosition({ borrowAssetLiquidity: 0n });

    expect(report({ position: dry }).warnings.join(" ")).toMatch(/holds no available liquidity/i);
  });

  it("warns when liquidity is below the borrowing capacity", () => {
    const shallow = fundedPosition({ borrowAssetLiquidity: 100n * 10n ** 6n });

    expect(report({ position: shallow }).warnings.join(" ")).toMatch(/less than your borrowing capacity/i);
  });

  it("holds non-ETH collateral at its current value and says so", () => {
    const mixed = fundedPosition({
      collateralLegs: [
        { symbol: "wETH", valueBase: WETH_PRICE, liquidationThresholdBps: LT_BPS, shockable: true },
        { symbol: "dNZD", valueBase: 1_000n * 10n ** 8n, liquidationThresholdBps: LT_BPS, shockable: false },
      ],
      totalCollateralBase: WETH_PRICE + 1_000n * 10n ** 8n,
    });
    const result = report({ position: mixed });

    expect(result.position.hasOtherCollateral).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/shock only the wETH leg/i);
  });
});

describe("wording", () => {
  const variants = [
    report(),
    report({ proposedBorrowTokens: 0n }),
    report({ proposedBorrowTokens: 5_000n * 10n ** 6n }),
    report({ position: fundedPosition({ borrowAssetLiquidity: 0n }) }),
    report({ marketContext: { ...MARKET, degraded: true, degradedReason: "network down" } }),
  ];

  it("never overstates certainty in any output variant", () => {
    for (const variant of variants) {
      const text = JSON.stringify(variant).toLowerCase();
      for (const phrase of FORBIDDEN_PHRASES) {
        if (phrase === "financial advice") {
          expect(text).toContain("not financial advice");
          continue;
        }
        expect(text).not.toContain(phrase);
      }
    }
  });

  it("always carries a disclaimer that names Aave as the decider", () => {
    for (const variant of variants) {
      expect(variant.disclaimer).toMatch(/aave decides/i);
      expect(variant.disclaimer).toMatch(/final decision remains with you/i);
    }
  });

  it("describes the position in plain language rather than raw figures", () => {
    const { explanation } = report();

    expect(explanation).toMatch(/Aave permits you to borrow up to 1485 dNZD/);
    expect(explanation).toMatch(/projected health factor of 1\.29/);
    expect(explanation).toMatch(/ETH would need to fall about 22\.48%/);
    expect(explanation).toMatch(/stress-tested amount is about 1032 dNZD/);
  });
});
