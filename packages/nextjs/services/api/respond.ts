/**
 * Shared response envelope for the public v1 API.
 *
 * Every route returns the same shape whether it succeeds or fails, so an integrator
 * writes one branch on `ok` rather than sniffing status codes and body shapes.
 */

export const SCHEMA_VERSION = "1.0.0";

export type ApiErrorCode =
  | "INVALID_ADDRESS"
  | "INVALID_AMOUNT"
  | "INVALID_TARGET_HEALTH_FACTOR"
  | "INVALID_SHOCK"
  | "INVALID_BODY"
  | "RATE_LIMITED"
  | "UPSTREAM_RPC_ERROR"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  INVALID_ADDRESS: 400,
  INVALID_AMOUNT: 400,
  INVALID_TARGET_HEALTH_FACTOR: 400,
  INVALID_SHOCK: 400,
  INVALID_BODY: 400,
  RATE_LIMITED: 429,
  UPSTREAM_RPC_ERROR: 502,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly field?: string;

  constructor(code: ApiErrorCode, message: string, field?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.field = field;
  }
}

/**
 * The API is read-only, non-custodial and carries no cookies or credentials, so a
 * wildcard origin exposes nothing that a caller could not fetch themselves.
 */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/**
 * Recursively convert bigint values to decimal strings.
 *
 * `JSON.stringify` throws on bigint, and coercing to `number` would silently lose
 * precision on wei-scale and WAD-scale values — the two things this API is built to
 * report accurately. Strings are the only safe wire representation.
 */
export function serialiseBigints<T>(value: T): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(serialiseBigints);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, serialiseBigints(inner)]));
  }
  return value;
}

export function jsonOk(data: unknown, init?: { status?: number; headers?: Record<string, string> }): Response {
  const body = JSON.stringify({ ok: true, schemaVersion: SCHEMA_VERSION, data: serialiseBigints(data) });

  return new Response(body, {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...init?.headers },
  });
}

export function jsonError(error: ApiError, headers?: Record<string, string>): Response {
  const body = JSON.stringify({
    ok: false,
    schemaVersion: SCHEMA_VERSION,
    error: { code: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) },
  });

  return new Response(body, {
    status: STATUS_BY_CODE[error.code],
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...headers },
  });
}

/**
 * Run a handler, mapping thrown errors onto the envelope.
 *
 * Unexpected failures are reported as `INTERNAL_ERROR` with a generic message so that
 * RPC URLs, API keys or stack traces never reach a public response body.
 */
export async function withApiErrorHandling(
  handler: () => Promise<Response>,
  headers?: Record<string, string>,
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error, headers);
    }

    console.error("[api] unhandled error", error);
    return jsonError(new ApiError("INTERNAL_ERROR", "The request could not be completed."), headers);
  }
}

/** Shared CORS preflight response, re-exported as `OPTIONS` by each route. */
export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
