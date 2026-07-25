"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import type { BorrowRiskReport } from "~~/services/risk/assistant";

/**
 * Calls the same public `/api/v1/borrow-risk` endpoint documented for third parties, so our own
 * interface exercises the published contract rather than a private path. Every number rendered
 * is computed server-side, the interface does no risk arithmetic and therefore cannot disagree
 * with the API or with the protocol.
 */

type Envelope =
  | { ok: true; schemaVersion: string; data: BorrowRiskReport }
  | { ok: false; schemaVersion: string; error: { code: string; message: string; field?: string } };

export type BorrowRiskParams = {
  address?: Address;
  /** Proposed borrow in dNZD, as a decimal string. */
  borrowAmount: string;
  targetHealthFactor: string;
  shockPercent: string;
  enabled?: boolean;
};

async function fetchReport(params: {
  address: Address;
  borrowAmount: string;
  targetHealthFactor: string;
  shockPercent: string;
}): Promise<BorrowRiskReport> {
  const query = new URLSearchParams({
    address: params.address,
    borrowAmount: params.borrowAmount || "0",
    targetHealthFactor: params.targetHealthFactor,
    shockPercent: params.shockPercent,
  });

  const response = await fetch(`/api/v1/borrow-risk?${query}`);
  const body = (await response.json()) as Envelope;

  if (!body.ok) {
    throw new Error(body.error.message);
  }

  return body.data;
}

export function useBorrowRisk({
  address,
  borrowAmount,
  targetHealthFactor,
  shockPercent,
  enabled = true,
}: BorrowRiskParams) {
  const isEnabled = enabled && Boolean(address);

  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ["borrow-risk", address, borrowAmount, targetHealthFactor, shockPercent],
    queryFn: () =>
      fetchReport({
        address: address as Address,
        borrowAmount,
        targetHealthFactor,
        shockPercent,
      }),
    enabled: isEnabled,
    staleTime: 30_000,
    retry: false,
  });

  return {
    report: data,
    error: error instanceof Error ? error : undefined,
    isFetching,
    refetch,
    isEnabled,
  };
}
