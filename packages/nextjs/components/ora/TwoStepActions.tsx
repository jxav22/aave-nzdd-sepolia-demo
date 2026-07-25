"use client";

import type { ReactNode } from "react";
import { Eyebrow } from "~~/components/ora/primitives";

/**
 * Approve and the follow-on write are two confirmations. This is the UI rule for that:
 * always render them as Step 1 and Step 2, never a single combined control.
 */

export type TwoStepSlot = {
  title: ReactNode;
  description?: ReactNode;
  /** Step 1 complete (e.g. allowance covers the amount). */
  done?: boolean;
  /** Step 2 waiting on step 1. */
  locked?: boolean;
  action: ReactNode;
};

export const TwoStepActions = ({
  stepOne,
  stepTwo,
  className = "",
}: {
  stepOne: TwoStepSlot;
  stepTwo: TwoStepSlot;
  className?: string;
}) => (
  <ol className={`mt-6 flex flex-col gap-5 ${className}`}>
    <StepRow number={1} {...stepOne} />
    <StepRow number={2} {...stepTwo} />
  </ol>
);

const StepRow = ({
  number,
  title,
  description,
  done = false,
  locked = false,
  action,
}: TwoStepSlot & { number: 1 | 2 }) => (
  <li
    className={`rounded-xl border p-4 ${
      locked ? "border-border/70 bg-secondary/20 opacity-70" : "border-border bg-secondary/40"
    }`}
  >
    <div className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] ${
          done
            ? "border-[var(--pine)] bg-[var(--pine)] text-[var(--cream)]"
            : locked
              ? "border-border text-muted-foreground/60"
              : "border-[var(--pine)] text-[var(--pine)]"
        }`}
        aria-hidden
      >
        {done ? "✓" : number}
      </span>
      <div className="min-w-0 flex-1">
        <Eyebrow>
          Step {number}
          {done ? " · Done" : locked ? " · After step 1" : null}
        </Eyebrow>
        <div className="mt-1 text-sm font-medium text-foreground">{title}</div>
        {description ? <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</div> : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">{action}</div>
      </div>
    </div>
  </li>
);
