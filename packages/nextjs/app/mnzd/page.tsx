"use client";

import { useState } from "react";
import { Address, AddressInput } from "@scaffold-ui/components";
import type { NextPage } from "next";
import type { Address as AddressType } from "viem";
import { sepolia } from "viem/chains";
import { useAccount } from "wagmi";
import { AaveMarketPanel } from "~~/components/aave/AaveMarketPanel";
import { useAaveHackathonMnzd } from "~~/hooks/aave/useAaveHackathonMnzd";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";

const MnzdPage: NextPage = () => {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const {
    state,
    config,
    mint,
    approve,
    supply,
    withdraw,
    withdrawAll,
    borrow,
    repay,
    repayAll,
    refresh,
    switchToSepolia,
    formatAmount,
  } = useAaveHackathonMnzd();
  const [amount, setAmount] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [mintTo, setMintTo] = useState("");

  const explorerAddress = (addr: string) => `${config.explorerBaseUrl}/address/${addr}`;
  const isBusy =
    state.isApproving ||
    state.isSupplying ||
    state.isWithdrawing ||
    state.isBorrowing ||
    state.isRepaying ||
    state.isMinting;
  const hasZeroWalletBalance = state.isConnected && state.isCorrectNetwork && state.walletBalance === 0n;

  return (
    <div className="flex flex-col items-center grow pt-8 pb-16 px-4">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold">mNZD Hackathon Market</h1>
          <p className="mt-2 text-sm opacity-80">{config.marketId}</p>
          <p className="text-base font-medium">Custom Aave V3 Pool + mNZD on Ethereum Sepolia</p>
          <p className="text-sm opacity-70 mt-1">
            Deployed from aave-v3-origin. mNZD is a Mock NZD Stable stand-in (6 decimals) — not real NZDD, dNZD, or
            zNZD. Same-asset supply and variable borrow. Separate from the official Aave Sepolia EURS market on{" "}
            <a className="link" href="/aave">
              /aave
            </a>
            .
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
            <span className="font-semibold">Hackathon Pool</span>
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
          <div className="flex flex-col gap-1">
            <span className="font-semibold">Variable debt token</span>
            <a
              className="link break-all"
              href={explorerAddress(config.asset.variableDebtTokenAddress)}
              target="_blank"
              rel="noreferrer"
            >
              {config.asset.variableDebtTokenAddress}
            </a>
            <Address address={config.asset.variableDebtTokenAddress} chain={sepolia} />
          </div>
        </div>

        {hasZeroWalletBalance && (
          <div className="alert alert-warning">
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-semibold">No mNZD in this wallet</p>
              <p>
                mNZD has no public faucet. Only the token owner can mint (
                <code className="text-xs">mint(address,uint256)</code>).
              </p>
              {state.tokenOwner && (
                <div className="flex flex-col gap-1">
                  <span className="opacity-70">Token owner</span>
                  <Address address={state.tokenOwner} chain={sepolia} />
                </div>
              )}
              {!state.isOwner && state.tokenOwner && (
                <p>Connect that owner wallet to use the faucet on this page, or ask them to mint to your address.</p>
              )}
            </div>
          </div>
        )}

        {state.isConnected && state.isCorrectNetwork && !state.isOwner && !hasZeroWalletBalance && state.tokenOwner && (
          <div className="alert alert-info text-sm">
            Minting is owner-only. Current owner: <Address address={state.tokenOwner} chain={sepolia} />
          </div>
        )}

        {state.isOwner && (
          <div className="bg-base-200 rounded-lg p-4 flex flex-col gap-3">
            <div>
              <h2 className="font-semibold">Owner faucet</h2>
              <p className="text-xs opacity-70 mt-1">
                Connected wallet owns mNZD. Mint to yourself or another address (6 decimals).
              </p>
            </div>
            <label className="form-control w-full">
              <span className="label-text font-semibold mb-1">Mint amount ({config.asset.displaySymbol})</span>
              <input
                type="text"
                inputMode="decimal"
                className="input input-bordered w-full"
                placeholder="0.0"
                value={mintAmount}
                onChange={e => setMintAmount(e.target.value)}
                disabled={isBusy}
              />
            </label>
            <label className="form-control w-full">
              <span className="label-text font-semibold mb-1">Mint to (optional — defaults to connected wallet)</span>
              <AddressInput
                placeholder={address ?? "0x…"}
                value={mintTo}
                onChange={value => setMintTo(value as AddressType)}
                disabled={isBusy}
              />
            </label>
            <button
              className="btn btn-secondary w-fit"
              disabled={!state.isCorrectNetwork || isBusy || !mintAmount}
              onClick={() => void mint(mintAmount, mintTo || undefined)}
            >
              {state.isMinting ? <span className="loading loading-spinner loading-sm" /> : null}
              Mint {config.asset.displaySymbol}
            </button>
          </div>
        )}

        {state.decimalsMismatch && <div className="alert alert-info text-sm">{state.decimalsMismatch}</div>}

        {state.error && <div className="alert alert-error text-sm whitespace-pre-wrap">{state.error}</div>}

        <AaveMarketPanel
          symbol={state.symbol}
          amount={amount}
          onAmountChange={setAmount}
          walletBalance={state.walletBalance}
          allowance={state.allowance}
          suppliedBalance={state.suppliedBalance}
          borrowedBalance={state.borrowedBalance}
          availableBorrowsBase={state.availableBorrowsBase}
          healthFactor={state.healthFactor}
          isReading={state.isReading}
          isCorrectNetwork={state.isCorrectNetwork}
          isBusy={isBusy}
          isApproving={state.isApproving}
          isSupplying={state.isSupplying}
          isWithdrawing={state.isWithdrawing}
          isBorrowing={state.isBorrowing}
          isRepaying={state.isRepaying}
          formatAmount={formatAmount}
          onApprove={() => void approve(amount)}
          onSupply={() => void supply(amount)}
          onWithdraw={() => void withdraw(amount)}
          onWithdrawAll={() => void withdrawAll()}
          onBorrow={() => void borrow(amount)}
          onRepay={() => void repay(amount)}
          onRepayAll={() => void repayAll()}
          onRefresh={() => void refresh()}
        />
      </div>
    </div>
  );
};

export default MnzdPage;
