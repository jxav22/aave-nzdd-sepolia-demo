"use client";

import { DataRow, Eyebrow, Note, Stat } from "~~/components/ora/primitives";
import type { BorrowRiskReport } from "~~/services/risk/assistant";

/**
 * Shared renderer for a borrow risk report.
 *
 * Used compactly beside the borrow form and in full on the stress tester, so both read from one
 * implementation. Constraints from the API's own terms of use are enforced here rather than left
 * to each caller:
 *
 * - `disclaimer` is always rendered and never inside a collapsed section.
 * - The stress-tested figure is never described as safe or recommended, it is the amount that
 *   holds a chosen health factor through one chosen decline, and other declines exist.
 * - The protocol's own maximum stays labelled as the protocol's limit.
 * - `degraded` and a failed `selfCheck` are surfaced, not swallowed.
 */

const SCENARIO_SOURCE_LABEL: Record<string, string> = {
  current: "Today's price",
  volatility: "How much it moves on a normal day",
  drawdown: "Its worst recent fall",
  reference: "A reference decline",
  user: "The decline you chose",
  fallback: "A reference decline",
};

function healthTone(formatted: string, liquidatable: boolean): string {
  if (liquidatable) {
    return "text-destructive";
  }
  if (formatted === "∞") {
    return "text-[var(--pine)]";
  }
  const value = Number(formatted);
  if (Number.isFinite(value) && value < 1.25) {
    return "text-[var(--clay)]";
  }
  return "text-[var(--pine)]";
}

export const RiskWarnings = ({ report }: { report: BorrowRiskReport }) => (
  <>
    {report.marketContext.degraded ? (
      <Note tone="warning" title="Live market data is unavailable">
        The declines below are fixed reference figures rather than measurements of how ETH has actually been moving.
        {report.marketContext.degradedReason ? ` ${report.marketContext.degradedReason}` : ""}
      </Note>
    ) : null}

    {!report.selfCheck.matches ? (
      <Note tone="error" title="These projections do not agree with the protocol">
        Our model of your collateral disagrees with the lending pool&apos;s own health factor, so the scenarios below
        may not reflect how your position is actually valued. {report.selfCheck.note}
      </Note>
    ) : null}

    {report.warnings.map(warning => (
      <Note key={warning} tone="warning">
        {warning}
      </Note>
    ))}
  </>
);

export const ScenarioTable = ({ report, compact = false }: { report: BorrowRiskReport; compact?: boolean }) => {
  const scenarios = compact
    ? [...report.scenarios].sort((a, b) => a.ethPriceChangePercent - b.ethPriceChangePercent).slice(0, 3)
    : report.scenarios;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="pb-2 font-normal text-muted-foreground">If ETH falls</th>
            <th className="pb-2 text-right font-normal text-muted-foreground">Health factor</th>
            {compact ? null : <th className="pb-2 pl-4 font-normal text-muted-foreground">What that means</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {scenarios.map(scenario => (
            <tr key={`${scenario.label}-${scenario.ethPriceChangePercent}`}>
              <td className="py-2.5 pr-4">
                <span className="text-foreground">{scenario.label}</span>
                {compact ? null : (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {SCENARIO_SOURCE_LABEL[scenario.derivedFrom] ?? scenario.derivedFrom}
                  </span>
                )}
              </td>
              <td
                className={`tabular py-2.5 text-right font-mono ${healthTone(
                  scenario.projectedHealthFactor.formatted,
                  scenario.liquidatable,
                )}`}
              >
                {scenario.projectedHealthFactor.formatted}
              </td>
              {compact ? null : (
                <td className={`py-2.5 pl-4 ${scenario.liquidatable ? "text-destructive" : "text-muted-foreground"}`}>
                  {scenario.interpretation}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const StressTestedAmount = ({
  report,
  onUseAmount,
}: {
  report: BorrowRiskReport;
  onUseAmount?: (amount: string) => void;
}) => (
  <div className="rounded-xl border border-border bg-secondary/40 p-5">
    <Eyebrow>How much would still hold up</Eyebrow>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
      Borrowing{" "}
      <span className="tabular font-mono text-foreground">
        {report.stressTest.stressTestedMaximum.formatted} {report.market.borrowSymbol}
      </span>{" "}
      would keep your health factor at or above {report.stressTest.targetHealthFactor.formatted} through a{" "}
      {Math.abs(report.stressTest.shockEthPriceChangePercent)}% fall in ETH. That is one decline out of many. A larger
      fall than that would take you further.
    </p>

    {report.stressTest.cappedByProtocolMaximum ? (
      <p className="mt-3 text-xs text-muted-foreground">
        The lending pool&apos;s own limit is lower than this figure, so the pool&apos;s limit is what is shown.
      </p>
    ) : null}

    {onUseAmount ? (
      <button
        type="button"
        disabled={report.stressTest.stressTestedMaximum.raw === "0"}
        onClick={() => onUseAmount(report.stressTest.stressTestedMaximum.formatted)}
        className="mt-4 rounded-full border border-input bg-background px-4 py-2 text-xs transition-colors hover:bg-card disabled:opacity-50"
      >
        Put this amount in the form
      </button>
    ) : null}
  </div>
);

export const MarketContextLine = ({ report }: { report: BorrowRiskReport }) => {
  const context = report.marketContext;

  if (context.degraded) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        Live market data is unavailable, so the declines used are fixed reference figures.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        ETH is trading around US${context.ethPriceUsd?.toFixed(2)}
        {context.change24hPercent !== null ? `, ${context.change24hPercent}% over the last day` : ""}. Day to day it has
        moved about {context.dailyVolatilityPercent}%, and its deepest fall in the last 30 days was{" "}
        {Math.abs(context.maxDrawdown30dPercent)}%.
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground/80">Market data: {context.source}</p>
    </div>
  );
};

export const Disclaimer = ({ report }: { report: BorrowRiskReport }) => (
  <p className="text-xs leading-relaxed text-muted-foreground">{report.disclaimer}</p>
);

/** The full report, including provenance. Used on the stress tester. */
export const RiskReportView = ({
  report,
  onUseAmount,
}: {
  report: BorrowRiskReport;
  onUseAmount?: (amount: string) => void;
}) => (
  <div className="flex flex-col gap-6">
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      <Stat
        label="The pool will lend you"
        value={`${report.proposal.protocolMaximum.formatted}`}
        hint={`${report.market.borrowSymbol} · the pool's own limit`}
      />
      <Stat
        label="You asked about"
        value={`${report.proposal.proposedBorrow.formatted}`}
        hint={report.market.borrowSymbol}
      />
      <Stat
        label="Health factor after"
        value={report.proposal.projectedHealthFactor.formatted}
        accent
        hint="1.0 is where liquidation begins"
      />
    </div>

    <RiskWarnings report={report} />

    <div className="rounded-xl border border-border bg-card p-5">
      <Eyebrow>Recent ETH behaviour</Eyebrow>
      <div className="mt-3">
        <MarketContextLine report={report} />
      </div>
    </div>

    <div>
      <Eyebrow>If the price falls</Eyebrow>
      <div className="mt-4">
        <ScenarioTable report={report} />
      </div>
    </div>

    {report.proposal.liquidationAtEthChangePercent !== null ? (
      <p className="text-sm leading-relaxed">
        On these figures, ETH would need to fall about{" "}
        <strong>{Math.abs(report.proposal.liquidationAtEthChangePercent)}%</strong> before this position could be
        liquidated.
      </p>
    ) : null}

    <StressTestedAmount report={report} onUseAmount={onUseAmount} />

    <p className="text-sm leading-relaxed">{report.explanation}</p>

    <details className="rounded-xl border border-border bg-card">
      <summary className="cursor-pointer px-5 py-4 text-sm font-medium">How this was worked out</summary>
      <div className="flex flex-col gap-5 border-t border-border px-5 py-5 text-xs">
        <div>
          <Eyebrow>Your position</Eyebrow>
          <div className="mt-2 divide-y divide-border">
            <DataRow
              label="Collateral deposited"
              value={`${report.position.collateralSupplied.formatted} ${report.market.collateralSymbol}`}
            />
            <DataRow label="Total collateral value" value={report.position.totalCollateralBase.formatted} />
            <DataRow label="Existing debt" value={report.position.totalDebtBase.formatted} />
            <DataRow label="Liquidation threshold" value={`${report.position.liquidationThresholdBps / 100}%`} />
            <DataRow label="Read at block" value={report.market.blockNumber} />
          </div>
        </div>

        <div>
          <Eyebrow>Prices used</Eyebrow>
          <div className="mt-2 divide-y divide-border">
            <DataRow
              label={report.market.collateralSymbol}
              value={report.oracleDivergence.aaveCollateralPrice.formatted}
            />
            <DataRow
              label={report.market.borrowSymbol}
              value={report.oracleDivergence.aaveBorrowAssetPrice.formatted}
            />
          </div>
          <p className="mt-2 leading-relaxed text-muted-foreground">{report.oracleDivergence.note}</p>
        </div>

        <div>
          <Eyebrow>Market data</Eyebrow>
          <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
            <li>{report.marketContext.source}</li>
            <li>Retrieved {new Date(report.marketContext.asOf).toLocaleString("en-NZ")}</li>
            {report.marketContext.endpoints.map(endpoint => (
              <li key={endpoint} className="break-all font-mono">
                {endpoint}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <Eyebrow>Method</Eyebrow>
          <p className="mt-2 leading-relaxed text-muted-foreground">{report.methodology}</p>
        </div>

        <div>
          <Eyebrow>Checked against the pool</Eyebrow>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            The pool reports a health factor of {report.selfCheck.aaveReportedHealthFactor.formatted}; recomputing it
            from the individual collateral positions gives {report.selfCheck.recomputedHealthFactor.formatted}.{" "}
            {report.selfCheck.matches ? "These agree." : "These disagree, so treat the table above with caution."}
          </p>
        </div>

        <div>
          <Eyebrow>Steps</Eyebrow>
          <ol className="mt-2 flex flex-col gap-1 text-muted-foreground">
            {report.steps.map(step => (
              <li key={step.step}>
                <span className="font-mono">{step.tool}</span>: {step.detail}
                {step.durationMs > 0 ? ` (${step.durationMs}ms)` : ""}
              </li>
            ))}
          </ol>
        </div>

        <div>
          <Eyebrow>Sources</Eyebrow>
          <ul className="mt-2 flex list-inside list-disc flex-col gap-1 text-muted-foreground">
            {report.sources.map(source => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>

    <Disclaimer report={report} />
  </div>
);
