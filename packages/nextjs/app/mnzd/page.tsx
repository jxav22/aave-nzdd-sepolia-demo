"use client";

import { useState } from "react";
import { Address, AddressInput } from "@scaffold-ui/components";
import type { NextPage } from "next";
import type { Address as AddressType } from "viem";
import { sepolia } from "viem/chains";
import { useAccount } from "wagmi";
import { AaveMarketPanel } from "~~/components/aave/AaveMarketPanel";
import { type HackathonAssetSymbol, aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";
import { useAaveHackathonMnzd } from "~~/hooks/aave/useAaveHackathonMnzd";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";

const ASSET_TABS: HackathonAssetSymbol[] = ["wETH", "wBTC", "dNZD"];

const MnzdPage: NextPage = () => {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const [selectedAsset, setSelectedAsset] = useState<HackathonAssetSymbol>("wETH");
  const {
    state,
    config,
    selectedAssetConfig,
    mint,
    wrapEth,
    supplyEth,
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
  } = useAaveHackathonMnzd(selectedAsset);
  const [amount, setAmount] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [mintTo, setMintTo] = useState("");
  const [ethAmount, setEthAmount] = useState("");

  const explorerAddress = (addr: string) => `${config.explorerBaseUrl}/address/${addr}`;
  const isBusy =
    state.isApproving ||
    state.isSupplying ||
    state.isWithdrawing ||
    state.isBorrowing ||
    state.isRepaying ||
    state.isMinting ||
    state.isWrapping;
  const hasZeroWalletBalance = state.isConnected && state.isCorrectNetwork && state.walletBalance === 0n;

  return (
    <div className="flex flex-col items-center grow pt-8 pb-16 px-4">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold">Hackathon Market</h1>
          <p className="mt-2 text-sm opacity-80">{config.marketId}</p>
          <p className="text-base font-medium">Custom Aave V3 — wETH, wBTC, and dNZD on Ethereum Sepolia</p>
          <p className="text-sm opacity-70 mt-1">
            Supply crypto collateral, borrow dNZD (demo NZD stable, 6 decimals — not production NewMoney issuance). Mock
            oracles for demo pricing.
          </p>
        </div>

        <div className="bg-base-200 rounded-lg p-4 flex flex-col gap-3 text-sm">
          <p className="font-semibold">Demo path</p>
          <ol className="list-decimal list-inside flex flex-col gap-1 opacity-90">
            <li>Get Sepolia ETH (any public faucet) for gas.</li>
            <li>
              <strong>wETH:</strong> wrap ETH (or supply ETH via Aave gateway), then supply as collateral.
            </li>
            <li>
              <strong>wBTC / dNZD:</strong> owner-mint test tokens, then supply.
            </li>
            <li>
              Switch to <strong>dNZD</strong> and borrow against your collateral (or same-asset dNZD).
            </li>
          </ol>
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

        <div role="tablist" className="tabs tabs-boxed bg-base-200 p-1">
          {ASSET_TABS.map(symbol => (
            <button
              key={symbol}
              role="tab"
              type="button"
              className={`tab flex-1 ${selectedAsset === symbol ? "tab-active" : ""}`}
              onClick={() => {
                setSelectedAsset(symbol);
                setAmount("");
                setMintAmount("");
                setMintTo("");
                setEthAmount("");
              }}
            >
              {symbol}
            </button>
          ))}
        </div>

        <div className="bg-base-200 rounded-lg p-4 flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <span className="font-semibold">{selectedAssetConfig.displaySymbol} underlying</span>
            <a
              className="link break-all"
              href={explorerAddress(selectedAssetConfig.underlyingAddress)}
              target="_blank"
              rel="noreferrer"
            >
              {selectedAssetConfig.underlyingAddress}
            </a>
            <Address address={selectedAssetConfig.underlyingAddress} chain={sepolia} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-semibold">Hackathon Pool</span>
            <a className="link break-all" href={explorerAddress(config.poolAddress)} target="_blank" rel="noreferrer">
              {config.poolAddress}
            </a>
          </div>
          {selectedAsset === "wETH" && (
            <div className="flex flex-col gap-1">
              <span className="font-semibold">WrappedTokenGateway</span>
              <a
                className="link break-all"
                href={explorerAddress(config.wrappedTokenGateway)}
                target="_blank"
                rel="noreferrer"
              >
                {config.wrappedTokenGateway}
              </a>
            </div>
          )}
        </div>

        {state.canWrap && (
          <div className="bg-base-200 rounded-lg p-4 flex flex-col gap-3">
            <div>
              <h2 className="font-semibold">Get wETH</h2>
              <p className="text-xs opacity-70 mt-1">
                Wrap Sepolia ETH into this market&apos;s WETH9, or supply ETH in one step via Aave&apos;s
                WrappedTokenGateway (wraps + supplies).
              </p>
            </div>
            <label className="form-control w-full">
              <span className="label-text font-semibold mb-1">ETH amount</span>
              <input
                type="text"
                inputMode="decimal"
                className="input input-bordered w-full"
                placeholder="0.0"
                value={ethAmount}
                onChange={e => setEthAmount(e.target.value)}
                disabled={isBusy}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-secondary"
                disabled={!state.isCorrectNetwork || isBusy || !ethAmount}
                onClick={() => void wrapEth(ethAmount)}
              >
                {state.isWrapping ? <span className="loading loading-spinner loading-sm" /> : null}
                Wrap to wETH
              </button>
              <button
                className="btn btn-primary"
                disabled={!state.isCorrectNetwork || isBusy || !ethAmount}
                onClick={() => void supplyEth(ethAmount)}
              >
                {state.isSupplying ? <span className="loading loading-spinner loading-sm" /> : null}
                Supply ETH
              </button>
            </div>
          </div>
        )}

        {state.canMint && hasZeroWalletBalance && (
          <div className="alert alert-warning">
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-semibold">No {selectedAssetConfig.displaySymbol} in this wallet</p>
              <p>
                {selectedAssetConfig.displaySymbol} uses owner-only mint (
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

        {state.canMint &&
          hasZeroWalletBalance &&
          state.isConnected &&
          state.isCorrectNetwork &&
          !state.isOwner &&
          state.tokenOwner && (
            <div className="alert alert-info text-sm">
              Minting is owner-only. Current owner: <Address address={state.tokenOwner} chain={sepolia} />
            </div>
          )}

        {state.canMint && state.isOwner && (
          <div className="bg-base-200 rounded-lg p-4 flex flex-col gap-3">
            <div>
              <h2 className="font-semibold">Owner faucet</h2>
              <p className="text-xs opacity-70 mt-1">
                Connected wallet owns {selectedAssetConfig.displaySymbol}. Mint to yourself or another address (
                {selectedAssetConfig.decimals} decimals).
              </p>
            </div>
            <label className="form-control w-full">
              <span className="label-text font-semibold mb-1">Mint amount ({selectedAssetConfig.displaySymbol})</span>
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
              Mint {selectedAssetConfig.displaySymbol}
            </button>
          </div>
        )}

        {selectedAsset !== "dNZD" && (
          <div className="alert alert-success text-sm">
            After supplying {selectedAsset} as collateral, switch to the <strong>dNZD</strong> tab to borrow the demo
            NZD stable against it.
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

        <p className="text-xs opacity-60">
          Reserves: {aaveHackathonMnzdConfig.assetSymbols.join(", ")}. Official Aave Sepolia UI is hidden for this demo
          (route still at <code>/aave</code> if needed).
        </p>
      </div>
    </div>
  );
};

export default MnzdPage;
