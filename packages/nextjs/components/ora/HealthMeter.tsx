"use client";

import { formatUnits, maxUint256 } from "viem";
import { Eyebrow } from "~~/components/ora/primitives";
import { formatHealth, healthBand, healthLabel, healthToneClass } from "~~/utils/format/money";

/**
 * Health factor with distance to the liquidation point.
 *
 * 1.0 is where liquidation becomes possible and is marked on the track. No debt reads ∞
 * and fills the track, it is the strongest possible position, not a missing value.
 */

const BAR_CLASS: Record<ReturnType<typeof healthBand>, string> = {
  none: "bg-[var(--pine)]",
  strong: "bg-[var(--pine)]",
  moderate: "bg-[var(--pine)]",
  thin: "bg-[var(--clay)]",
  critical: "bg-destructive",
};

/** The track spans 1.0 → 3.0, so the liquidation marker sits at the left edge of the safe range. */
const TRACK_MAX = 3;

function fillPercent(healthFactor: bigint | undefined): number {
  if (healthFactor === undefined || healthFactor === maxUint256) {
    return 100;
  }
  const value = Number(formatUnits(healthFactor, 18));
  if (!Number.isFinite(value)) {
    return 100;
  }
  return Math.max(2, Math.min(100, (value / TRACK_MAX) * 100));
}

export const HealthMeter = ({
  healthFactor,
  showLabel = true,
  caption,
}: {
  healthFactor: bigint | undefined;
  showLabel?: boolean;
  caption?: string;
}) => {
  const band = healthBand(healthFactor);
  const formatted = formatHealth(healthFactor);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <Eyebrow>Health factor</Eyebrow>
        <div className="flex items-baseline gap-2">
          {showLabel ? <span className="text-xs text-muted-foreground">{healthLabel(band)}</span> : null}
          <span className={`tabular font-mono text-sm ${healthToneClass(band)}`}>{formatted}</span>
        </div>
      </div>

      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary"
        role="meter"
        aria-valuenow={formatted === "∞" ? undefined : Number(formatted)}
        aria-valuemin={0}
        aria-valuemax={TRACK_MAX}
        aria-label={`Health factor ${formatted}, ${healthLabel(band)}`}
      >
        <div className={`h-full rounded-full ${BAR_CLASS[band]}`} style={{ width: `${fillPercent(healthFactor)}%` }} />
        {/* Liquidation point at 1.0. */}
        <div className="absolute top-0 h-full w-px bg-foreground/40" style={{ left: `${(1 / TRACK_MAX) * 100}%` }} />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {caption ??
          "The marker is 1.0. If your health factor reaches it, part of your collateral can be sold to repay what you owe."}
      </p>
    </div>
  );
};
