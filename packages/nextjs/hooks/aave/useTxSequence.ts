"use client";

import { useCallback, useRef, useState } from "react";
import { getParsedError } from "~~/utils/scaffold-eth";
import { isUserRejection } from "~~/utils/tx/rejection";

/**
 * Runs one or more transactions as a single user action, exposing per-step status.
 *
 * Approve and the follow-on write (supply / repay) must stay separate user clicks — chaining
 * them here races the allowance refresh and breaks embedded-wallet signing. Use this for a
 * single write, or for steps that do not depend on a just-updated allowance.
 *
 * Each step's `run` is an existing tested write path, nothing here talks to a contract
 * itself. A failed step stops the sequence and leaves its error in place; earlier confirmed
 * steps stay confirmed, because on-chain they are.
 *
 * Declining a signature is distinguished from a failure. It stops the sequence the same way,
 * but reports as cancelled rather than failed, because nothing went wrong.
 */

export type TxStepStatus = "pending" | "active" | "confirmed" | "failed" | "skipped" | "cancelled";

export type TxStepSpec = {
  id: string;
  label: string;
  /** Return false to skip — e.g. an optional cleanup step. Do not use to chain approve-then-supply. */
  shouldRun?: () => boolean;
  run: () => Promise<unknown>;
};

export type TxStepState = {
  id: string;
  label: string;
  status: TxStepStatus;
  error?: string;
};

export type TxSequenceState = {
  steps: TxStepState[];
  isRunning: boolean;
  /** Set when the sequence stopped because something went wrong. Never set by a cancellation. */
  error?: string;
  /** Set when the sequence stopped because the signature was declined. */
  isCancelled: boolean;
  isComplete: boolean;
};

const IDLE: TxSequenceState = { steps: [], isRunning: false, isCancelled: false, isComplete: false };

export function useTxSequence() {
  const [state, setState] = useState<TxSequenceState>(IDLE);
  const runningRef = useRef(false);

  const reset = useCallback(() => {
    setState(IDLE);
  }, []);

  const run = useCallback(async (specs: TxStepSpec[]): Promise<boolean> => {
    if (runningRef.current) {
      return false;
    }
    runningRef.current = true;

    const active = specs.filter(spec => (spec.shouldRun ? spec.shouldRun() : true));

    if (active.length === 0) {
      runningRef.current = false;
      setState({ steps: [], isRunning: false, isCancelled: false, isComplete: true });
      return true;
    }

    let steps: TxStepState[] = active.map(spec => ({
      id: spec.id,
      label: spec.label,
      status: "pending" as TxStepStatus,
    }));
    setState({ steps, isRunning: true, isCancelled: false, isComplete: false });

    for (let index = 0; index < active.length; index += 1) {
      steps = steps.map((step, i) => (i === index ? { ...step, status: "active" } : step));
      setState({ steps, isRunning: true, isCancelled: false, isComplete: false });

      try {
        await active[index].run();
        steps = steps.map((step, i) => (i === index ? { ...step, status: "confirmed" } : step));
        setState({ steps, isRunning: true, isCancelled: false, isComplete: false });
      } catch (error) {
        const cancelled = isUserRejection(error);

        // Declining stops the sequence without marking anything failed. Any earlier step that
        // already reached the chain stays confirmed, so what did and did not happen stays clear.
        if (cancelled) {
          steps = steps.map((step, i) =>
            i === index ? { ...step, status: "cancelled" } : i > index ? { ...step, status: "skipped" } : step,
          );
          setState({ steps, isRunning: false, isCancelled: true, isComplete: false });
          runningRef.current = false;
          return false;
        }

        // The underlying write paths already raise a notification; parse the error the same
        // way here so the step shows that short reason rather than viem's full call dump.
        const message = getParsedError(error);
        steps = steps.map((step, i) =>
          i === index
            ? { ...step, status: "failed", error: message }
            : i > index
              ? { ...step, status: "skipped" }
              : step,
        );
        setState({ steps, isRunning: false, error: message, isCancelled: false, isComplete: false });
        runningRef.current = false;
        return false;
      }
    }

    setState({ steps, isRunning: false, isCancelled: false, isComplete: true });
    runningRef.current = false;
    return true;
  }, []);

  return { ...state, run, reset };
}
