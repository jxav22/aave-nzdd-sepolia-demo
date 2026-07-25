import { ParseAmountError } from "~~/utils/aave/amount";
import { getParsedError } from "~~/utils/scaffold-eth";

/** Aave V3 variable debt interest rate mode. */
export const VARIABLE_INTEREST_RATE_MODE = 2n;

/**
 * Map wallet / Aave Pool errors into short UI messages.
 * Pass `ownableMintHint` for markets with an owner-only mint path.
 */
export function mapAaveTxError(error: unknown, fallback: string, options?: { ownableMintHint?: string }): string {
  if (error instanceof ParseAmountError) {
    return error.message;
  }

  const message = getParsedError(error);
  const lower = message.toLowerCase();
  const raw = typeof error === "object" && error !== null ? JSON.stringify(error) : String(error ?? "");
  const combined = `${message}\n${raw}`.toLowerCase();

  if (lower.includes("user rejected") || lower.includes("user denied") || lower.includes("rejected the request")) {
    return "Transaction rejected in wallet.";
  }

  if (options?.ownableMintHint) {
    if (
      combined.includes("ownableunauthorizedaccount") ||
      combined.includes("0x118cdaa7") ||
      combined.includes("onlyowner") ||
      combined.includes("caller is not the owner")
    ) {
      return options.ownableMintHint;
    }
  }

  if (combined.includes("borrowing not enabled") || combined.includes("borrowingnotenabled")) {
    return "Borrowing is disabled for this reserve.";
  }

  if (
    combined.includes("health factor") ||
    combined.includes("healthfactor") ||
    combined.includes("collateral cannot cover")
  ) {
    return "Position constrained by collateral or health factor. Reduce the amount, repay debt, or supply more collateral.";
  }

  if (
    combined.includes("not enough liquidity") ||
    combined.includes("available liquidity") ||
    combined.includes("there is not enough liquidity")
  ) {
    return "Not enough market liquidity for this amount. Try a smaller amount or wait for more supply.";
  }

  return message || fallback;
}
