import { BASE_CURRENCY, BASE_CURRENCY_IS_NZD, NZD, formatBase, formatNzd, formatPercent } from "./money";
import { describe, expect, it } from "vitest";

/**
 * The product presents one unit of account. These lock that in, because a regression here
 * would not throw or fail a build; it would quietly relabel money in front of someone
 * deciding how much to borrow.
 */

describe("unit of account", () => {
  it("quotes aggregates and token balances in the same currency", () => {
    expect(BASE_CURRENCY.code).toBe(NZD.code);
    expect(BASE_CURRENCY.symbol).toBe(NZD.symbol);
    expect(BASE_CURRENCY_IS_NZD).toBe(true);
  });

  it("renders a base-currency aggregate and a dNZD balance identically", () => {
    // 1,250.00 in base units (8dp) and the same amount in dNZD (6dp).
    const collateralValue = 1_250_00000000n;
    const walletBalance = 1_250_000000n;

    expect(formatBase(collateralValue)).toBe("NZ$1,250.00");
    expect(formatNzd(walletBalance, 6)).toBe("NZ$1,250.00");
    expect(formatBase(collateralValue)).toBe(formatNzd(walletBalance, 6));
  });

  it("groups thousands and keeps two decimal places", () => {
    expect(formatBase(11_000_00000000n)).toBe("NZ$11,000.00");
    expect(formatNzd(1_005000n, 6)).toBe("NZ$1.01");
  });

  it("omits the symbol when asked, for use inside input fields", () => {
    expect(formatBase(1_250_00000000n, { bare: true })).toBe("1,250.00");
    expect(formatNzd(1_250_000000n, 6, { bare: true })).toBe("1,250.00");
  });

  it("renders a non-finite rate as a dash rather than NaN", () => {
    expect(formatPercent(Number.NaN)).toBe("-");
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe("-");
    expect(formatPercent(4.0831)).toBe("4.08%");
  });
});
