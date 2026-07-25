"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { SignInCta } from "~~/components/ora/SignInCta";
import { BorrowPanel } from "~~/components/ora/account/BorrowPanel";
import { EarnPanel } from "~~/components/ora/account/EarnPanel";
import { OverviewPanel } from "~~/components/ora/account/OverviewPanel";
import { ActionButton, Card, Eyebrow, Note, Skeleton } from "~~/components/ora/primitives";
import { useAaveHackathonMnzd } from "~~/hooks/aave/useAaveHackathonMnzd";
import { useHackathonMarket } from "~~/hooks/aave/useHackathonMarket";
import { useUserPositions } from "~~/hooks/aave/useUserPositions";
import { isPrivyEnabled } from "~~/utils/auth/isPrivyEnabled";
import { formatNzd, truncateAddress } from "~~/utils/format/money";

/**
 * The account page — everything someone does with their money, on one page.
 *
 * Where they stand comes first, then the two things they can do. `?intent=earn` or
 * `?intent=borrow` from the landing page decides which is open on arrival; neither path is
 * ever closed off.
 */

type Tab = "overview" | "earn" | "borrow";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "earn", label: "Earn" },
  { id: "borrow", label: "Borrow" },
];

const AccountPage: NextPage = () => (
  <Suspense fallback={<AccountLoading />}>
    <Account />
  </Suspense>
);

export default AccountPage;

const AccountLoading = () => (
  <div className="container-page py-14">
    <Skeleton className="h-8 w-56" />
    <div className="mt-8 grid gap-6 lg:grid-cols-3">
      <Skeleton className="h-64 lg:col-span-2" />
      <Skeleton className="h-64" />
    </div>
  </div>
);

const Account = () => {
  const searchParams = useSearchParams();
  const intent = searchParams.get("intent");
  const { address } = useAccount();

  const [tab, setTab] = useState<Tab>(() => (intent === "borrow" ? "borrow" : intent === "earn" ? "earn" : "overview"));

  useEffect(() => {
    if (intent === "earn") setTab("earn");
    if (intent === "borrow") setTab("borrow");
  }, [intent]);

  const positions = useUserPositions();
  const { bySymbol, isLoading: marketLoading, refetch: refetchMarket } = useHackathonMarket();
  const nzdActions = useAaveHackathonMnzd("dNZD");

  const refreshAll = () => {
    positions.refetch();
    refetchMarket();
    void nzdActions.refresh();
  };

  if (!positions.isConnected) {
    return <SignedOut />;
  }

  const nzd = positions.positions.dNZD;

  return (
    <div className="container-page py-10 lg:py-14">
      <header className="flex flex-col gap-6 border-b border-border pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Eyebrow>Your account</Eyebrow>
          <h1 className="mt-2 font-display text-3xl">{address ? truncateAddress(address, 8, 6) : "Account"}</h1>
        </div>
        <div className="lg:text-right">
          <Eyebrow>Deposited, earning</Eyebrow>
          <div className="tabular mt-1 font-display text-4xl text-[var(--pine)] lg:text-5xl">
            {positions.isLoading && nzd.deposited === 0n ? (
              <Skeleton className="h-10 w-40" />
            ) : (
              formatNzd(nzd.deposited, nzd.decimals)
            )}
          </div>
          {positions.hasAnyDebt ? (
            <div className="mt-1 text-sm text-muted-foreground">
              Borrowed <span className="tabular font-mono">{formatNzd(nzd.borrowed, nzd.decimals)}</span>
            </div>
          ) : null}
        </div>
      </header>

      {!positions.isCorrectNetwork ? (
        <Note tone="warning" className="mt-8" title="Your wallet is on a different network">
          <div className="flex flex-wrap items-center gap-3">
            <span>Switch networks to see your position and make transactions.</span>
            <ActionButton tone="outline" onClick={() => void nzdActions.switchToSepolia()}>
              Switch network
            </ActionButton>
          </div>
        </Note>
      ) : null}

      <nav
        className="mt-8 flex gap-1 rounded-full border border-border bg-secondary/50 p-1"
        aria-label="Account sections"
      >
        {TABS.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? "true" : undefined}
            className={`flex-1 rounded-full px-4 py-2 text-sm transition-colors ${
              tab === item.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-8">
        {tab === "overview" ? (
          <OverviewPanel
            positions={positions}
            reserveBySymbol={bySymbol}
            onGoToEarn={() => setTab("earn")}
            onGoToBorrow={() => setTab("borrow")}
          />
        ) : null}

        {tab === "earn" ? (
          <EarnPanel reserve={bySymbol.dNZD} position={nzd} actions={nzdActions} onRefresh={refreshAll} />
        ) : null}

        {tab === "borrow" ? (
          <BorrowPanel
            address={address}
            positions={positions}
            nzdReserve={bySymbol.dNZD}
            reserveBySymbol={bySymbol}
            nzdActions={nzdActions}
            onRefresh={refreshAll}
          />
        ) : null}
      </div>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground">
        <span>{marketLoading ? "Reading the market…" : "Figures update automatically as the market moves."}</span>
        <div className="flex items-center gap-4">
          <button type="button" onClick={refreshAll} className="underline underline-offset-4 hover:text-foreground">
            Refresh now
          </button>
          <Link href="/market" className="underline underline-offset-4 hover:text-foreground">
            Rates & risk
          </Link>
        </div>
      </footer>
    </div>
  );
};

/**
 * Signed-out state.
 *
 * The headline has to match the control beneath it. Privy provisions a wallet from an email
 * address; without it the app falls back to connecting an existing wallet, and promising email
 * sign-in there would be a lie the button immediately contradicts.
 */
const SignedOut = () => (
  <div className="container-page grid items-start gap-14 py-16 lg:grid-cols-2 lg:py-24">
    <div>
      <Eyebrow>Sign in</Eyebrow>
      {isPrivyEnabled ? (
        <>
          <h1 className="mt-5 font-display text-5xl leading-[1.02] lg:text-6xl">
            Your email is
            <br />
            <em className="text-[var(--pine)]">your account.</em>
          </h1>
          <p className="mt-6 max-w-md text-muted-foreground">
            Signing in creates a wallet that only you control. There is nothing to install and no seed phrase to write
            down.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-5 font-display text-5xl leading-[1.02] lg:text-6xl">
            Connect a wallet
            <br />
            <em className="text-[var(--pine)]">to get started.</em>
          </h1>
          <p className="mt-6 max-w-md text-muted-foreground">
            Your deposits and loans stay under your own control. Ora never holds your money — every transaction is one
            you approve yourself.
          </p>
        </>
      )}
      <div className="mt-8">
        <SignInCta label="Continue with email" />
      </div>
    </div>

    <div className="grid gap-5">
      <Card>
        <Eyebrow>Earn on New Zealand dollars</Eyebrow>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Deposit NZD and earn the interest paid by people borrowing them. Withdraw whenever you like.
        </p>
        <Link
          href="/app?intent=earn"
          className="mt-4 inline-block text-sm underline underline-offset-4 hover:text-foreground"
        >
          What this involves
        </Link>
      </Card>
      <Card>
        <Eyebrow>Borrow against ETH or Bitcoin</Eyebrow>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Deposit what you already hold as collateral and borrow New Zealand dollars against it, without selling the
          asset.
        </p>
        <Link
          href="/app?intent=borrow"
          className="mt-4 inline-block text-sm underline underline-offset-4 hover:text-foreground"
        >
          What this involves
        </Link>
      </Card>
    </div>
  </div>
);
