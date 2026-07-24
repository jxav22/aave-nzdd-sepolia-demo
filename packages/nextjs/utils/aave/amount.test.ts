import {
  ParseAmountError,
  WITHDRAW_ALL_AMOUNT,
  hasSufficientAllowance,
  hasSufficientBalance,
  isWithdrawAllAmount,
  parseTokenAmount,
} from "./amount";
import { describe, expect, it } from "vitest";

describe("parseTokenAmount", () => {
  it("parses whole and fractional amounts with 6 decimals", () => {
    expect(parseTokenAmount("1", 6)).toBe(1_000_000n);
    expect(parseTokenAmount("1.5", 6)).toBe(1_500_000n);
    expect(parseTokenAmount("0.000001", 6)).toBe(1n);
  });

  it("parses amounts with 2 decimals (EURS-style)", () => {
    expect(parseTokenAmount("1", 2)).toBe(100n);
    expect(parseTokenAmount("1.5", 2)).toBe(150n);
    expect(parseTokenAmount("0.01", 2)).toBe(1n);
    expect(() => parseTokenAmount("1.001", 2)).toThrow(/too many decimal/i);
  });

  it("rejects empty input", () => {
    expect(() => parseTokenAmount("", 6)).toThrow(ParseAmountError);
    expect(() => parseTokenAmount("   ", 6)).toThrow(/required/i);
  });

  it("rejects invalid and negative amounts", () => {
    expect(() => parseTokenAmount("abc", 6)).toThrow(/valid decimal/i);
    expect(() => parseTokenAmount("-1", 6)).toThrow(/positive/i);
    expect(() => parseTokenAmount("1.2.3", 6)).toThrow(/valid decimal/i);
  });

  it("rejects zero", () => {
    expect(() => parseTokenAmount("0", 6)).toThrow(/greater than zero/i);
    expect(() => parseTokenAmount("0.0", 6)).toThrow(/greater than zero/i);
  });

  it("rejects excess decimal precision", () => {
    expect(() => parseTokenAmount("1.1234567", 6)).toThrow(/too many decimal/i);
  });
});

describe("balance and allowance guards", () => {
  it("detects insufficient balance", () => {
    expect(hasSufficientBalance(100n, 50n)).toBe(false);
    expect(hasSufficientBalance(50n, 50n)).toBe(true);
    expect(hasSufficientBalance(10n, 50n)).toBe(true);
  });

  it("detects insufficient allowance", () => {
    expect(hasSufficientAllowance(100n, 0n)).toBe(false);
    expect(hasSufficientAllowance(100n, 100n)).toBe(true);
  });
});

describe("withdraw-all amount", () => {
  it("uses maxUint256 for withdraw all", () => {
    expect(isWithdrawAllAmount(WITHDRAW_ALL_AMOUNT)).toBe(true);
    expect(isWithdrawAllAmount(1n)).toBe(false);
  });
});
