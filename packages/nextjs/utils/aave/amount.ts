import { formatUnits, maxUint256 } from "viem";

export const WITHDRAW_ALL_AMOUNT = maxUint256;

/** Aave Pool.repay accepts maxUint256 to clear the full variable debt. */
export const REPAY_ALL_AMOUNT = maxUint256;

/**
 * Extra allowance headroom for repay(maxUint256): 2% of debt + 1 base unit.
 * Aave pulls debt at execution after accrual; exact-debt approval reverts.
 * Does not change the amount passed to Pool.repay.
 */
const REPAY_APPROVAL_BUFFER_DIVISOR = 50n;

/** The market's base currency uses 8 decimals in getUserAccountData. */
export const AAVE_BASE_CURRENCY_DECIMALS = 8;

export type ParseAmountErrorCode = "EMPTY" | "INVALID" | "NEGATIVE" | "ZERO" | "EXCESS_DECIMALS";

export class ParseAmountError extends Error {
  readonly code: ParseAmountErrorCode;

  constructor(code: ParseAmountErrorCode, message: string) {
    super(message);
    this.name = "ParseAmountError";
    this.code = code;
  }
}

/**
 * Parse a human-readable decimal amount into token base units.
 * Rejects empty, non-numeric, negative, zero, and excess fractional precision.
 */
export function parseTokenAmount(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();

  if (!trimmed) {
    throw new ParseAmountError("EMPTY", "Amount is required.");
  }

  if (trimmed.startsWith("-")) {
    throw new ParseAmountError("NEGATIVE", "Amount must be positive.");
  }

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new ParseAmountError("INVALID", "Amount is not a valid decimal number.");
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");

  if (fractionPart.length > decimals) {
    throw new ParseAmountError("EXCESS_DECIMALS", `Amount has too many decimal places (max ${decimals}).`);
  }

  const paddedFraction = fractionPart.padEnd(decimals, "0");
  const combined = `${wholePart}${paddedFraction}`.replace(/^0+(?=\d)/, "") || "0";
  const parsed = BigInt(combined);

  if (parsed <= 0n) {
    throw new ParseAmountError("ZERO", "Amount must be greater than zero.");
  }

  return parsed;
}

export function hasSufficientBalance(amount: bigint, balance: bigint): boolean {
  return amount <= balance;
}

export function hasSufficientAllowance(amount: bigint, allowance: bigint): boolean {
  return amount <= allowance;
}

export function isWithdrawAllAmount(amount: bigint): boolean {
  return amount === WITHDRAW_ALL_AMOUNT;
}

export function isRepayAllAmount(amount: bigint): boolean {
  return amount === REPAY_ALL_AMOUNT;
}

/**
 * Allowance to request before a full (or debt-sized) repay.
 *
 * Returns debt plus a small buffer so `repay(maxUint256)` can pull post-accrual
 * debt. Approving above wallet balance is valid ERC-20; the buffer is only
 * capped when the wallet already holds a surplus below the full buffer
 * (best-effort headroom). Callers must still disable repay-all when
 * `walletBalance < debt`.
 */
export function repayApprovalAmount(debt: bigint, walletBalance: bigint): bigint {
  if (debt <= 0n) {
    return 0n;
  }

  const buffered = debt + debt / REPAY_APPROVAL_BUFFER_DIVISOR + 1n;

  if (walletBalance >= buffered) {
    return buffered;
  }

  if (walletBalance > debt) {
    return walletBalance;
  }

  return buffered;
}

/**
 * Format Aave health factor (1e18 = 1.0). No debt → maxUint256 → "∞".
 */
export function formatHealthFactor(healthFactor: bigint): string {
  if (healthFactor === maxUint256) {
    return "∞";
  }

  try {
    const formatted = formatUnits(healthFactor, 18);
    const [whole, fraction = ""] = formatted.split(".");
    if (!fraction) {
      return whole;
    }
    const trimmedFraction = fraction.slice(0, 4).replace(/0+$/, "");
    return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
  } catch {
    return healthFactor.toString();
  }
}

/** Format Aave getUserAccountData base-currency amounts (8 decimals). */
export function formatAaveBaseAmount(value: bigint): string {
  try {
    return formatUnits(value, AAVE_BASE_CURRENCY_DECIMALS);
  } catch {
    return value.toString();
  }
}
