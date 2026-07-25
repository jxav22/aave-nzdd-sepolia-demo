"use client";

import { Eyebrow } from "~~/components/ora/primitives";
import type { TxSequenceState, TxStepStatus } from "~~/hooks/aave/useTxSequence";

/**
 * Progress for a multi-step transaction. Renders nothing until a sequence starts, and
 * stays visible after a failure so the error and which step reached the chain are both legible.
 */

const MARKER: Record<TxStepStatus, { glyph: string; className: string }> = {
  pending: { glyph: "", className: "border-border text-muted-foreground" },
  active: { glyph: "", className: "border-[var(--pine)] text-[var(--pine)]" },
  confirmed: { glyph: "✓", className: "border-[var(--pine)] bg-[var(--pine)] text-[var(--cream)]" },
  failed: { glyph: "!", className: "border-destructive bg-destructive text-[var(--cream)]" },
  skipped: { glyph: "–", className: "border-border text-muted-foreground/60" },
};

const STATUS_TEXT: Record<TxStepStatus, string> = {
  pending: "Waiting",
  active: "Confirm in your wallet",
  confirmed: "Done",
  failed: "Failed",
  skipped: "Not run",
};

export const TxSteps = ({ sequence, className = "" }: { sequence: TxSequenceState; className?: string }) => {
  if (sequence.steps.length === 0) {
    return null;
  }

  return (
    <div className={`rounded-xl border border-border bg-secondary/40 p-4 ${className}`} aria-live="polite">
      <Eyebrow>{sequence.isRunning ? "In progress" : sequence.error ? "Stopped" : "Complete"}</Eyebrow>

      <ol className="mt-3 flex flex-col gap-2.5">
        {sequence.steps.map((step, index) => {
          const marker = MARKER[step.status];
          return (
            <li key={step.id} className="flex items-start gap-3 text-sm">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] ${marker.className}`}
              >
                {step.status === "active" ? (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
                ) : (
                  marker.glyph || index + 1
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={step.status === "skipped" ? "text-muted-foreground/70" : "text-foreground"}>
                  {step.label}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">{STATUS_TEXT[step.status]}</span>
                {step.error ? <span className="mt-1 block text-xs text-destructive">{step.error}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
