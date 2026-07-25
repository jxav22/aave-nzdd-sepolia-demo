"use client";

import { useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { ArrowTopRightOnSquareIcon, ChevronDownIcon, DocumentDuplicateIcon } from "@heroicons/react/24/outline";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { truncateAddress } from "~~/utils/format/money";

/**
 * Account control for the header.
 *
 * Privy handles sign-in and provisions an embedded wallet, so someone can hold a position
 * without ever installing one. The signed-in surface leads with the identity they recognise
 * — their email — and keeps the address available but secondary.
 */
export const PrivyAuthButton = () => {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { address, chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useOutsideClick(menuRef, () => setOpen(false));

  const identity =
    user?.email?.address ?? user?.google?.email ?? user?.apple?.email ?? user?.twitter?.username ?? undefined;

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

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied — the address is on screen to copy manually.
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
  );
};
