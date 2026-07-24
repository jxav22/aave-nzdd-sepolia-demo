"use client";

import { useState } from "react";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { sepolia } from "viem/chains";
import { useAccount } from "wagmi";
import { AAVE_SEPOLIA_FAUCET_URL, AAVE_TESTNET_FAUCET_DOCS_URL } from "~~/config/aaveSepolia";
import { useAaveSepolia } from "~~/hooks/aave/useAaveSepolia";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";

const AavePage: NextPage = () => {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { state, config, approve, supply, withdraw, withdrawAll, refresh, switchToSepolia, formatAmount } =
    useAaveSepolia();
  const [amount, setAmount] = useState("");

  const explorerAddress = (addr: string) => `${config.explorerBaseUrl}/address/${addr}`;
  const isBusy = state.isApproving || state.isSupplying || state.isWithdrawing;
  const hasZeroWalletBalance = state.isConnected && state.isCorrectNetwork && state.walletBalance === 0n;

  return (
    <div className="flex flex-col items-center grow pt-8 pb-16 px-4">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold">Aave Sepolia Integration</h1>
          <p className="mt-2 text-sm opacity-80">Prototype settlement asset</p>
          <p className="text-base font-medium">Underlying test asset: EURS on Ethereum Sepolia</p>
          <p className="text-sm opacity-70 mt-1">
            This is Aave&apos;s official Sepolia test EURS — not NZDD and not USDC. Public Sepolia USDC is supply-capped
            on this market (Aave error 51), so the integration uses uncapped EURS instead.
          </p>
        </div>

        <div className="bg-base-200 rounded-lg p-4 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">Wallet</span>
            {address ? (
              <Address address={address} chain={targetNetwork} />
            ) : (
              <span className="text-sm opacity-70">Not connected</span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">Network</span>
            <span className="text-sm">
              {state.isConnected
                ? state.isCorrectNetwork
                  ? "Ethereum Sepolia"
                  : "Wrong network — switch to Sepolia"
                : "—"}
            </span>
          </div>
          {state.isConnected && !state.isCorrectNetwork && (
            <button className="btn btn-primary btn-sm w-fit" onClick={() => void switchToSepolia()}>
              Switch to Sepolia
            </button>
          )}
        </div>

        <div className="bg-base-200 rounded-lg p-4 flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <span className="font-semibold">Underlying token ({config.asset.displaySymbol})</span>
            <a
              className="link break-all"
              href={explorerAddress(config.asset.underlyingAddress)}
              target="_blank"
              rel="noreferrer"
            >
              {config.asset.underlyingAddress}
            </a>
            <Address address={config.asset.underlyingAddress} chain={sepolia} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-semibold">Aave V3 Pool</span>
            <a className="link break-all" href={explorerAddress(config.poolAddress)} target="_blank" rel="noreferrer">
              {config.poolAddress}
            </a>
            <Address address={config.poolAddress} chain={sepolia} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-semibold">aToken</span>
            <a
              className="link break-all"
              href={explorerAddress(config.asset.aTokenAddress)}
              target="_blank"
              rel="noreferrer"
            >
              {config.asset.aTokenAddress}
            </a>
            <Address address={config.asset.aTokenAddress} chain={sepolia} />
          </div>
        </div>

        <div className="bg-base-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="opacity-70">Wallet {state.symbol}</div>
            <div className="font-mono text-lg">{state.isReading ? "…" : formatAmount(state.walletBalance)}</div>
          </div>
          <div>
            <div className="opacity-70">Allowance</div>
            <div className="font-mono text-lg">{state.isReading ? "…" : formatAmount(state.allowance)}</div>
          </div>
          <div>
            <div className="opacity-70">Supplied (aToken)</div>
            <div className="font-mono text-lg">{state.isReading ? "…" : formatAmount(state.suppliedBalance)}</div>
          </div>
        </div>

        {hasZeroWalletBalance && (
          <div className="alert alert-warning">
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-semibold">No Sepolia test EURS in this wallet</p>
              <p>
                Mint EURS from the{" "}
                <a className="link" href={AAVE_SEPOLIA_FAUCET_URL} target="_blank" rel="noreferrer">
                  Aave Ethereum Sepolia faucet
                </a>{" "}
                (use small amounts; EURS has 2 decimals). See{" "}
                <a className="link" href={AAVE_TESTNET_FAUCET_DOCS_URL} target="_blank" rel="noreferrer">
                  Aave testing docs
                </a>
                .
              </p>
              <p>
                Do not use Circle Sepolia USDC or Base USDC — different chains/contracts will not work with this Pool.
              </p>
            </div>
          </div>
        )}

        {state.decimalsMismatch && <div className="alert alert-info text-sm">{state.decimalsMismatch}</div>}

        {state.error && <div className="alert alert-error text-sm whitespace-pre-wrap">{state.error}</div>}

        <div className="bg-base-200 rounded-lg p-4 flex flex-col gap-3">
          <label className="form-control w-full">
            <span className="label-text font-semibold mb-1">Amount ({state.symbol})</span>
            <input
              type="text"
              inputMode="decimal"
              className="input input-bordered w-full"
              placeholder="0.0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={isBusy}
            />
          </label>

          <p className="text-xs opacity-70">
            Approve and Supply are separate transactions. Approve first when allowance is insufficient, then Supply.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-secondary"
              disabled={!state.isCorrectNetwork || isBusy || !amount}
              onClick={() => void approve(amount)}
            >
              {state.isApproving ? <span className="loading loading-spinner loading-sm" /> : null}
              Approve
            </button>
            <button
              className="btn btn-primary"
              disabled={!state.isCorrectNetwork || isBusy || !amount}
              onClick={() => void supply(amount)}
            >
              {state.isSupplying ? <span className="loading loading-spinner loading-sm" /> : null}
              Supply
            </button>
            <button
              className="btn btn-accent"
              disabled={!state.isCorrectNetwork || isBusy || !amount}
              onClick={() => void withdraw(amount)}
            >
              {state.isWithdrawing ? <span className="loading loading-spinner loading-sm" /> : null}
              Withdraw
            </button>
            <button
              className="btn btn-outline"
              disabled={!state.isCorrectNetwork || isBusy || state.suppliedBalance === 0n}
              onClick={() => void withdrawAll()}
            >
              Withdraw all
            </button>
            <button className="btn btn-ghost btn-sm" disabled={isBusy} onClick={() => void refresh()}>
              Refresh
            </button>
          </div>

          <p className="text-xs opacity-70">
            Withdrawal can fail when market liquidity is unavailable or the position is constrained by debt/collateral
            requirements.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AavePage;
