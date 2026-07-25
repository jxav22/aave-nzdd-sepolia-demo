"use client";

import { useCallback, useState } from "react";
import type { SimulationResult } from "~~/services/risk/simulate";
import { AAVE_BASE_CURRENCY_DECIMALS, parseTokenAmount } from "~~/utils/aave/amount";

/**
 * Calls `POST /api/v1/borrow-risk/simulate` — the stateless endpoint that assesses a position
 * described entirely by the caller. No wallet, no chain read, no position on this market.
 *
 * The endpoint works in integer base units. People type dollars, so the conversion happens here
 * using the same parser the write paths use.
 */

type Envelope =
  | { ok: true; schemaVersion: string; data: SimulationResult }
  | { ok: false; schemaVersion: string; error: { code: string; message: string; field?: string } };

export type SimulateInput = {
  collateral: {
    symbol?: string;
    /** Value in dollars, as typed. */
    value: string;
    liquidationThresholdBps: number;
    shockable: boolean;
  }[];
  /** Already owed, in dollars. */
  debt: string;
  /** Loan to test, in dollars. */
  proposedBorrow: string;
  targetHealthFactor: string;
  shockPercent: number;
};

/** Dollars → integer base units. Zero is legitimate here, unlike a transaction amount. */
function toBaseUnits(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || Number(trimmed) === 0) {
    return "0";
  }
  return parseTokenAmount(trimmed, AAVE_BASE_CURRENCY_DECIMALS).toString();
}

export function useSimulateRisk() {
  const [report, setReport] = useState<SimulationResult | undefined>();
  const [error, setError] = useState<Error | undefined>();
  const [isPending, setIsPending] = useState(false);

  const reset = useCallback(() => {
    setReport(undefined);
    setError(undefined);
  }, []);

  const simulate = useCallback(async (input: SimulateInput) => {
    setIsPending(true);
    setError(undefined);

    try {
      const body = {
        collateral: input.collateral.map(leg => ({
          ...(leg.symbol ? { symbol: leg.symbol } : {}),
          valueBase: toBaseUnits(leg.value),
          liquidationThresholdBps: leg.liquidationThresholdBps,
          shockable: leg.shockable,
        })),
        debtBase: toBaseUnits(input.debt),
        proposedBorrowBase: toBaseUnits(input.proposedBorrow),
        targetHealthFactor: input.targetHealthFactor,
        shockPercent: input.shockPercent,
        baseDecimals: AAVE_BASE_CURRENCY_DECIMALS,
      };

      const response = await fetch("/api/v1/borrow-risk/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const envelope = (await response.json()) as Envelope;

      if (!envelope.ok) {
        throw new Error(envelope.error.message);
      }

      setReport(envelope.data);
    } catch (caught) {
      setReport(undefined);
      setError(caught instanceof Error ? caught : new Error("The simulation could not be run."));
    } finally {
      setIsPending(false);
    }
  }, []);

  return { simulate, report, error, isPending, reset };
}
