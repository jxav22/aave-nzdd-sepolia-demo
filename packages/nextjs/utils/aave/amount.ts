import { maxUint256 } from "viem";

export const WITHDRAW_ALL_AMOUNT = maxUint256;

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
