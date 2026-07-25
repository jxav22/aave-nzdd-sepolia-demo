"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Runs one or more transactions as a single user action, exposing per-step status.
 *
 * Approve and the follow-on write (supply / repay) must stay separate user clicks — chaining
 * them here races the allowance refresh and breaks embedded-wallet signing. Use this for a
 * single write, or for steps that do not depend on a just-updated allowance.
 *
 * Each step's `run` is an existing tested write path — nothing here talks to a contract
 * itself. A failed step stops the sequence and leaves its error in place; earlier confirmed
 * steps stay confirmed, because on-chain they are.
 */

export type TxStepStatus = "pending" | "active" | "confirmed" | "failed" | "skipped";

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
  /** Set when the sequence stopped early. */
  error?: string;
  isComplete: boolean;
};

const IDLE: TxSequenceState = { steps: [], isRunning: false, isComplete: false };

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
      setState({ steps: [], isRunning: false, isComplete: true });
      return true;
    }

    let steps: TxStepState[] = active.map(spec => ({
      id: spec.id,
      label: spec.label,
      status: "pending" as TxStepStatus,
    }));
    setState({ steps, isRunning: true, isComplete: false });

    for (let index = 0; index < active.length; index += 1) {
      steps = steps.map((step, i) => (i === index ? { ...step, status: "active" } : step));
      setState({ steps, isRunning: true, isComplete: false });

      try {
        await active[index].run();
        steps = steps.map((step, i) => (i === index ? { ...step, status: "confirmed" } : step));
        setState({ steps, isRunning: true, isComplete: false });
      } catch (error) {
        // The underlying write paths already map protocol revert codes to readable text
        // and raise a notification; keep that message rather than restating it.
        const message = error instanceof Error ? error.message : "The transaction did not go through.";
        steps = steps.map((step, i) =>
          i === index
            ? { ...step, status: "failed", error: message }
            : i > index
              ? { ...step, status: "skipped" }
              : step,
        );
        setState({ steps, isRunning: false, error: message, isComplete: false });
        runningRef.current = false;
        return false;
      }
    }

    setState({ steps, isRunning: false, isComplete: true });
    runningRef.current = false;
    return true;
  }, []);

  return { ...state, run, reset };
}
