import { formatUnits, maxUint256 } from "viem";
import { AAVE_BASE_CURRENCY_DECIMALS } from "~~/utils/aave/amount";

/**
 * Display formatting for money and rates.
 *
 * The market has a single unit of account and every figure in the product is quoted in it.
 * That unit is the New Zealand dollar: the market values one dNZD at exactly one base unit,
 * so a balance, a collateral value and a borrowing limit are all directly comparable and all
 * carry the same NZ$ label. Nothing here converts between currencies, because there is only
 * one to convert between.
 *
 * The oracle reports collateral prices through Chainlink feeds quoted against the US dollar,
 * and the market treats those figures as base units without applying an NZD/USD rate. The
 * numbers are therefore the raw oracle figures, presented in the market's own unit. Every
 * comparison the protocol makes uses that same unit, so borrowing power, health factors and
 * liquidation thresholds are all internally consistent.
 *
 * `BASE_CURRENCY` is the single switch. Point it at a different currency and every aggregate
 * figure in the product follows, with no other file to change.
 */

export const NZD = {
  code: "NZD",
  symbol: "NZ$",
} as const;

export const BASE_CURRENCY: { code: string; symbol: string; decimals: number } = {
  code: NZD.code,
  symbol: NZD.symbol,
  decimals: AAVE_BASE_CURRENCY_DECIMALS,
};

/**
 * True while the base unit and dNZD balances are the same currency, which is what lets the
 * product present one figure set under one symbol rather than labelling each figure's source.
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
