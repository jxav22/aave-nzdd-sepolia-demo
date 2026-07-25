"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Address } from "viem";
import { AmountField, validateAmount } from "~~/components/ora/AmountField";
import { HealthMeter } from "~~/components/ora/HealthMeter";
import {
  Disclaimer,
  MarketContextLine,
  RiskWarnings,
  ScenarioTable,
  StressTestedAmount,
} from "~~/components/ora/RiskReportView";
import { TwoStepActions } from "~~/components/ora/TwoStepActions";
import { TxSteps } from "~~/components/ora/TxSteps";
import { ActionButton, Card, DataRow, Eyebrow, Note, Pill, Stat } from "~~/components/ora/primitives";
import type { HackathonAssetSymbol } from "~~/config/aaveHackathonMnzd";
import { useAaveHackathonMnzd } from "~~/hooks/aave/useAaveHackathonMnzd";
import type { UseAaveHackathonMnzdReturn } from "~~/hooks/aave/useAaveHackathonMnzd";
import { useBorrowRisk } from "~~/hooks/aave/useBorrowRisk";
import type { ReserveSummary } from "~~/hooks/aave/useHackathonMarket";
import { useTxSequence } from "~~/hooks/aave/useTxSequence";
import type { UserPositions } from "~~/hooks/aave/useUserPositions";
import { parseTokenAmount } from "~~/utils/aave/amount";
import { formatBase, formatNzd, formatPercent, formatToken, formatTokenBare } from "~~/utils/format/money";

/**
 * Borrowing New Zealand dollars against ETH or Bitcoin collateral.
 *
 * Two ordered steps on one surface: deposit collateral, then borrow against it. Allowing the
 * market to move tokens and depositing / repaying are also separate confirmations, because
 * chaining them breaks embedded-wallet signing and can race the allowance refresh.
 *
 * The consequences of borrowing against a volatile asset are stated in plain words directly
 * above the borrow action and are never collapsed. Someone new to this has to be able to see,
 * before committing, that a large enough fall costs them the collateral.
 *
 * Borrowing capacity and available liquidity are shown as separate figures throughout. They are
 * different constraints, and a borrow within your capacity still fails if the pool has nothing
 * to lend.
 */

const COLLATERAL_ASSETS: HackathonAssetSymbol[] = ["wETH", "wBTC"];

const COLLATERAL_LABEL: Record<string, string> = {
  wETH: "Ether",
  wBTC: "Bitcoin",
};

const TARGET_HEALTH_OPTIONS = [
  { value: "1.1", label: "A slim buffer" },
  { value: "1.2", label: "A moderate buffer" },
  { value: "1.5", label: "A large buffer" },
];

const SHOCK_OPTIONS = [
  { value: "10", label: "10%" },
  { value: "20", label: "20%" },
  { value: "30", label: "30%" },
];

export const BorrowPanel = ({
  address,
  positions,
  nzdReserve,
  reserveBySymbol,
  nzdActions,
  onRefresh,
}: {
  address?: Address;
  positions: UserPositions;
  nzdReserve?: ReserveSummary;
  reserveBySymbol: Record<HackathonAssetSymbol, ReserveSummary | undefined>;
  nzdActions: UseAaveHackathonMnzdReturn;
  onRefresh: () => void;
}) => {
  const [collateralSymbol, setCollateralSymbol] = useState<HackathonAssetSymbol>("wETH");
  const [collateralAmount, setCollateralAmount] = useState("");
  const [ethAmount, setEthAmount] = useState("");
  const [borrowAmount, setBorrowAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [targetHealthFactor, setTargetHealthFactor] = useState("1.2");
  const [shockPercent, setShockPercent] = useState("20");

  const collateralSequence = useTxSequence();
  const borrowSequence = useTxSequence();
  const repaySequence = useTxSequence();

  const collateralActions = useAaveHackathonMnzd(collateralSymbol);
  const collateralPosition = positions.positions[collateralSymbol];
  const collateralReserve = reserveBySymbol[collateralSymbol];
  const nzdPosition = positions.positions.dNZD;
  const nzdDecimals = nzdPosition.decimals;

  const poolLiquidity = nzdReserve?.availableLiquidity ?? 0n;
  const poolIsEmpty = poolLiquidity === 0n;

  const collateralBare = formatTokenBare(collateralPosition.walletBalance, collateralPosition.decimals);
  const collateralError = validateAmount(collateralAmount, collateralPosition.decimals, {
    value: collateralBare,
    message: `More ${collateralSymbol === "wETH" ? "ETH" : "Bitcoin"} than you hold.`,
  });

  /**
   * The borrow ceiling is the lower of what the pool will lend this position and what the pool
   * actually holds. Capacity alone is not enough, a borrow above available liquidity reverts.
   */
  const borrowCeiling = useMemo(() => {
    const capacity = availableBorrowsInNzd(positions.availableBorrowsBase, nzdDecimals);
    return capacity < poolLiquidity ? capacity : poolLiquidity;
  }, [positions.availableBorrowsBase, nzdDecimals, poolLiquidity]);

  const borrowCeilingBare = formatTokenBare(borrowCeiling, nzdDecimals);
  const borrowError = validateAmount(borrowAmount, nzdDecimals, {
    value: borrowCeilingBare,
    message: "More than you can borrow against this collateral right now.",
  });

  const debtBare = formatTokenBare(nzdPosition.borrowed, nzdDecimals);
  const repayError = validateAmount(repayAmount, nzdDecimals, {
    value: debtBare,
    message: "More than you owe.",
  });

  const liveRisk = useBorrowRisk({
    address,
    borrowAmount: borrowAmount.trim() || "0",
    targetHealthFactor,
    shockPercent,
    enabled: positions.isCorrectNetwork && positions.hasCollateral,
  });

  const report = liveRisk.report;

  /** Step 1 is done when the typed collateral amount is already covered by allowance. */
  const collateralAllowanceReady = (() => {
    if (!collateralAmount.trim()) return false;
    try {
      return parseTokenAmount(collateralAmount, collateralPosition.decimals) <= collateralActions.state.allowance;
    } catch {
      return false;
    }
  })();

  const canDepositCollateral = Boolean(collateralAmount.trim()) && !collateralError && positions.isCorrectNetwork;

  const runApproveCollateral = async () => {
    const amount = collateralAmount;
    const ok = await collateralSequence.run([
      {
        id: "approve",
        label: `Allow the market to move your ${COLLATERAL_LABEL[collateralSymbol]}`,
        run: () => collateralActions.approve(amount),
      },
    ]);

    if (ok) {
      onRefresh();
      collateralActions.refresh();
    }
  };

  const runDepositCollateral = async () => {
    const amount = collateralAmount;
    const ok = await collateralSequence.run([
      {
        id: "deposit",
        label: `Deposit ${amount} ${collateralSymbol === "wETH" ? "ETH" : "BTC"} as collateral`,
        run: () => collateralActions.supply(amount),
      },
    ]);

    if (ok) {
      setCollateralAmount("");
    }
    // Refresh even when the sequence stopped early: an approval that already went through
    // has changed the allowance, and a stale one would ask for a second needless signature.
    onRefresh();
    collateralActions.refresh();
  };

  const runDepositEth = async () => {
    const ok = await collateralSequence.run([
      {
        id: "deposit-eth",
        label: `Deposit ${ethAmount} ETH as collateral`,
        run: () => collateralActions.supplyEth(ethAmount),
      },
    ]);

    if (ok) {
      setEthAmount("");
    }
    onRefresh();
    collateralActions.refresh();
  };

  const runBorrow = async () => {
    const ok = await borrowSequence.run([
      {
        id: "borrow",
        label: `Borrow ${formatNzd(parseSafe(borrowAmount, nzdDecimals), nzdDecimals)}`,
        run: () => nzdActions.borrow(borrowAmount),
      },
    ]);

    if (ok) {
      setBorrowAmount("");
    }
    onRefresh();
    liveRisk.refetch();
  };

  /** Step 1 done when allowance covers full debt (enough for partial or full repay). */
  const repayAllowanceReady =
    nzdPosition.borrowed > 0n &&
    (() => {
      try {
        return parseTokenAmount(debtBare, nzdDecimals) <= nzdActions.state.allowance;
      } catch {
        return false;
      }
    })();

  const runApproveRepay = async () => {
    const ok = await repaySequence.run([
      {
        id: "approve",
        label: "Allow the market to collect your repayment",
        run: () => nzdActions.approve(debtBare),
      },
    ]);

    if (ok) {
      onRefresh();
      nzdActions.refresh();
    }
  };

  const runRepay = async (all: boolean) => {
    const amount = all ? debtBare : repayAmount;
    const ok = await repaySequence.run([
      {
        id: "repay",
        label: all ? "Repay everything you owe" : `Repay ${formatNzd(parseSafe(amount, nzdDecimals), nzdDecimals)}`,
        run: () => (all ? nzdActions.repayAll() : nzdActions.repay(amount)),
      },
    ]);

    if (ok) {
      setRepayAmount("");
    }
    onRefresh();
    liveRisk.refetch();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Journey: collateral, then borrow. Wallet confirmations use TwoStepActions (Step 1 / 2). */}
        <Card>
          <Eyebrow>Collateral</Eyebrow>
          <h2 className="mt-2 font-display text-3xl">Deposit what you already hold</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Your ETH or Bitcoin stays yours. It is held as security against the loan, and you get it back when you
            repay.
          </p>

          <div className="mt-6 flex gap-2">
            {COLLATERAL_ASSETS.map(symbol => (
              <Pill
                key={symbol}
                active={collateralSymbol === symbol}
                onClick={() => {
                  setCollateralSymbol(symbol);
                  setCollateralAmount("");
                  setEthAmount("");
                }}
              >
                {COLLATERAL_LABEL[symbol]}
              </Pill>
            ))}
          </div>

          <div className="mt-5">
            <AmountField
              label={`Amount of ${COLLATERAL_LABEL[collateralSymbol]}`}
              value={collateralAmount}
              onChange={setCollateralAmount}
              decimals={collateralPosition.decimals}
              suffix={collateralSymbol === "wETH" ? "ETH" : "BTC"}
              meta={
                <>
                  In your account:{" "}
                  <span className="tabular font-mono text-foreground">
                    {formatToken(
                      collateralPosition.walletBalance,
                      collateralPosition.decimals,
                      collateralSymbol === "wETH" ? "ETH" : "BTC",
                    )}
                  </span>
                </>
              }
              max={{ value: collateralBare, message: "More than you hold." }}
              presets={
                collateralPosition.walletBalance > 0n ? [{ label: "Everything", value: collateralBare }] : undefined
              }
              disabled={collateralSequence.isRunning}
            />
          </div>

          <TwoStepActions
            stepOne={{
              title: `Allow the market to move your ${COLLATERAL_LABEL[collateralSymbol]}`,
              description: "A separate confirmation in your wallet. Required before you can deposit.",
              done: collateralAllowanceReady,
              action: collateralAllowanceReady ? (
                <span className="text-xs text-muted-foreground">Already allowed for this amount.</span>
              ) : (
                <ActionButton
                  onClick={runApproveCollateral}
                  disabled={!canDepositCollateral}
                  busy={collateralSequence.isRunning}
                  full
                >
                  Allow {COLLATERAL_LABEL[collateralSymbol]}
                </ActionButton>
              ),
            }}
            stepTwo={{
              title: "Deposit as collateral",
              description: "Second confirmation. Available once step 1 is done.",
              locked: !collateralAllowanceReady,
              action: (
                <ActionButton
                  onClick={runDepositCollateral}
                  disabled={!canDepositCollateral || !collateralAllowanceReady}
                  busy={collateralSequence.isRunning}
                  full
                >
                  Deposit as collateral
                </ActionButton>
              ),
            }}
          />

          {collateralSymbol === "wETH" ? (
            <div className="hairline mt-6 pt-5">
              <Eyebrow>Depositing ETH directly</Eyebrow>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                If you hold plain ETH rather than the wrapped form, deposit it here in a single step.
              </p>
              <div className="mt-4">
                <AmountField
                  label="Amount of ETH"
                  value={ethAmount}
                  onChange={setEthAmount}
                  decimals={18}
                  suffix="ETH"
                  disabled={collateralSequence.isRunning}
                />
              </div>
              <ActionButton
                tone="outline"
                className="mt-4"
                onClick={runDepositEth}
                disabled={!ethAmount.trim() || Boolean(validateAmount(ethAmount, 18)) || !positions.isCorrectNetwork}
                busy={collateralSequence.isRunning}
                full
              >
                Deposit ETH
              </ActionButton>
            </div>
          ) : null}

          <TxSteps sequence={collateralSequence} className="mt-5" />

          <div className="hairline mt-6 divide-y divide-border pt-2">
            <DataRow
              label="Collateral deposited"
              value={formatToken(
                collateralPosition.deposited,
                collateralPosition.decimals,
                collateralSymbol === "wETH" ? "ETH" : "BTC",
              )}
            />
            <DataRow
              label="Total collateral value"
              value={formatBase(positions.totalCollateralBase)}
              hint="Priced by the market's oracle"
            />
            {collateralReserve ? (
              <DataRow
                label={`Borrow up to, against ${COLLATERAL_LABEL[collateralSymbol]}`}
                value={formatPercent(collateralReserve.maxLtvPercent, 0)}
              />
            ) : null}
          </div>
        </Card>

        <Card>
          <Eyebrow>Borrow</Eyebrow>
          <h2 className="mt-2 font-display text-3xl">Borrow New Zealand dollars</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Interest accrues at {formatPercent(nzdReserve?.borrowApyPercent ?? 0)}, variable. There is no repayment
            schedule. Repay whenever you like, in part or in full.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-6">
            <Stat
              label="You could borrow"
              value={formatNzd(borrowCeiling, nzdDecimals, { decimals: 0 })}
              accent
              hint="The lower of your limit and what the pool holds"
            />
            <Stat label="Already borrowed" value={formatNzd(nzdPosition.borrowed, nzdDecimals, { decimals: 0 })} />
          </div>

          <div className="hairline mt-6 divide-y divide-border pt-2">
            <DataRow
              label="Your borrowing limit"
              value={formatBase(positions.availableBorrowsBase)}
              hint="Set by how much collateral you have deposited"
            />
            <DataRow
              label="Available in the pool"
              value={formatNzd(poolLiquidity, nzdDecimals, { decimals: 0 })}
              hint="What other people have deposited and not yet borrowed"
              tone={poolIsEmpty ? "text-destructive" : undefined}
            />
          </div>

          {!positions.hasCollateral ? (
            <Note tone="info" className="mt-6" title="Deposit collateral first">
              Once you have deposited ETH or Bitcoin, your borrowing limit appears here.
            </Note>
          ) : null}

          {poolIsEmpty ? (
            <Note tone="warning" className="mt-6" title="Nothing available to borrow right now">
              {nzdReserve && nzdReserve.totalSupplied === 0n
                ? "No New Zealand dollars have been deposited into the pool yet, so there is nothing to lend. A loan would not go through no matter how much collateral you have deposited."
                : "Every New Zealand dollar in the pool is currently lent out, so a loan would not go through no matter how much collateral you have deposited. This changes as people deposit and repay."}
            </Note>
          ) : null}

          <div className="mt-6">
            <AmountField
              label="Amount to borrow"
              value={borrowAmount}
              onChange={setBorrowAmount}
              decimals={nzdDecimals}
              prefix="NZ$"
              meta={
                <>
                  Up to{" "}
                  <span className="tabular font-mono text-foreground">
                    {formatNzd(borrowCeiling, nzdDecimals, { decimals: 0 })}
                  </span>
                </>
              }
              max={{ value: borrowCeilingBare, message: "More than you can borrow right now." }}
              presets={borrowCeiling > 0n ? [{ label: "The maximum", value: borrowCeilingBare }] : undefined}
              disabled={borrowSequence.isRunning || poolIsEmpty}
            />
          </div>

          {/*
            Always visible, never collapsed. Someone borrowing against a volatile asset for the
            first time has to be able to see this before they act.
          */}
          <div className="mt-6 rounded-xl border border-[var(--clay)]/40 bg-[var(--clay)]/10 p-5">
            <Eyebrow>What you are taking on</Eyebrow>
            <p className="mt-2 text-sm leading-relaxed">
              If your collateral falls far enough in value, part of it is sold automatically to repay what you owe, and
              you do not get that part back.
              {report?.proposal.liquidationAtEthChangePercent !== null &&
              report?.proposal.liquidationAtEthChangePercent !== undefined ? (
                <>
                  {" "}
                  On your position as it stands, that would begin if ETH fell about{" "}
                  <strong>{Math.abs(report.proposal.liquidationAtEthChangePercent)}%</strong> from today&apos;s price.
                </>
              ) : (
                " How far your collateral would have to fall depends on how much you borrow against it."
              )}
            </p>
          </div>

          <div className="mt-5">
            <ActionButton
              tone="clay"
              onClick={runBorrow}
              disabled={!borrowAmount.trim() || Boolean(borrowError) || poolIsEmpty || !positions.isCorrectNetwork}
              busy={borrowSequence.isRunning}
              full
            >
              {borrowAmount.trim() && !borrowError
                ? `Borrow ${formatNzd(parseSafe(borrowAmount, nzdDecimals), nzdDecimals)}`
                : "Borrow"}
            </ActionButton>
          </div>

          <TxSteps sequence={borrowSequence} className="mt-5" />

          <div className="hairline mt-6 pt-5">
            <HealthMeter healthFactor={positions.healthFactor} />
          </div>
        </Card>
      </div>

      {/* Risk summary */}
      {positions.hasCollateral ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Eyebrow>Before you commit</Eyebrow>
              <h2 className="mt-2 font-display text-2xl">How this loan would hold up</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                The pool decides what it will lend you. This shows what happens to that loan if the price of your
                collateral falls, using declines drawn from how ETH has actually moved.
              </p>
            </div>
            <button
              type="button"
              onClick={() => liveRisk.refetch()}
              disabled={liveRisk.isFetching}
              className="rounded-full border border-input px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {liveRisk.isFetching ? "Working…" : "Refresh"}
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-5">
            <label className="flex flex-col gap-1.5">
              <Eyebrow>Keep a buffer of at least</Eyebrow>
              <select
                value={targetHealthFactor}
                onChange={event => setTargetHealthFactor(event.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              >
                {TARGET_HEALTH_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.value})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <Eyebrow>Through a fall of</Eyebrow>
              <select
                value={shockPercent}
                onChange={event => setShockPercent(event.target.value)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              >
                {SHOCK_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {liveRisk.error ? (
            <Note tone="error" className="mt-6">
              {liveRisk.error.message}
            </Note>
          ) : null}

          {!report && liveRisk.isFetching ? (
            <p className="mt-6 text-sm text-muted-foreground">Reading your position and recent market data…</p>
          ) : null}

          {report ? (
            <div className="mt-6 flex flex-col gap-6">
              <RiskWarnings report={report} />
              <MarketContextLine report={report} />
              <ScenarioTable report={report} compact />
              <StressTestedAmount report={report} onUseAmount={setBorrowAmount} />
              <p className="text-sm text-muted-foreground">
                <Link href="/market" className="underline underline-offset-4 hover:text-foreground">
                  Open the full stress tester
                </Link>{" "}
                to change the assumptions and see how the figures were worked out.
              </p>
              <Disclaimer report={report} />
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* Repay */}
      {nzdPosition.borrowed > 0n ? (
        <Card>
          <Eyebrow>Repay</Eyebrow>
          <h2 className="mt-2 font-display text-2xl">You owe {formatNzd(nzdPosition.borrowed, nzdDecimals)}</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Repay any amount at any time. Clearing the loan in full releases your collateral for withdrawal.
          </p>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <AmountField
              label="Amount to repay"
              value={repayAmount}
              onChange={setRepayAmount}
              decimals={nzdDecimals}
              prefix="NZ$"
              meta={
                <>
                  In your account:{" "}
                  <span className="tabular font-mono text-foreground">
                    {formatNzd(nzdPosition.walletBalance, nzdDecimals)}
                  </span>
                </>
              }
              max={{ value: debtBare, message: "More than you owe." }}
              presets={[{ label: "Everything you owe", value: debtBare }]}
              disabled={repaySequence.isRunning}
            />

            <div className="flex flex-col justify-between gap-4">
              <div className="divide-y divide-border">
                <DataRow label="Owed" value={formatNzd(nzdPosition.borrowed, nzdDecimals)} />
                <DataRow label="Available to repay with" value={formatNzd(nzdPosition.walletBalance, nzdDecimals)} />
                <DataRow label="Interest rate" value={formatPercent(nzdReserve?.borrowApyPercent ?? 0)} />
              </div>
            </div>
          </div>

          <TwoStepActions
            stepOne={{
              title: "Allow the market to collect your repayment",
              description: "A separate confirmation in your wallet. Required before you can repay.",
              done: repayAllowanceReady,
              action: repayAllowanceReady ? (
                <span className="text-xs text-muted-foreground">Already allowed for what you owe.</span>
              ) : (
                <ActionButton
                  onClick={runApproveRepay}
                  disabled={!positions.isCorrectNetwork}
                  busy={repaySequence.isRunning}
                >
                  Allow repayment
                </ActionButton>
              ),
            }}
            stepTwo={{
              title: "Repay what you owe",
              description: "Second confirmation. Available once step 1 is done.",
              locked: !repayAllowanceReady,
              action: (
                <>
                  <ActionButton
                    onClick={() => runRepay(false)}
                    disabled={
                      !repayAmount.trim() || Boolean(repayError) || !positions.isCorrectNetwork || !repayAllowanceReady
                    }
                    busy={repaySequence.isRunning}
                  >
                    Repay
                  </ActionButton>
                  <ActionButton
                    tone="outline"
                    onClick={() => runRepay(true)}
                    disabled={!positions.isCorrectNetwork || !repayAllowanceReady}
                    busy={repaySequence.isRunning}
                  >
                    Repay everything
                  </ActionButton>
                </>
              ),
            }}
          />

          <TxSteps sequence={repaySequence} className="mt-5" />
        </Card>
      ) : null}

      {collateralPosition.deposited > 0n ? (
        <Card>
          <Eyebrow>Withdraw collateral</Eyebrow>
          <h2 className="mt-2 font-display text-2xl">Take back your {COLLATERAL_LABEL[collateralSymbol]}</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            You can withdraw collateral that is not supporting a loan. If you still owe New Zealand dollars, the
            withdrawal is limited to what keeps your loan adequately covered.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ActionButton
              tone="outline"
              onClick={async () => {
                await collateralSequence.run([
                  {
                    id: "withdraw-collateral",
                    label: `Withdraw your ${COLLATERAL_LABEL[collateralSymbol]}`,
                    run: () => collateralActions.withdrawAll(),
                  },
                ]);
                onRefresh();
                collateralActions.refresh();
              }}
              busy={collateralSequence.isRunning}
              disabled={!positions.isCorrectNetwork}
            >
              Withdraw all {COLLATERAL_LABEL[collateralSymbol]}
            </ActionButton>
            <span className="self-center text-xs text-muted-foreground">
              Currently deposited:{" "}
              {formatToken(
                collateralPosition.deposited,
                collateralPosition.decimals,
                collateralSymbol === "wETH" ? "ETH" : "BTC",
              )}
            </span>
          </div>
        </Card>
      ) : null}
    </div>
  );
};

function parseSafe(amount: string, decimals: number): bigint {
  try {
    return parseTokenAmount(amount, decimals);
  } catch {
    return 0n;
  }
}

/**
 * dNZD is priced at one base unit, so the borrowing limit converts by rescaling decimals rather
 * than dividing by a price. Base amounts carry 8 decimals; dNZD carries 6.
 */
function availableBorrowsInNzd(availableBorrowsBase: bigint, nzdDecimals: number): bigint {
  const BASE_DECIMALS = 8;
  if (nzdDecimals === BASE_DECIMALS) {
    return availableBorrowsBase;
  }
  if (nzdDecimals < BASE_DECIMALS) {
    return availableBorrowsBase / 10n ** BigInt(BASE_DECIMALS - nzdDecimals);
  }
  return availableBorrowsBase * 10n ** BigInt(nzdDecimals - BASE_DECIMALS);
}
