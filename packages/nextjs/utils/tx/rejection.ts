import { UserRejectedRequestError } from "viem";

/**
 * Whether an error is the person declining the signature rather than something going wrong.
 *
 * Declining is a normal outcome, so it must not be reported as a failure: no red step, no
 * error toast, no console noise. viem wraps the provider error several layers deep by the
 * time it surfaces, so this walks the cause chain rather than inspecting only the top error,
 * and falls back to the EIP-1193 code and message because wallets are inconsistent about
 * which of the three they set.
 */

/** EIP-1193: the user rejected the request. */
const USER_REJECTED_CODE = 4001;

const REJECTION_TEXT = /user rejected|user denied|rejected the request|denied transaction|request rejected/i;

export function isUserRejection(error: unknown): boolean {
  let current: unknown = error;

  // Guard against a self-referential cause chain rather than trusting it to terminate.
  for (let depth = 0; current && depth < 10; depth += 1) {
    if (current instanceof UserRejectedRequestError) {
      return true;
    }

    const candidate = current as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown };

    if (candidate.code === USER_REJECTED_CODE) {
      return true;
    }

    if (candidate.name === "UserRejectedRequestError") {
      return true;
    }

    if (typeof candidate.message === "string" && REJECTION_TEXT.test(candidate.message)) {
      return true;
    }

    current = candidate.cause;
  }

  return false;
}
