"use client";

import { useState } from "react";
import { isAddress } from "viem";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import { RiskReportView } from "~~/components/ora/RiskReportView";
import { SimulationResultView } from "~~/components/ora/SimulationResultView";
import { ActionButton, Card, Eyebrow, Note } from "~~/components/ora/primitives";
import { useBorrowRisk } from "~~/hooks/aave/useBorrowRisk";
import { useSimulateRisk } from "~~/hooks/aave/useSimulateRisk";
import { formatPercent } from "~~/utils/format/money";

/**
 * The full stress tester.
 *
 * One primary path — assess a real position, defaulting to the connected account — with a single
 * disclosure for describing a position by hand. The hand-entered path calls the stateless
 * simulate endpoint, so it needs no wallet, no address and no market position of any kind.
 */

const TARGET_OPTIONS = [
  { value: "1.1", label: "1.1 — a slim buffer" },
  { value: "1.2", label: "1.2 — a moderate buffer" },
  { value: "1.5", label: "1.5 — a large buffer" },
];

const SHOCK_OPTIONS = ["10", "20", "30"];

export const StressTester = () => {
  const { address: connectedAddress } = useAccount();
  const [manual, setManual] = useState(false);

  const [addressInput, setAddressInput] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [targetHealthFactor, setTargetHealthFactor] = useState("1.2");
  const [shockPercent, setShockPercent] = useState("20");

  const effectiveAddress: Address | undefined = addressInput.trim()
    ? isAddress(addressInput.trim())
      ? (addressInput.trim() as Address)
      : undefined
    : connectedAddress;

  const addressInvalid = Boolean(addressInput.trim()) && !isAddress(addressInput.trim());

  const { report, error, isFetching, refetch } = useBorrowRisk({
    address: effectiveAddress,
    borrowAmount: borrowAmount.trim() || "0",
    targetHealthFactor,
    shockPercent,
    enabled: !manual && Boolean(effectiveAddress),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow>Stress test</Eyebrow>
            <h3 className="mt-2 font-display text-2xl">Try a loan before you take it</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Applies declines drawn from how ETH has actually moved to a position, and shows the health factor each one
              would produce. Nothing here moves any money.
            </p>
          </div>
          {!manual ? (
            <ActionButton tone="ghost" onClick={() => refetch()} busy={isFetching}>
              Refresh
            </ActionButton>
          ) : null}
        </div>

        {!manual ? (
          <>
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1.5 lg:col-span-2">
                <Eyebrow>Account to assess</Eyebrow>
                <input
                  type="text"
                  value={addressInput}
                  onChange={event => setAddressInput(event.target.value)}
                  placeholder={connectedAddress ?? "0x…"}
                  aria-invalid={addressInvalid}
                  className="rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/40"
                />
                {addressInvalid ? (
                  <span className="text-xs text-destructive">That is not a valid address.</span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {connectedAddress && !addressInput.trim()
                      ? "Using your connected account."
                      : "Any account on this market."}
                  </span>
                )}
              </label>

              <label className="flex flex-col gap-1.5">
                <Eyebrow>Loan to test (NZD)</Eyebrow>
                <input
                  type="text"
                  inputMode="decimal"
                  value={borrowAmount}
                  onChange={event => setBorrowAmount(event.target.value)}
                  placeholder="0"
                  className="tabular rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <Eyebrow>Buffer to hold</Eyebrow>
                <select
                  value={targetHealthFactor}
                  onChange={event => setTargetHealthFactor(event.target.value)}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                >
                  {TARGET_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5">
              <Eyebrow>Through a fall in ETH of</Eyebrow>
              <div className="mt-2 flex gap-2">
                {SHOCK_OPTIONS.map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setShockPercent(option)}
                    className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
                      shockPercent === option
                        ? "border-[var(--pine)] bg-[var(--pine)] text-[var(--cream)]"
                        : "border-input text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {formatPercent(Number(option), 0)}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <Note tone="error" className="mt-6">
                {error.message}
              </Note>
            ) : null}

            {!effectiveAddress ? (
              <Note tone="info" className="mt-6">
                Enter an account address, or sign in to assess your own position. To try figures without any account at
                all, describe a position by hand below.
              </Note>
            ) : null}

            {!report && isFetching ? (
              <p className="mt-6 text-sm text-muted-foreground">Reading the position and recent market data…</p>
            ) : null}

            {report ? (
              <div className="mt-8">
                <RiskReportView report={report} onUseAmount={setBorrowAmount} />
              </div>
            ) : null}
          </>
        ) : null}

        <div className={manual ? "" : "hairline mt-8 pt-5"}>
          <button
            type="button"
            onClick={() => setManual(value => !value)}
            className="text-sm underline underline-offset-4 hover:text-foreground"
          >
            {manual ? "← Assess a real account instead" : "Or describe a position by hand"}
          </button>
        </div>

        {manual ? <ManualSimulation /> : null}
      </Card>
    </div>
  );
};

type Leg = {
  id: number;
  symbol: string;
  value: string;
  liquidationThresholdBps: string;
  shockable: boolean;
};

let nextLegId = 1;

const ManualSimulation = () => {
  const [legs, setLegs] = useState<Leg[]>([
    { id: 0, symbol: "ETH", value: "1850", liquidationThresholdBps: "8600", shockable: true },
  ]);
  const [debt, setDebt] = useState("0");
  const [proposedBorrow, setProposedBorrow] = useState("1000");
  const [targetHealthFactor, setTargetHealthFactor] = useState("1.2");
  const [shockPercent, setShockPercent] = useState("20");

  const { simulate, report, error, isPending, reset } = useSimulateRisk();

  const addLeg = () => {
    if (legs.length >= 10) return;
    setLegs(current => [
      ...current,
      { id: nextLegId++, symbol: "", value: "0", liquidationThresholdBps: "8600", shockable: true },
    ]);
  };

  const updateLeg = (id: number, patch: Partial<Leg>) => {
    setLegs(current => current.map(leg => (leg.id === id ? { ...leg, ...patch } : leg)));
  };

  const legErrors = legs.map(leg => {
    if (!/^\d+(\.\d+)?$/.test(leg.value.trim())) return "Value must be a number.";
    const bps = Number(leg.liquidationThresholdBps);
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) return "Threshold must be 0–10000.";
    return undefined;
  });

  const targetInvalid = Number(targetHealthFactor) < 1 || Number(targetHealthFactor) > 100;
  const shockInvalid = Number(shockPercent) < 0 || Number(shockPercent) > 100;
  const hasErrors = legErrors.some(Boolean) || targetInvalid || shockInvalid;

  return (
    <div className="mt-6">
      <Eyebrow>Describe a position</Eyebrow>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        No account and no market position needed. Enter collateral values in dollars, what is already owed, and the loan
        you want to test. Turn off &ldquo;falls in a downturn&rdquo; for collateral that holds its value.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {legs.map((leg, index) => (
          <div key={leg.id} className="rounded-xl border border-border bg-secondary/40 p-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <label className="flex flex-col gap-1.5">
                <Eyebrow>Asset (optional)</Eyebrow>
                <input
                  type="text"
                  value={leg.symbol}
                  onChange={event => updateLeg(leg.id, { symbol: event.target.value })}
                  placeholder="ETH"
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <Eyebrow>Value</Eyebrow>
                <input
                  type="text"
                  inputMode="decimal"
                  value={leg.value}
                  onChange={event => updateLeg(leg.id, { value: event.target.value })}
                  className="tabular rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <Eyebrow>Liquidation threshold (bps)</Eyebrow>
                <input
                  type="text"
                  inputMode="numeric"
                  value={leg.liquidationThresholdBps}
                  onChange={event => updateLeg(leg.id, { liquidationThresholdBps: event.target.value })}
                  className="tabular rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={leg.shockable}
                    onChange={event => updateLeg(leg.id, { shockable: event.target.checked })}
                    className="h-4 w-4 accent-[var(--pine)]"
                  />
                  Falls in a downturn
                </label>
                {legs.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setLegs(current => current.filter(item => item.id !== leg.id))}
                    className="pb-2 text-xs text-muted-foreground underline underline-offset-4 hover:text-destructive"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
            {legErrors[index] ? <p className="mt-2 text-xs text-destructive">{legErrors[index]}</p> : null}
          </div>
        ))}
      </div>

      {legs.length < 10 ? (
        <button
          type="button"
          onClick={addLeg}
          className="mt-3 text-sm underline underline-offset-4 hover:text-foreground"
        >
          + Add another kind of collateral
        </button>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Ten kinds of collateral is the maximum.</p>
      )}

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5">
          <Eyebrow>Already owed</Eyebrow>
          <input
            type="text"
            inputMode="decimal"
            value={debt}
            onChange={event => setDebt(event.target.value)}
            className="tabular rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Eyebrow>Loan to test</Eyebrow>
          <input
            type="text"
            inputMode="decimal"
            value={proposedBorrow}
            onChange={event => setProposedBorrow(event.target.value)}
            className="tabular rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Eyebrow>Buffer to hold</Eyebrow>
          <input
            type="text"
            inputMode="decimal"
            value={targetHealthFactor}
            onChange={event => setTargetHealthFactor(event.target.value)}
            aria-invalid={targetInvalid}
            className="tabular rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/40"
          />
          {targetInvalid ? <span className="text-xs text-destructive">Must be between 1.0 and 100.</span> : null}
        </label>
        <label className="flex flex-col gap-1.5">
          <Eyebrow>Fall to apply (%)</Eyebrow>
          <input
            type="text"
            inputMode="decimal"
            value={shockPercent}
            onChange={event => setShockPercent(event.target.value)}
            aria-invalid={shockInvalid}
            className="tabular rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/40"
          />
          {shockInvalid ? <span className="text-xs text-destructive">Must be between 0 and 100.</span> : null}
        </label>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <ActionButton
          disabled={hasErrors}
          busy={isPending}
          onClick={() =>
            simulate({
              collateral: legs.map(leg => ({
                symbol: leg.symbol.trim() || undefined,
                value: leg.value.trim(),
                liquidationThresholdBps: Number(leg.liquidationThresholdBps),
                shockable: leg.shockable,
              })),
              debt: debt.trim() || "0",
              proposedBorrow: proposedBorrow.trim() || "0",
              targetHealthFactor: targetHealthFactor.trim() || "1.2",
              shockPercent: Number(shockPercent) || 20,
            })
          }
        >
          Run the test
        </ActionButton>
        {report ? (
          <ActionButton tone="ghost" onClick={reset}>
            Clear
          </ActionButton>
        ) : null}
      </div>

      {error ? (
        <Note tone="error" className="mt-6">
          {error.message}
        </Note>
      ) : null}

      {report ? (
        <div className="mt-8">
          <SimulationResultView result={report} />
        </div>
      ) : null}
    </div>
  );
};
