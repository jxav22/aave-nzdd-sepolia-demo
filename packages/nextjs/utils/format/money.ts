import { formatUnits, maxUint256 } from "viem";
import { AAVE_BASE_CURRENCY_DECIMALS } from "~~/utils/aave/amount";

/**
 * Display formatting for money and rates.
 *
 * Two distinct currencies are in play and conflating them would misstate every
 * cross-asset figure:
 *
 * - **dNZD amounts are New Zealand dollars.** One dNZD represents NZ$1, so token
 *   balances format as NZ$ directly.
 * - **Aggregate values are in the market's base currency**, which the oracle reports
 *   in USD: wETH and wBTC are priced by Chainlink USD feeds. Collateral value,
 *   borrowing power and per-asset prices are therefore USD, and are labelled as such.
 *
 * `BASE_CURRENCY` is the single switch. When the oracle is re-denominated so the base
 * unit is NZD, change it here and every aggregate figure in the product follows.
 */

export const BASE_CURRENCY: { code: string; symbol: string; decimals: number } = {
  code: "USD",
  symbol: "US$",
  decimals: AAVE_BASE_CURRENCY_DECIMALS,
};

export const NZD = {
  code: "NZD",
  symbol: "NZ$",
} as const;

/**
 * True once the oracle reports the base unit in New Zealand dollars, at which point aggregate
 * values and dNZD balances are the same currency and the split labelling above collapses.
 */
export const BASE_CURRENCY_IS_NZD = BASE_CURRENCY.code === NZD.code;

type MoneyOptions = {
  decimals?: number;
  /** Drop the currency symbol and return the bare number. */
  bare?: boolean;
};

function toNumber(raw: bigint, tokenDecimals: number): number {
  // Display only. Token maths stays in bigint everywhere it affects a transaction.
  return Number(formatUnits(raw, tokenDecimals));
}

function group(value: number, minimumFractionDigits: number, maximumFractionDigits: number): string {
  return value.toLocaleString("en-NZ", { minimumFractionDigits, maximumFractionDigits });
}

/** A dNZD balance, as New Zealand dollars. */
export function formatNzd(raw: bigint, tokenDecimals: number, options: MoneyOptions = {}): string {
  const decimals = options.decimals ?? 2;
  const body = group(toNumber(raw, tokenDecimals), decimals, decimals);
  return options.bare ? body : `${NZD.symbol}${body}`;
}

/** A number that is already in New Zealand dollars. */
export function formatNzdNumber(value: number, options: MoneyOptions = {}): string {
  const decimals = options.decimals ?? 2;
  const body = group(value, decimals, decimals);
  return options.bare ? body : `${NZD.symbol}${body}`;
}

/** An Aave base-currency amount (8 decimals), collateral value, borrowing power, prices. */
export function formatBase(raw: bigint, options: MoneyOptions = {}): string {
  const decimals = options.decimals ?? 2;
  const body = group(toNumber(raw, BASE_CURRENCY.decimals), decimals, decimals);
  return options.bare ? body : `${BASE_CURRENCY.symbol}${body}`;
}

/**
 * A token quantity with its own symbol, for collateral assets, where a value in
 * dollars would need the oracle and the quantity is what the user actually holds.
 */
export function formatToken(raw: bigint, tokenDecimals: number, symbol: string, maxFractionDigits = 6): string {
  const value = toNumber(raw, tokenDecimals);
  // Small balances need their precision; large ones do not.
  const digits = value === 0 ? 2 : value >= 1000 ? 2 : maxFractionDigits;
  return `${group(value, 2, digits)} ${symbol}`;
}

/** Bare token quantity, no symbol, for input field prefills. */
export function formatTokenBare(raw: bigint, tokenDecimals: number): string {
  return formatUnits(raw, tokenDecimals);
}

export function formatPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return `${value.toFixed(decimals)}%`;
}

/** Signed percentage, for price moves. */
export function formatSignedPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) {
    return "-";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Health factor for display. No debt is `maxUint256`, which renders as ∞, never 0,
 * and never a warning state.
 */
export function formatHealth(healthFactor: bigint | undefined): string {
  if (healthFactor === undefined || healthFactor === maxUint256) {
    return "∞";
  }
  const value = Number(formatUnits(healthFactor, 18));
  if (!Number.isFinite(value)) {
    return "∞";
  }
  return value.toFixed(2);
}

export type HealthBand = "none" | "strong" | "moderate" | "thin" | "critical";

export function healthBand(healthFactor: bigint | undefined): HealthBand {
  if (healthFactor === undefined || healthFactor === maxUint256) {
    return "none";
  }
  const value = Number(formatUnits(healthFactor, 18));
  if (!Number.isFinite(value)) {
    return "none";
  }
  if (value >= 2) return "strong";
  if (value >= 1.5) return "moderate";
  if (value >= 1.1) return "thin";
  return "critical";
}

/** Plain-language reading of the health factor. Never claims a position is safe. */
export function healthLabel(band: HealthBand): string {
  switch (band) {
    case "none":
      return "No borrowing";
    case "strong":
      return "Large buffer";
    case "moderate":
      return "Comfortable buffer";
    case "thin":
      return "Slim buffer";
    case "critical":
      return "Close to liquidation";
  }
}

export function healthToneClass(band: HealthBand): string {
  switch (band) {
    case "none":
    case "strong":
      return "text-[var(--pine)]";
    case "moderate":
      return "text-[var(--pine)]";
    case "thin":
      return "text-[var(--clay)]";
    case "critical":
      return "text-destructive";
  }
}

export function truncateAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 1) {
    return address;
  }
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
