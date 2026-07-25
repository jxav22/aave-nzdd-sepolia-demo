"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import type { BorrowRiskReport } from "~~/services/risk/assistant";

/**
 * Borrow Risk Assistant panel.
 *
 * Calls the same public `/api/v1/borrow-risk` endpoint documented for third parties, so
 * the demo exercises the published contract rather than a private path. Renders only
 * what the server computed — no arithmetic happens here, so the UI cannot disagree with
 * the API. The user still confirms the borrow themselves; this panel can pre-fill the
 * amount field but never submits a transaction.
 */

const TARGET_HEALTH_FACTORS = [
  { value: "1.1", label: "1.1 — smaller buffer" },
  { value: "1.2", label: "1.2 — moderate buffer" },
  { value: "1.5", label: "1.5 — larger buffer" },
];

const SHOCK_OPTIONS = [
  { value: "10", label: "ETH falls 10%" },
  { value: "20", label: "ETH falls 20%" },
  { value: "30", label: "ETH falls 30%" },
];

type ApiEnvelope =
  | { ok: true; schemaVersion: string; data: BorrowRiskReport }
  | { ok: false; schemaVersion: string; error: { code: string; message: string; field?: string } };

export type BorrowRiskAssistantProps = {
  address?: Address;
  /** The borrow amount currently entered on the page, kept in sync both ways. */
  amount: string;
  onUseAmount: (value: string) => void;
  isCorrectNetwork: boolean;
};

async function fetchReport(params: {
  address: Address;
  amount: string;
  targetHealthFactor: string;
  shockPercent: string;
}): Promise<BorrowRiskReport> {
  const query = new URLSearchParams({
    address: params.address,
    borrowAmount: params.amount || "0",
    targetHealthFactor: params.targetHealthFactor,
    shockPercent: params.shockPercent,
  });

  const response = await fetch(`/api/v1/borrow-risk?${query}`);
  const body = (await response.json()) as ApiEnvelope;

  if (!body.ok) {
    throw new Error(body.error.message);
  }

  return body.data;
}

function healthFactorTone(formatted: string, liquidatable: boolean): string {
  if (liquidatable) {
    return "text-error";
  }
  if (formatted === "∞") {
    return "text-success";
  }
  const value = Number(formatted);
  if (Number.isFinite(value) && value < 1.25) {
    return "text-warning";
  }
  return "";
}

export const BorrowRiskAssistant = ({ address, amount, onUseAmount, isCorrectNetwork }: BorrowRiskAssistantProps) => {
  const [targetHealthFactor, setTargetHealthFactor] = useState("1.2");
  const [shockPercent, setShockPercent] = useState("20");

  const enabled = Boolean(address) && isCorrectNetwork;

  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ["borrow-risk", address, amount, targetHealthFactor, shockPercent],
    queryFn: () => fetchReport({ address: address as Address, amount, targetHealthFactor, shockPercent }),
    enabled,
    staleTime: 30_000,
    retry: false,
  });

  if (!enabled) {
    return (
      <div className="bg-base-200 rounded-lg p-4 text-sm">
        <h2 className="font-semibold text-base">Borrow Risk Assistant</h2>
        <p className="opacity-70 mt-1">
          {address
            ? "Switch to Sepolia to stress-test a proposed borrow."
            : "Connect a wallet to stress-test a proposed borrow against recent ETH market conditions."}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-base-200 rounded-lg p-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-base">Borrow Risk Assistant</h2>
          <p className="text-xs opacity-70 mt-1">
            Aave decides what you may borrow. This panel stress-tests that amount against recent public ETH market data
            from Binance.
          </p>
        </div>
        <button className="btn btn-ghost btn-xs" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? <span className="loading loading-spinner loading-xs" /> : null}
          Refresh
        </button>
      </div>

      {error && (
        <div className="alert alert-error text-sm">
          <span>{error instanceof Error ? error.message : "Could not run the risk assessment."}</span>
        </div>
      )}

      {!data && isFetching && (
        <div className="flex items-center gap-2 text-sm opacity-70">
          <span className="loading loading-spinner loading-sm" />
          Reading your Aave position and calling the Binance Skill…
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="opacity-70">Aave protocol maximum</div>
              <div className="font-mono text-lg">
                {data.proposal.protocolMaximum.formatted} {data.market.borrowSymbol}
              </div>
            </div>
            <div>
              <div className="opacity-70">Your proposed borrow</div>
              <div className="font-mono text-lg">
                {data.proposal.proposedBorrow.formatted} {data.market.borrowSymbol}
              </div>
            </div>
            <div>
              <div className="opacity-70">Projected health factor</div>
              <div
                className={`font-mono text-lg ${healthFactorTone(
                  data.proposal.projectedHealthFactor.formatted,
                  data.scenarios[0]?.liquidatable ?? false,
                )}`}
              >
                {data.proposal.projectedHealthFactor.formatted}
              </div>
            </div>
          </div>

          <div className="bg-base-100 rounded-lg p-3 text-sm">
            <div className="font-semibold text-xs uppercase opacity-60 mb-1">Recent ETH market condition</div>
            {data.marketContext.degraded ? (
              <p className="opacity-80">
                Live market data is unavailable right now, so the scenarios below use fixed reference declines.
              </p>
            ) : (
              <p className="opacity-80">
                ETH is trading around US${data.marketContext.ethPriceUsd?.toFixed(2)} (
                {data.marketContext.change24hPercent}% over 24h). Daily movement has averaged{" "}
                {data.marketContext.dailyVolatilityPercent}% with a deepest 30-day fall of{" "}
                {Math.abs(data.marketContext.maxDrawdown30dPercent)}% across {data.marketContext.candleCount} candles.
              </p>
            )}
            <p className="text-xs opacity-60 mt-1">
              Source: {data.marketContext.source}. No Binance account or API key is used.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>ETH price movement</th>
                  <th className="text-right">Projected health factor</th>
                  <th>Interpretation</th>
                </tr>
              </thead>
              <tbody>
                {data.scenarios.map(scenario => (
                  <tr key={`${scenario.label}-${scenario.ethPriceChangePercent}`}>
                    <td>{scenario.label}</td>
                    <td
                      className={`text-right font-mono ${healthFactorTone(
                        scenario.projectedHealthFactor.formatted,
                        scenario.liquidatable,
                      )}`}
                    >
                      {scenario.projectedHealthFactor.formatted}
                    </td>
                    <td className={scenario.liquidatable ? "text-error" : ""}>{scenario.interpretation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.proposal.liquidationAtEthChangePercent !== null && (
            <p className="text-sm">
              On these figures, ETH would need to fall about{" "}
              <strong>{Math.abs(data.proposal.liquidationAtEthChangePercent)}%</strong> before this position could be
              liquidated.
            </p>
          )}

          <div className="bg-base-100 rounded-lg p-3 flex flex-col gap-3">
            <div className="font-semibold text-xs uppercase opacity-60">Stress tolerance</div>
            <div className="flex flex-wrap gap-3">
              <label className="form-control">
                <span className="label-text text-xs mb-1">Hold health factor at least</span>
                <select
                  className="select select-bordered select-sm"
                  value={targetHealthFactor}
                  onChange={e => setTargetHealthFactor(e.target.value)}
                >
                  {TARGET_HEALTH_FACTORS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-control">
                <span className="label-text text-xs mb-1">Under a decline of</span>
                <select
                  className="select select-bordered select-sm"
                  value={shockPercent}
                  onChange={e => setShockPercent(e.target.value)}
                >
                  {SHOCK_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm">
                <span className="opacity-70">Stress-tested amount: </span>
                <span className="font-mono font-semibold">
                  {data.stressTest.stressTestedMaximum.formatted} {data.market.borrowSymbol}
                </span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                disabled={data.stressTest.stressTestedMaximum.raw === "0"}
                onClick={() => onUseAmount(data.stressTest.stressTestedMaximum.formatted)}
              >
                Use stress-tested amount
              </button>
            </div>
            {data.stressTest.cappedByProtocolMaximum && (
              <p className="text-xs opacity-70">
                Aave&apos;s own limit is lower than the stress-tested figure, so the protocol maximum is shown.
              </p>
            )}
            <p className="text-xs opacity-70">
              This only fills in the amount field. You still review and confirm the borrow in your wallet.
            </p>
          </div>

          <p className="text-sm">{data.explanation}</p>

          {data.warnings.map(warning => (
            <div key={warning} className="alert alert-warning text-sm">
              <span>{warning}</span>
            </div>
          ))}

          <details className="collapse collapse-arrow bg-base-100">
            <summary className="collapse-title text-sm font-semibold">How was this calculated?</summary>
            <div className="collapse-content text-xs flex flex-col gap-3">
              <div>
                <div className="font-semibold mb-1">Aave position data used</div>
                <ul className="list-disc list-inside opacity-80">
                  <li>
                    Collateral supplied: {data.position.collateralSupplied.formatted} {data.market.collateralSymbol}
                  </li>
                  <li>Total collateral: {data.position.totalCollateralBase.formatted} base units</li>
                  <li>Existing debt: {data.position.totalDebtBase.formatted} base units</li>
                  <li>Liquidation threshold: {data.position.liquidationThresholdBps / 100}%</li>
                  <li>Available to borrow: {data.position.availableBorrowsBase.formatted} base units</li>
                  <li>Read at block {data.market.blockNumber}</li>
                </ul>
              </div>

              <div>
                <div className="font-semibold mb-1">Aave oracle prices used</div>
                <ul className="list-disc list-inside opacity-80">
                  <li>
                    {data.market.collateralSymbol}: {data.oracleDivergence.aaveCollateralPrice.formatted} base units
                  </li>
                  <li>
                    {data.market.borrowSymbol}: {data.oracleDivergence.aaveBorrowAssetPrice.formatted} base units
                  </li>
                </ul>
                <p className="opacity-80 mt-1">{data.oracleDivergence.note}</p>
              </div>

              <div>
                <div className="font-semibold mb-1">Binance Skills data used</div>
                <ul className="list-disc list-inside opacity-80">
                  <li>{data.marketContext.source}</li>
                  <li>Authentication required: no</li>
                  {data.marketContext.endpoints.map(endpoint => (
                    <li key={endpoint} className="break-all font-mono">
                      {endpoint}
                    </li>
                  ))}
                  <li>Retrieved {new Date(data.marketContext.asOf).toLocaleString()}</li>
                </ul>
              </div>

              <div>
                <div className="font-semibold mb-1">Stress assumptions</div>
                <p className="opacity-80">{data.methodology}</p>
              </div>

              <div>
                <div className="font-semibold mb-1">Self-check against Aave</div>
                <p className="opacity-80">
                  Aave reports {data.selfCheck.aaveReportedHealthFactor.formatted}; recomputing from the per-asset model
                  gives {data.selfCheck.recomputedHealthFactor.formatted}.{" "}
                  {data.selfCheck.matches ? "These agree." : "These disagree — treat the table with caution."}
                </p>
              </div>

              <div>
                <div className="font-semibold mb-1">Agent steps</div>
                <ol className="list-decimal list-inside opacity-80 flex flex-col gap-1">
                  {data.steps.map(step => (
                    <li key={step.step}>
                      <span className="font-mono">{step.tool}</span> — {step.detail}
                      {step.durationMs > 0 ? ` (${step.durationMs}ms)` : ""}
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <div className="font-semibold mb-1">Sources</div>
                <ul className="list-disc list-inside opacity-80">
                  {data.sources.map(source => (
                    <li key={source}>{source}</li>
                  ))}
                </ul>
              </div>

              <p className="opacity-80">
                This assessment is also available as a public API:{" "}
                <code className="break-all">GET /api/v1/borrow-risk?address={data.position.address}</code>
              </p>
            </div>
          </details>

          <p className="text-xs opacity-60">{data.disclaimer}</p>
        </>
      )}
    </div>
  );
};
