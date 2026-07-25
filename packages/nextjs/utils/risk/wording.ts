/**
 * Every phrase the Borrow Risk Assistant can emit, in one place.
 *
 * Centralised so the language can be audited in a single read. The assistant provides
 * educational risk context, so it must never assert that an amount is safe, that
 * liquidation cannot happen, that a guarantee exists, or that Binance predicts anything.
 * `FORBIDDEN_PHRASES` is asserted against the generated output in the test suite.
 */

export const DISCLAIMER =
  "Illustrative scenarios based on recent public market data, not a prediction and not financial advice. " +
  "Aave decides borrowing limits and liquidation using its own oracle. The final decision remains with you.";

export const METHODOLOGY_NOTE =
  "Scenarios apply a relative price move to the Aave oracle price of the collateral. Because the stress test " +
  "is relative, it is unaffected by the absolute price level the demo oracle is configured with.";

export const ORACLE_DIVERGENCE_NOTE =
  "This demo market uses fixed mock oracle prices and treats one dNZD as one base-currency unit. The Binance " +
  "figure is the live ETH market price in US dollars. The two differ, so borrowing capacity shown here is " +
  "illustrative of the demo market, not of real-world NZD value.";

export const SOURCES = {
  aavePosition: "Aave Pool.getUserAccountData (hackathon market, Sepolia)",
  aaveOracle: "Aave oracle getAssetPrice + ProtocolDataProvider reserve configuration",
  binance: "Binance Skill query-token-info (dynamic + kline), public endpoints, no authentication",
  engine: "Deterministic stress engine (utils/risk/stress.ts)",
} as const;

/** Phrases the assistant must never produce. Enforced by test. */
export const FORBIDDEN_PHRASES = [
  "is safe",
  "safe amount",
  "cannot be liquidated",
  "will not be liquidated",
  "guarantee",
  "guaranteed",
  "financial advice",
  "binance predicts",
  "we predict",
  "risk-free",
];

export const LIQUIDITY_WARNING = (symbol: string) =>
  `The ${symbol} reserve currently holds no available liquidity, so a borrow transaction would revert regardless ` +
  `of your borrowing capacity. This is a state of the demo market, not of your position.`;

export const PARTIAL_LIQUIDITY_WARNING = (symbol: string, available: string) =>
  `The ${symbol} reserve holds ${available} ${symbol} of available liquidity, which is less than your borrowing ` +
  `capacity. A borrow above that amount would revert.`;

export const OTHER_COLLATERAL_NOTE =
  "Part of your collateral is not ETH-correlated. Scenarios shock only the wETH leg and hold the rest at its " +
  "current oracle value.";

export const RECONCILIATION_WARNING =
  "The recomputed health factor does not match the one Aave reports, so the scenarios below may not reflect how " +
  "the protocol values this position. Treat them with caution.";

export const NO_COLLATERAL_EXPLANATION =
  "This wallet has no collateral supplied to the hackathon market, so there is no borrowing capacity to " +
  "stress-test yet. Supply wETH first, then return here to see how a proposed dNZD borrow would behave under " +
  "recent ETH market conditions.";
