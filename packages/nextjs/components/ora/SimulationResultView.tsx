"use client";

import { Eyebrow, Note, Stat } from "~~/components/ora/primitives";
import type { SimulationResult } from "~~/services/risk/simulate";

/**
 * Renders a hand-described simulation.
 *
 * The simulate endpoint returns a narrower payload than the full report, there is no market or
 * position section, and `marketContext` is null whenever the caller supplied their own scenarios,
 * so this is a separate view rather than a coerced version of the full one. The obligations are
 * the same: the disclaimer always shows, and the stress-tested figure is never called safe.
 */

const SCENARIO_SOURCE_NOTE: Record<SimulationResult["scenarioSource"], string> = {
  "caller-supplied": "The declines below are the ones you specified.",
  "binance-market-data": "The declines below are drawn from how ETH has actually been moving.",
  "fixed-fallback": "Live market data was unavailable, so the declines below are fixed reference figures.",
};

function healthTone(formatted: string, liquidatable: boolean): string {
  if (liquidatable) return "text-destructive";
  if (formatted === "∞") return "text-[var(--pine)]";
  const value = Number(formatted);
  if (Number.isFinite(value) && value < 1.25) return "text-[var(--clay)]";
  return "text-[var(--pine)]";
}

export const SimulationResultView = ({ result }: { result: SimulationResult }) => (
  <div className="flex flex-col gap-6">
    <div className="grid gap-6 sm:grid-cols-3">
      <Stat
        label="Health factor with this loan"
        value={result.projectedHealthFactor.formatted}
        accent
        hint="1.0 is where liquidation begins"
      />
      <Stat
        label="Liquidation would begin at"
        value={
          result.liquidationAtEthChangePercent === null
            ? "Not reachable"
            : `${Math.abs(result.liquidationAtEthChangePercent)}%`
        }
        hint={result.liquidationAtEthChangePercent === null ? "On these figures" : "Fall in the collateral"}
      />
      <Stat
        label="Holds the buffer up to"
        value={result.stressTest.stressTestedMaximumFormatted}
        hint={`Keeps ${result.stressTest.targetHealthFactor.formatted} through a ${Math.abs(
          result.stressTest.shockEthPriceChangePercent,
        )}% fall`}
      />
    </div>

    {result.marketContext?.degraded ? (
      <Note tone="warning" title="Live market data is unavailable">
        The declines used are fixed reference figures rather than measurements of recent behaviour.
      </Note>
    ) : null}

    <div>
      <Eyebrow>If the collateral falls</Eyebrow>
      <p className="mt-2 text-xs text-muted-foreground">{SCENARIO_SOURCE_NOTE[result.scenarioSource]}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="pb-2 font-normal text-muted-foreground">Scenario</th>
              <th className="pb-2 text-right font-normal text-muted-foreground">Health factor</th>
              <th className="pb-2 pl-4 font-normal text-muted-foreground">What that means</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.scenarios.map(scenario => (
              <tr key={`${scenario.label}-${scenario.ethPriceChangePercent}`}>
                <td className="py-2.5 pr-4">{scenario.label}</td>
                <td
                  className={`tabular py-2.5 text-right font-mono ${healthTone(
                    scenario.projectedHealthFactor.formatted,
                    scenario.liquidatable,
                  )}`}
                >
                  {scenario.projectedHealthFactor.formatted}
                </td>
                <td className={`py-2.5 pl-4 ${scenario.liquidatable ? "text-destructive" : "text-muted-foreground"}`}>
                  {scenario.interpretation}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div className="rounded-xl border border-border bg-secondary/40 p-5">
      <Eyebrow>What you entered</Eyebrow>
      <ul className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
        {result.input.collateral.map((leg, index) => (
          <li key={`${leg.symbol}-${index}`}>
            {leg.symbol || "Collateral"}: liquidation threshold {leg.liquidationThresholdBps / 100}%
            {leg.shockable ? "" : ", holds its value in a downturn"}
          </li>
        ))}
      </ul>
    </div>

    <details className="rounded-xl border border-border bg-card">
      <summary className="cursor-pointer px-5 py-4 text-sm font-medium">How this was worked out</summary>
      <div className="flex flex-col gap-4 border-t border-border px-5 py-5 text-xs text-muted-foreground">
        <p className="leading-relaxed">{result.methodology}</p>
        {result.marketContext ? (
          <p className="leading-relaxed">
            Market data: {result.marketContext.source}. Retrieved{" "}
            {new Date(result.marketContext.asOf).toLocaleString("en-NZ")}.
          </p>
        ) : (
          <p className="leading-relaxed">
            No market data was called. You supplied the scenarios, so this result is fully deterministic.
          </p>
        )}
        <ul className="flex list-inside list-disc flex-col gap-1">
          {result.sources.map(source => (
            <li key={source}>{source}</li>
          ))}
        </ul>
      </div>
    </details>

    <p className="text-xs leading-relaxed text-muted-foreground">{result.disclaimer}</p>
  </div>
);
