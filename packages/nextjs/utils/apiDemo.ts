"use client";

/**
 * Shared helpers for the public Developer API playground.
 * Client-safe, no server-only imports.
 */

export type ApiErrorBody = {
  ok: false;
  schemaVersion?: string;
  error: { code: string; message: string; field?: string };
};

export type ApiSuccessBody<T = unknown> = {
  ok: true;
  schemaVersion: string;
  data: T;
};

export type ApiCallResult = {
  url: string;
  method: string;
  status: number;
  ok: boolean;
  durationMs: number;
  rateLimit: {
    limit: string | null;
    remaining: string | null;
    reset: string | null;
    retryAfter: string | null;
  };
  body: unknown;
  rawText: string;
};

export async function callDeveloperApi(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<ApiCallResult> {
  const method = (init?.method ?? "GET").toUpperCase();
  const timeoutMs = init?.timeoutMs ?? 30_000;
  const started = performance.now();

  const response = await fetch(path, {
    ...init,
    method,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });

  const rawText = await response.text();
  let body: unknown = rawText;
  try {
    body = JSON.parse(rawText);
  } catch {
    // Keep raw text when the body is not JSON.
  }

  return {
    url: path,
    method,
    status: response.status,
    ok: response.ok,
    durationMs: Math.round(performance.now() - started),
    rateLimit: {
      limit: response.headers.get("X-RateLimit-Limit"),
      remaining: response.headers.get("X-RateLimit-Remaining"),
      reset: response.headers.get("X-RateLimit-Reset"),
      retryAfter: response.headers.get("Retry-After"),
    },
    body,
    rawText,
  };
}

export function isApiSuccess(body: unknown): body is ApiSuccessBody {
  return Boolean(body && typeof body === "object" && (body as { ok?: boolean }).ok === true);
}

export function apiErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && (body as { ok?: boolean }).ok === false) {
    const error = (body as ApiErrorBody).error;
    if (error?.message) {
      return error.message;
    }
  }
  return fallback;
}

export function formatPrice(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  if (value >= 1000) {
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }
  if (value >= 0.0001) {
    return `$${value.toFixed(6)}`;
  }
  return `$${value.toExponential(2)}`;
}

export function formatUsdCompact(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "-";
  }
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  }
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }
  if (value === 0) {
    return "$0";
  }
  return `$${value.toExponential(2)}`;
}

export function formatChange(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function shortAddress(address: string): string {
  if (address.length < 12) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export const SIMULATE_DEFAULT_JSON = `{
  "collateral": [
    { "symbol": "WETH", "valueBase": "180000000000", "liquidationThresholdBps": 8600, "shockable": true }
  ],
  "debtBase": "0",
  "proposedBorrowBase": "40000000000",
  "targetHealthFactor": "1.2",
  "shockPercent": 20,
  "baseDecimals": 8
}`;

export const API_ENDPOINTS = [
  {
    id: "overview",
    label: "Overview",
    method: "GET",
    path: "/api/v1/openapi.json",
  },
  {
    id: "market-eth",
    label: "ETH market",
    method: "GET",
    path: "/api/v1/market/eth",
  },
  {
    id: "token-search",
    label: "Token search",
    method: "GET",
    path: "/api/v1/binance/token/search",
  },
  {
    id: "position",
    label: "Position",
    method: "GET",
    path: "/api/v1/position/{address}",
  },
  {
    id: "borrow-risk",
    label: "Borrow risk",
    method: "GET",
    path: "/api/v1/borrow-risk",
  },
  {
    id: "simulate",
    label: "Simulate",
    method: "POST",
    path: "/api/v1/borrow-risk/simulate",
  },
] as const;

export type EndpointId = (typeof API_ENDPOINTS)[number]["id"];
