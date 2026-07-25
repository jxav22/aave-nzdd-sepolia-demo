"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type WalletWithMetadata, useExportWallet, usePrivy } from "@privy-io/react-auth";
import { getAddress, isAddress, isAddressEqual } from "viem";
import { useAccount } from "wagmi";
import {
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/outline";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { truncateAddress } from "~~/utils/format/money";
import { getParsedError, notification } from "~~/utils/scaffold-eth";

/**
 * Account control for the header.
 *
 * Privy handles sign-in and provisions an embedded wallet, so someone can hold a position
 * without ever installing one. The signed-in surface leads with the identity they recognise
 * their email, and keeps the address available but secondary.
 *
 * Users with a Privy-created embedded wallet can export the private key via Privy's
 * cross-origin modal (escape hatch); this app never sees the key.
 */

const isPrivyEmbeddedEthereumWallet = (account: { type: string }): account is WalletWithMetadata =>
  account.type === "wallet" &&
  "walletClientType" in account &&
  account.walletClientType === "privy" &&
  "chainType" in account &&
  account.chainType === "ethereum" &&
  "address" in account &&
  typeof account.address === "string" &&
  isAddress(account.address);

export const PrivyAuthButton = () => {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { exportWallet } = useExportWallet();
  const { address, chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useOutsideClick(menuRef, () => setOpen(false));

  const identity =
    user?.email?.address ?? user?.google?.email ?? user?.apple?.email ?? user?.twitter?.username ?? undefined;

  const embeddedWalletAddress = user?.linkedAccounts?.find(isPrivyEmbeddedEthereumWallet)?.address;

  const canExportPrivateKey =
    ready &&
    authenticated &&
    typeof address === "string" &&
    isAddress(address) &&
    typeof embeddedWalletAddress === "string" &&
    isAddress(embeddedWalletAddress) &&
    isAddressEqual(address, embeddedWalletAddress);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
      await logout();
    } finally {
      setIsSigningOut(false);
      setOpen(false);
    }
  };

  const handleExportPrivateKey = async () => {
    if (!embeddedWalletAddress || !isAddress(embeddedWalletAddress)) return;
    setIsExporting(true);
    try {
      // Privy's promise resolves when the user exits their modal, so close our confirm first.
      setExportConfirmOpen(false);
      await exportWallet({ address: getAddress(embeddedWalletAddress) });
    } catch (e) {
      notification.error(getParsedError(e));
    } finally {
      setIsExporting(false);
    }
  };

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied. The address is on screen to copy manually.
    }
  };

  if (!ready) {
    return (
      <span className="inline-flex items-center rounded-full border border-input px-5 py-2 text-sm text-muted-foreground">
        Loading
      </span>
    );
  }

  if (!authenticated) {
    return (
      <button
        type="button"
        onClick={login}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-[var(--pine-deep)]"
      >
        Sign in
        <span aria-hidden>→</span>
      </button>
    );
  }

  const onWrongNetwork = Boolean(address && chain && chain.id !== targetNetwork.id);

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          className={`inline-flex max-w-[13rem] items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
            onWrongNetwork
              ? "border-destructive/50 bg-destructive/10 text-foreground"
              : "border-input bg-background text-foreground hover:bg-secondary"
          }`}
        >
          <span className="truncate">{identity ?? (address ? truncateAddress(address) : "Account")}</span>
          <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>

        {open ? (
          <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-border bg-card p-3 shadow-card">
            {identity ? (
              <div className="px-1 pb-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Signed in as
                </div>
                <div className="mt-1 truncate text-sm">{identity}</div>
              </div>
            ) : null}

            {address ? (
              <div className="hairline px-1 py-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Wallet</div>
                <div className="mt-1 font-mono text-xs">{truncateAddress(address, 10, 8)}</div>
                <div className="mt-2 flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={copyAddress}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <DocumentDuplicateIcon className="h-3.5 w-3.5" />
                    {copied ? "Copied" : "Copy address"}
                  </button>
                  <a
                    href={`${targetNetwork.blockExplorers?.default.url ?? ""}/address/${address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                    View on explorer
                  </a>
                  {canExportPrivateKey ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        setExportConfirmOpen(true);
                      }}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-destructive hover:bg-secondary"
                    >
                      <EyeIcon className="h-3.5 w-3.5" />
                      Export private key
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="hairline pt-2">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
              >
                {isSigningOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {exportConfirmOpen && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="export-pk-title"
                className="my-auto w-full max-w-md max-h-[min(100%,calc(100dvh-2rem))] overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-card"
              >
                <h2 id="export-pk-title" className="text-lg font-semibold">
                  Export wallet private key
                </h2>
                <div className="mt-4 flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <ShieldExclamationIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <span className="font-medium">
                    Anyone with this private key has full control of your wallet and funds. Never share it.
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Continue only if you are moving this wallet to another client (for example MetaMask). The key is shown
                  in a secure Privy window — this app never sees it.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-input px-4 py-2 text-sm hover:bg-secondary"
                    onClick={() => setExportConfirmOpen(false)}
                    disabled={isExporting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                    onClick={handleExportPrivateKey}
                    disabled={isExporting}
                  >
                    {isExporting ? "Opening…" : "Continue to export"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
};
