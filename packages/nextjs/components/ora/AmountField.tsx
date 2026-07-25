"use client";

import { type ReactNode, useId } from "react";
import { Eyebrow, Pill } from "~~/components/ora/primitives";
import { ParseAmountError, parseTokenAmount } from "~~/utils/aave/amount";

/**
 * Large amount input in the design's display type.
 *
 * Validation reuses `parseTokenAmount`, the same parser the write path uses, so what the
 * field accepts and what a transaction accepts cannot drift. The caller owns the string;
 * this component never mutates a balance or does arithmetic on one.
 */

export type AmountFieldProps = {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  /** Token decimals — 6 for dNZD, 18 for wETH, 8 for wBTC. Never assume 18. */
  decimals: number;
  /** Rendered before the number, e.g. "NZ$". */
  prefix?: ReactNode;
  /** Rendered after the number, e.g. "ETH". */
  suffix?: ReactNode;
  /** Right-aligned context above the input, typically the wallet balance. */
  meta?: ReactNode;
  /** Quick-fill choices. `value` is the exact string written into the field. */
  presets?: { label: string; value: string }[];
  /** Upper bound in the same units as `value`; exceeding it is reported inline. */
  max?: { value: string; message: string };
  disabled?: boolean;
  placeholder?: string;
};

export function validateAmount(
  value: string,
  decimals: number,
  max?: { value: string; message: string },
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  let parsed: bigint;
  try {
    parsed = parseTokenAmount(trimmed, decimals);
  } catch (error) {
    if (error instanceof ParseAmountError) {
      return error.message;
    }
    return "Enter a valid amount.";
  }

  if (max) {
    try {
      if (parsed > parseTokenAmount(max.value, decimals)) {
        return max.message;
      }
    } catch {
      // A zero or unparseable ceiling means there is nothing to compare against.
      return max.message;
    }
  }

  return undefined;
}

export const AmountField = ({
  label,
  value,
  onChange,
  decimals,
  prefix,
  suffix,
  meta,
  presets,
  max,
  disabled = false,
  placeholder = "0",
}: AmountFieldProps) => {
  const id = useId();
  const error = validateAmount(value, decimals, max);

  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id}>
          <Eyebrow>{label}</Eyebrow>
        </label>
        {meta ? <span className="text-xs text-muted-foreground">{meta}</span> : null}
      </div>

      <div className="mt-3 flex items-baseline gap-3">
        {prefix ? <span className="font-display text-3xl text-muted-foreground">{prefix}</span> : null}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={event => onChange(event.target.value)}
          className="tabular w-full min-w-0 bg-transparent font-display text-4xl outline-none placeholder:text-muted-foreground/40 disabled:opacity-50 sm:text-5xl"
        />
        {suffix ? <span className="font-display text-3xl text-muted-foreground">{suffix}</span> : null}
      </div>

      {presets && presets.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {presets.map(preset => (
            <Pill key={preset.label} onClick={() => onChange(preset.value)}>
              {preset.label}
            </Pill>
          ))}
        </div>
      ) : null}

      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
};
