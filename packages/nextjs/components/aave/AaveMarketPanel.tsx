"use client";

import { formatAaveBaseAmount, formatHealthFactor } from "~~/utils/aave/amount";

export type AaveMarketPanelProps = {
  symbol: string;
  amount: string;
  onAmountChange: (value: string) => void;
  walletBalance: bigint;
  allowance: bigint;
  suppliedBalance: bigint;
  borrowedBalance: bigint;
  availableBorrowsBase: bigint;
  healthFactor: bigint;
  isReading: boolean;
  isCorrectNetwork: boolean;
  isBusy: boolean;
  isApproving: boolean;
  isSupplying: boolean;
  isWithdrawing: boolean;
  isBorrowing: boolean;
  isRepaying: boolean;
  formatAmount: (value: bigint) => string;
  onApprove: () => void;
  onSupply: () => void;
  onWithdraw: () => void;
  onWithdrawAll: () => void;
  onBorrow: () => void;
  onRepay: () => void;
  onRepayAll: () => void;
  onRefresh: () => void;
};

/**
 * Shared supply + borrow actions panel for official Sepolia and hackathon markets.
 */
export const AaveMarketPanel = ({
  symbol,
  amount,
  onAmountChange,
  walletBalance,
  allowance,
  suppliedBalance,
  borrowedBalance,
  availableBorrowsBase,
  healthFactor,
  isReading,
  isCorrectNetwork,
  isBusy,
  isApproving,
  isSupplying,
  isWithdrawing,
  isBorrowing,
  isRepaying,
  formatAmount,
  onApprove,
  onSupply,
  onWithdraw,
  onWithdrawAll,
  onBorrow,
  onRepay,
  onRepayAll,
  onRefresh,
}: AaveMarketPanelProps) => {
  const display = (value: bigint) => (isReading ? "…" : formatAmount(value));
  const hasAmount = Boolean(amount);
  const networkReady = isCorrectNetwork && !isBusy;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-base-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="opacity-70">Wallet {symbol}</div>
          <div className="font-mono text-lg">{display(walletBalance)}</div>
        </div>
        <div>
          <div className="opacity-70">Allowance</div>
          <div className="font-mono text-lg">{display(allowance)}</div>
        </div>
        <div>
          <div className="opacity-70">Supplied (aToken)</div>
          <div className="font-mono text-lg">{display(suppliedBalance)}</div>
        </div>
        <div>
          <div className="opacity-70">Borrowed (variable debt)</div>
          <div className="font-mono text-lg">{display(borrowedBalance)}</div>
        </div>
        <div>
          <div className="opacity-70">Health factor</div>
          <div className="font-mono text-lg">{isReading ? "…" : formatHealthFactor(healthFactor)}</div>
        </div>
        <div>
          <div className="opacity-70">Available to borrow (USD base)</div>
          <div className="font-mono text-lg">{isReading ? "…" : formatAaveBaseAmount(availableBorrowsBase)}</div>
        </div>
      </div>

      <div className="bg-base-200 rounded-lg p-4 flex flex-col gap-3">
        <label className="form-control w-full">
          <span className="label-text font-semibold mb-1">Amount ({symbol})</span>
          <input
            type="text"
            inputMode="decimal"
            className="input input-bordered w-full"
            placeholder="0.0"
            value={amount}
            onChange={e => onAmountChange(e.target.value)}
            disabled={isBusy}
          />
        </label>

        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-sm">Supply</h3>
          <p className="text-xs opacity-70">
            Approve and Supply are separate transactions. Approve first when allowance is insufficient, then Supply.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" disabled={!networkReady || !hasAmount} onClick={onApprove}>
              {isApproving ? <span className="loading loading-spinner loading-sm" /> : null}
              Approve
            </button>
            <button className="btn btn-primary" disabled={!networkReady || !hasAmount} onClick={onSupply}>
              {isSupplying ? <span className="loading loading-spinner loading-sm" /> : null}
              Supply
            </button>
            <button className="btn btn-accent" disabled={!networkReady || !hasAmount} onClick={onWithdraw}>
              {isWithdrawing ? <span className="loading loading-spinner loading-sm" /> : null}
              Withdraw
            </button>
            <button
              className="btn btn-outline"
              disabled={!networkReady || suppliedBalance === 0n}
              onClick={onWithdrawAll}
            >
              Withdraw all
            </button>
          </div>
          <p className="text-xs opacity-70">
            Withdrawal can fail when market liquidity is unavailable or the position is constrained by debt/collateral
            requirements.
          </p>
        </div>

        <div className="divider my-1" />

        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-sm">Borrow</h3>
          <p className="text-xs opacity-70">
            Same-asset variable-rate borrow. Supply first as collateral, then Borrow. Approve before Repay (separate
            transactions). Health factor must stay above 1.0.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={!networkReady || !hasAmount} onClick={onBorrow}>
              {isBorrowing ? <span className="loading loading-spinner loading-sm" /> : null}
              Borrow
            </button>
            <button className="btn btn-secondary" disabled={!networkReady || !hasAmount} onClick={onApprove}>
              {isApproving ? <span className="loading loading-spinner loading-sm" /> : null}
              Approve
            </button>
            <button className="btn btn-accent" disabled={!networkReady || !hasAmount} onClick={onRepay}>
              {isRepaying ? <span className="loading loading-spinner loading-sm" /> : null}
              Repay
            </button>
            <button className="btn btn-outline" disabled={!networkReady || borrowedBalance === 0n} onClick={onRepayAll}>
              Repay all
            </button>
            <button className="btn btn-ghost btn-sm" disabled={isBusy} onClick={onRefresh}>
              Refresh
            </button>
          </div>
          <p className="text-xs opacity-70">
            Borrow can revert if borrowing is disabled, collateral/LTV is insufficient, health factor would drop below
            1, or pool liquidity is too low.
          </p>
        </div>
      </div>
    </div>
  );
};
