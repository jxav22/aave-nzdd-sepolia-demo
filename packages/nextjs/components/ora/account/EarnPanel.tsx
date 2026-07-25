"use client";

import { useState } from "react";
import { AmountField, validateAmount } from "~~/components/ora/AmountField";
import { TxSteps } from "~~/components/ora/TxSteps";
import { ActionButton, Card, DataRow, Eyebrow, Note, Stat } from "~~/components/ora/primitives";
import type { UseAaveHackathonMnzdReturn } from "~~/hooks/aave/useAaveHackathonMnzd";
import type { ReserveSummary } from "~~/hooks/aave/useHackathonMarket";
import { useTxSequence } from "~~/hooks/aave/useTxSequence";
import type { AssetPosition } from "~~/hooks/aave/useUserPositions";
import { parseTokenAmount } from "~~/utils/aave/amount";
import { formatNzd, formatPercent, formatTokenBare } from "~~/utils/format/money";

/**
 * Depositing New Zealand dollars to earn interest.
 *
 * This is the surface for someone who has never used a lending market, so it stays in plain
 * language: no collateral, no health factor, no liquidation, no protocol vocabulary. Depositing
 * NZD to earn cannot be liquidated, so none of that applies to them and showing it would only
 * frighten people for no reason.
 *
 * Depositing needs two signatures on-chain. That is a protocol constraint, not something the
 * depositor should have to understand, so both run behind one button with visible progress.
 */

export const EarnPanel = ({
  reserve,
  position,
  actions,
  onRefresh,
}: {
  reserve?: ReserveSummary;
  position: AssetPosition;
  actions: UseAaveHackathonMnzdReturn;
  onRefresh: () => void;
}) => {
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const sequence = useTxSequence();

  const decimals = position.decimals;
  const rate = reserve?.supplyApyPercent ?? 0;
  const walletBare = formatTokenBare(position.walletBalance, decimals);
  const depositedBare = formatTokenBare(position.deposited, decimals);

  const depositError = validateAmount(depositAmount, decimals, {
    value: walletBare,
    message: "More than you have available.",
  });
  const withdrawError = validateAmount(withdrawAmount, decimals, {
    value: depositedBare,
    message: "More than you have deposited.",
  });

  const canDeposit = Boolean(depositAmount.trim()) && !depositError && actions.state.isCorrectNetwork;
  const canWithdraw = Boolean(withdrawAmount.trim()) && !withdrawError && actions.state.isCorrectNetwork;

  /**
   * Approval is skipped when the existing allowance already covers the amount, so a repeat
   * deposit is a single signature rather than two.
   */
  const needsApproval = () => {
    try {
      return parseTokenAmount(depositAmount, decimals) > actions.state.allowance;
    } catch {
      return true;
    }
  };

  const runDeposit = async () => {
    const amount = depositAmount;
    const ok = await sequence.run([
      {
        id: "approve",
        label: `Allow the market to move ${formatNzd(parseSafe(amount, decimals), decimals)}`,
        shouldRun: needsApproval,
        run: () => actions.approve(amount),
      },
      {
        id: "deposit",
        label: `Deposit ${formatNzd(parseSafe(amount, decimals), decimals)}`,
        run: () => actions.supply(amount),
      },
    ]);

    if (ok) {
      setDepositAmount("");
      onRefresh();
    }
  };

  const runWithdraw = async (all: boolean) => {
    const ok = await sequence.run([
      {
        id: "withdraw",
        label: all
          ? "Withdraw everything you deposited"
          : `Withdraw ${formatNzd(parseSafe(withdrawAmount, decimals), decimals)}`,
        run: () => (all ? actions.withdrawAll() : actions.withdraw(withdrawAmount)),
      },
    ]);

    if (ok) {
      setWithdrawAmount("");
      onRefresh();
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
      <Card>
        <Eyebrow>Deposit</Eyebrow>
        <h2 className="mt-2 font-display text-3xl">Earn {formatPercent(rate)} on New Zealand dollars</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your deposit is lent to people borrowing New Zealand dollars, and the interest they pay accrues into your
          balance continuously. The rate moves with how much of the pool is borrowed, so it will change over time.
        </p>

        <div className="mt-7">
          <AmountField
            label="Amount to deposit"
            value={depositAmount}
            onChange={setDepositAmount}
            decimals={decimals}
            prefix="NZ$"
            meta={
              <>
                Available:{" "}
                <span className="tabular font-mono text-foreground">{formatNzd(position.walletBalance, decimals)}</span>
              </>
            }
            max={{ value: walletBare, message: "More than you have available." }}
            presets={presetsFor(position.walletBalance, decimals, walletBare)}
            disabled={sequence.isRunning}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <ActionButton onClick={runDeposit} disabled={!canDeposit} busy={sequence.isRunning}>
            {depositAmount.trim() && !depositError
              ? `Deposit ${formatNzd(parseSafe(depositAmount, decimals), decimals)}`
              : "Deposit"}
          </ActionButton>
          {position.walletBalance === 0n ? (
            <span className="text-xs text-muted-foreground">You have no New Zealand dollars in your account yet.</span>
          ) : null}
        </div>

        <TxSteps sequence={sequence} className="mt-5" />

        {position.deposited > 0n ? (
          <div className="hairline mt-8 pt-6">
            <Eyebrow>Withdraw</Eyebrow>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Available at any time. A withdrawal can be declined if the pool is fully lent out at that moment, or if
              you have a loan that your deposit is supporting.
            </p>
            <div className="mt-5">
              <AmountField
                label="Amount to withdraw"
                value={withdrawAmount}
                onChange={setWithdrawAmount}
                decimals={decimals}
                prefix="NZ$"
                meta={
                  <>
                    Deposited:{" "}
                    <span className="tabular font-mono text-foreground">{formatNzd(position.deposited, decimals)}</span>
                  </>
                }
                max={{ value: depositedBare, message: "More than you have deposited." }}
                disabled={sequence.isRunning}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <ActionButton
                tone="outline"
                onClick={() => runWithdraw(false)}
                disabled={!canWithdraw || sequence.isRunning}
              >
                Withdraw
              </ActionButton>
              <ActionButton tone="ghost" onClick={() => runWithdraw(true)} disabled={sequence.isRunning}>
                Withdraw everything
              </ActionButton>
            </div>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-col gap-6">
        <Card>
          <Eyebrow>Your deposit</Eyebrow>
          <div className="mt-4 grid grid-cols-2 gap-6">
            <Stat label="Deposited" value={formatNzd(position.deposited, decimals)} />
            <Stat label="Earning" value={formatPercent(rate)} accent hint="Variable" />
          </div>

          <div className="hairline mt-6 divide-y divide-border pt-2">
            <DataRow
              label="Interest over a year at this rate"
              value={estimateAnnualInterest(position.deposited, decimals, rate)}
              hint="If the rate held steady, which it will not"
            />
            <DataRow label="In your account" value={formatNzd(position.walletBalance, decimals)} />
          </div>
        </Card>

        <Card className="bg-[var(--pine-deep)] text-[var(--cream)]">
          <Eyebrow className="text-[var(--moss)]">Where the interest comes from</Eyebrow>
          <p className="mt-3 text-sm leading-relaxed text-[var(--cream)]/80">
            Everyone borrowing New Zealand dollars pays interest, and it is shared among the people who deposited them.
            The more of the pool that is lent out, the higher the rate you earn.
          </p>
          {reserve ? (
            <div className="hairline mt-6 pt-4 text-sm text-[var(--cream)]/70">
              <div className="flex justify-between">
                <span>Currently lent out</span>
                <span className="tabular font-mono">{formatPercent(reserve.utilisationPercent, 1)}</span>
              </div>
            </div>
          ) : null}
        </Card>

        {position.walletBalance === 0n && position.deposited === 0n ? (
          <Note tone="info" title="You will need New Zealand dollars first">
            Your account holds no New Zealand dollars yet. Once it does, they will show as available to deposit here.
          </Note>
        ) : null}
      </div>
    </div>
  );
};

/** Parses for display only; an unparseable draft renders as zero rather than throwing mid-render. */
function parseSafe(amount: string, decimals: number): bigint {
  try {
    return parseTokenAmount(amount, decimals);
  } catch {
    return 0n;
  }
}

function presetsFor(balance: bigint, decimals: number, bare: string) {
  const presets = [
    { label: "NZ$100", value: "100" },
    { label: "NZ$500", value: "500" },
    { label: "NZ$1,000", value: "1000" },
  ];
  if (balance > 0n) {
    presets.push({ label: "Everything", value: bare });
  }
  return presets;
}

/**
 * A year of interest at the current rate. Display arithmetic on a rate, not on a balance,
 * explicitly framed as conditional because the rate is variable.
 */
function estimateAnnualInterest(deposited: bigint, decimals: number, ratePercent: number): string {
  if (deposited === 0n || ratePercent <= 0) {
    return "-";
  }
  const scaled = (deposited * BigInt(Math.round(ratePercent * 10_000))) / 1_000_000n;
  return formatNzd(scaled, decimals);
}
