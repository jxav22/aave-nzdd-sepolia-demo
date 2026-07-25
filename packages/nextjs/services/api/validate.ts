/**
 * Input parsing for the public v1 API.
 *
 * Every parser throws `ApiError` with a stable machine-readable code, so integrators can
 * branch on `error.code` rather than matching on message text.
 */
import { ApiError } from "./respond";
import { type Address, isAddress } from "viem";
import { WAD } from "~~/utils/risk/stress";

export const DEFAULT_TARGET_HEALTH_FACTOR_WAD = (WAD * 12n) / 10n;
export const DEFAULT_STRESS_SHOCK_BPS = -2_000;

export function parseAddress(value: string | null, field = "address"): Address {
  if (!value) {
    throw new ApiError("INVALID_ADDRESS", `Query parameter "${field}" is required.`, field);
  }
  if (!isAddress(value)) {
    throw new ApiError("INVALID_ADDRESS", `"${value}" is not a valid Ethereum address.`, field);
  }
  return value as Address;
}

/**
 * Parse a human-readable decimal token amount into base units.
 *
 * Zero is permitted: "what does my position look like if I borrow nothing" is a
 * legitimate query, and rejecting it would make the UI error while the field is empty.
 */
export function parseTokenAmount(value: string | null | undefined, decimals: number, field: string): bigint {
  if (value === null || value === undefined || value.trim() === "") {
    return 0n;
  }

  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new ApiError("INVALID_AMOUNT", `"${field}" must be a non-negative decimal number.`, field);
  }

  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new ApiError("INVALID_AMOUNT", `"${field}" allows at most ${decimals} decimal places.`, field);
  }

  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

/** Parse an integer-string amount already expressed in base units. */
export function parseBaseUnits(value: unknown, field: string): bigint {
  if (value === undefined || value === null || value === "") {
    return 0n;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ApiError("INVALID_BODY", `"${field}" must be an integer string in base units.`, field);
  }

  const text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    throw new ApiError("INVALID_BODY", `"${field}" must be a non-negative integer string in base units.`, field);
  }

  return BigInt(text);
}

export function parseTargetHealthFactor(value: string | null | undefined, field = "targetHealthFactor"): bigint {
  if (value === null || value === undefined || String(value).trim() === "") {
    return DEFAULT_TARGET_HEALTH_FACTOR_WAD;
  }

  const trimmed = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new ApiError("INVALID_TARGET_HEALTH_FACTOR", `"${field}" must be a positive decimal number.`, field);
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const wad = BigInt(whole) * WAD + BigInt(fraction.padEnd(18, "0").slice(0, 18) || "0");

  if (wad < WAD) {
    throw new ApiError(
      "INVALID_TARGET_HEALTH_FACTOR",
      `"${field}" must be at least 1.0 — a target below 1 describes an already-liquidatable position.`,
      field,
    );
  }
  if (wad > WAD * 100n) {
    throw new ApiError("INVALID_TARGET_HEALTH_FACTOR", `"${field}" must be at most 100.`, field);
  }

  return wad;
}

/**
 * Parse a stress magnitude expressed as a positive percentage decline.
 *
 * Callers say "20" meaning "ETH falls 20%"; internally shocks are signed basis points,
 * so this returns -2000. Accepting a signed value too would make "-20" ambiguous.
 */
export function parseShockPercent(value: string | null | undefined, field = "shockPercent"): number {
  if (value === null || value === undefined || String(value).trim() === "") {
    return DEFAULT_STRESS_SHOCK_BPS;
  }

  const parsed = Number(String(value).trim());
  if (!Number.isFinite(parsed)) {
    throw new ApiError("INVALID_SHOCK", `"${field}" must be a number.`, field);
  }

  const magnitude = Math.abs(parsed);
  if (magnitude > 100) {
    throw new ApiError("INVALID_SHOCK", `"${field}" must be between 0 and 100.`, field);
  }

  return -Math.round(magnitude * 100);
}

export function parseShockList(value: unknown, field = "shocksBps"): number[] | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError("INVALID_BODY", `"${field}" must be a non-empty array of basis-point integers.`, field);
  }
  if (value.length > 20) {
    throw new ApiError("INVALID_BODY", `"${field}" allows at most 20 scenarios.`, field);
  }

  return value.map(entry => {
    const parsed = Number(entry);
    if (!Number.isInteger(parsed) || parsed > 0 || parsed < -10_000) {
      throw new ApiError("INVALID_BODY", `"${field}" entries must be integers between -10000 and 0.`, field);
    }
    return parsed;
  });
}

export async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("INVALID_BODY", "Request body must be valid JSON.");
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError("INVALID_BODY", "Request body must be a JSON object.");
  }

  return body as Record<string, unknown>;
}

export type CollateralLegInput = {
  symbol: string;
  valueBase: bigint;
  liquidationThresholdBps: bigint;
  shockable: boolean;
};

export function parseCollateralLegs(value: unknown, field = "collateral"): CollateralLegInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError("INVALID_BODY", `"${field}" must be a non-empty array of collateral legs.`, field);
  }
  if (value.length > 10) {
    throw new ApiError("INVALID_BODY", `"${field}" allows at most 10 legs.`, field);
  }

  return value.map((raw, index) => {
    if (raw === null || typeof raw !== "object") {
      throw new ApiError("INVALID_BODY", `"${field}[${index}]" must be an object.`, field);
    }

    const leg = raw as Record<string, unknown>;
    const threshold = Number(leg.liquidationThresholdBps);

    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 10_000) {
      throw new ApiError(
        "INVALID_BODY",
        `"${field}[${index}].liquidationThresholdBps" must be an integer between 0 and 10000.`,
        field,
      );
    }

    return {
      symbol: typeof leg.symbol === "string" && leg.symbol.trim() ? leg.symbol.trim().slice(0, 16) : `asset${index}`,
      valueBase: parseBaseUnits(leg.valueBase, `${field}[${index}].valueBase`),
      liquidationThresholdBps: BigInt(threshold),
      shockable: leg.shockable !== false,
    };
  });
}
