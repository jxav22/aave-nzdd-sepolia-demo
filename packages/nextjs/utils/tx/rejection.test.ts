import { isUserRejection } from "./rejection";
import { BaseError, UserRejectedRequestError } from "viem";
import { describe, expect, it } from "vitest";

/**
 * These cover the shapes a declined signature actually arrives in. The distinction matters
 * because a false negative shows someone a red failure for choosing not to proceed, and a
 * false positive hides a real failure behind a cancellation message.
 */

describe("isUserRejection", () => {
  it("recognises viem's own rejection error", () => {
    expect(isUserRejection(new UserRejectedRequestError(new Error("rejected")))).toBe(true);
  });

  it("recognises a rejection nested in a cause chain", () => {
    // This is the shape the wallet error arrives in: viem wraps the provider error in a
    // TransactionExecutionError and then again in a ContractFunctionExecutionError.
    const provider = { code: 4001, message: "The user rejected the request" };
    const inner = Object.assign(new Error("User rejected the request."), { cause: provider });
    const outer = Object.assign(new Error("User rejected the request."), { cause: inner });

    expect(isUserRejection(outer)).toBe(true);
  });

  it("recognises the bare EIP-1193 rejection code", () => {
    expect(isUserRejection({ code: 4001 })).toBe(true);
  });

  it("recognises wallets that only set a message", () => {
    expect(isUserRejection(new Error("MetaMask Tx Signature: User denied transaction signature."))).toBe(true);
    expect(isUserRejection(new Error("User rejected methods."))).toBe(true);
  });

  it("does not treat a protocol revert as a cancellation", () => {
    const reverted = new BaseError("The contract function reverted.", {
      details: "execution reverted: 36",
    });

    expect(isUserRejection(reverted)).toBe(false);
  });

  it("does not treat an ordinary failure as a cancellation", () => {
    expect(isUserRejection(new Error("Insufficient funds for gas."))).toBe(false);
    expect(isUserRejection({ code: -32000, message: "nonce too low" })).toBe(false);
  });

  it("handles absent and non-error values", () => {
    expect(isUserRejection(undefined)).toBe(false);
    expect(isUserRejection(null)).toBe(false);
    expect(isUserRejection("user rejected")).toBe(false);
  });

  it("terminates on a self-referential cause chain", () => {
    const looping: { message: string; cause?: unknown } = { message: "boom" };
    looping.cause = looping;

    expect(isUserRejection(looping)).toBe(false);
  });
});
