"use client";

import { useState } from "react";
import type { NextPage } from "next";
import { ArrowTopRightOnSquareIcon, DocumentDuplicateIcon } from "@heroicons/react/24/outline";
import { StressTester } from "~~/components/ora/StressTester";
import { Card, DataRow, Eyebrow, Note, SectionHeading, Skeleton } from "~~/components/ora/primitives";
import { aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";
import { type ReserveSummary, useHackathonMarket } from "~~/hooks/aave/useHackathonMarket";
import {
  BASE_CURRENCY,
  formatBase,
  formatNzd,
  formatPercent,
  formatToken,
  truncateAddress,
} from "~~/utils/format/money";

/**
 * Rates and risk, on one page.
 *
 * Two stacked sections: what the market currently charges and pays, and the stress tester. The
 * technical detail, configuration, contract addresses, which prices come from a live feed, is
 * available but folded away, because it matters to a handful of people and to nobody else.
 */

const DISPLAY_NAME: Record<string, string> = {
  dNZD: "New Zealand dollars",
  wETH: "Ether",
  wBTC: "Bitcoin",
};

const MarketPage: NextPage = () => {
  const { reserves, bySymbol, blockNumber, isLoading, error, refetch } = useHackathonMarket();
  const nzd = bySymbol.dNZD;

  return (
    <div className="container-page py-12 lg:py-16">
      <SectionHeading eyebrow="The market" title={<>Rates &amp; risk</>}>
        What it currently costs to borrow New Zealand dollars, what depositing them earns, and a tool for testing a loan
        against a fall in the price of your collateral.
      </SectionHeading>

      {error ? (
        <Note tone="error" className="mt-8">
          The market could not be read right now. {error.message}
        </Note>
      ) : null}

      {/* Rates */}
      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Eyebrow>Current rates</Eyebrow>
          <button
            type="button"
            onClick={refetch}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-5 py-4 font-mono text-[10px] font-normal uppercase tracking-[0.18em] text-muted-foreground">
                  Asset
                </th>
                <th className="px-5 py-4 text-right font-mono text-[10px] font-normal uppercase tracking-[0.18em] text-muted-foreground">
                  Price
                </th>
                <th className="px-5 py-4 text-right font-mono text-[10px] font-normal uppercase tracking-[0.18em] text-muted-foreground">
                  Deposited
                </th>
                <th className="px-5 py-4 text-right font-mono text-[10px] font-normal uppercase tracking-[0.18em] text-muted-foreground">
                  Available
                </th>
                <th className="px-5 py-4 text-right font-mono text-[10px] font-normal uppercase tracking-[0.18em] text-muted-foreground">
                  Earn
                </th>
                <th className="px-5 py-4 text-right font-mono text-[10px] font-normal uppercase tracking-[0.18em] text-muted-foreground">
                  Borrow at
                </th>
                <th className="px-5 py-4 text-right font-mono text-[10px] font-normal uppercase tracking-[0.18em] text-muted-foreground">
                  Borrow up to
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && reserves.length === 0
                ? [0, 1, 2].map(row => (
                    <tr key={row} className="border-b border-border last:border-0">
                      <td className="px-5 py-4" colSpan={7}>
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))
                : reserves.map(reserve => <ReserveRow key={reserve.symbol} reserve={reserve} />)}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {`Rates are variable and recalculated by the lending pool as deposits and loans change. Prices are quoted in ${BASE_CURRENCY.code} by the market's price oracle; New Zealand dollar balances are shown in NZD.`}
          {blockNumber ? ` Read at block ${blockNumber.toString()}.` : ""}
        </p>

        {nzd && nzd.availableLiquidity === 0n && !isLoading ? (
          <Note tone="warning" className="mt-6" title="No New Zealand dollars are available to borrow">
            {nzd.totalSupplied === 0n
              ? "Nothing has been deposited into the New Zealand dollar pool yet, so there is nothing to lend. Loans become available once deposits come in."
              : "Everything deposited is currently lent out. New loans will go through once further deposits come in or existing loans are repaid."}
          </Note>
        ) : null}
      </section>

      {/* Stress tester */}
      <section className="mt-16">
        <SectionHeading eyebrow="Risk" title={<>Test a loan before you take it</>} />
        <div className="mt-8">
          <StressTester />
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          This assessment is also available as an API:{" "}
          <a href="/developer-api" className="underline underline-offset-4 hover:text-foreground">
            documentation for developers
          </a>
          .
        </p>
      </section>

      {/* Contracts */}
      <section className="mt-16">
        <Contracts />
      </section>
    </div>
  );
};

export default MarketPage;

const ReserveRow = ({ reserve }: { reserve: ReserveSummary }) => {
  const [expanded, setExpanded] = useState(false);
  const isNzd = reserve.symbol === "dNZD";

  const depositedDisplay = isNzd
    ? formatNzd(reserve.totalSupplied, reserve.decimals, { decimals: 0 })
    : formatToken(reserve.totalSupplied, reserve.decimals, reserve.symbol === "wETH" ? "ETH" : "BTC");

  const availableDisplay = isNzd
    ? formatNzd(reserve.availableLiquidity, reserve.decimals, { decimals: 0 })
    : formatToken(reserve.availableLiquidity, reserve.decimals, reserve.symbol === "wETH" ? "ETH" : "BTC");

  return (
    <>
      <tr
        className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-secondary/40"
        onClick={() => setExpanded(value => !value)}
      >
        <td className="px-5 py-4">
          <button
            type="button"
            aria-expanded={expanded}
            className="text-left"
            onClick={event => {
              event.stopPropagation();
              setExpanded(value => !value);
            }}
          >
            <span className="text-foreground">{DISPLAY_NAME[reserve.symbol] ?? reserve.symbol}</span>
            <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {reserve.symbol}
              {!reserve.isActive ? " · not active" : ""}
              {reserve.isFrozen ? " · frozen" : ""}
              {!reserve.borrowingEnabled ? " · borrowing off" : ""}
            </span>
          </button>
        </td>
        <td className="tabular px-5 py-4 text-right font-mono">{formatBase(reserve.oraclePrice)}</td>
        <td className="tabular px-5 py-4 text-right font-mono">{depositedDisplay}</td>
        <td
          className={`tabular px-5 py-4 text-right font-mono ${
            reserve.availableLiquidity === 0n ? "text-destructive" : ""
          }`}
        >
          {availableDisplay}
        </td>
        <td className="tabular px-5 py-4 text-right font-mono text-[var(--pine)]">
          {formatPercent(reserve.supplyApyPercent)}
        </td>
        <td className="tabular px-5 py-4 text-right font-mono">{formatPercent(reserve.borrowApyPercent)}</td>
        <td className="tabular px-5 py-4 text-right font-mono">
          {reserve.canBeCollateral ? formatPercent(reserve.maxLtvPercent, 0) : "-"}
        </td>
      </tr>

      {expanded ? (
        <tr className="border-b border-border bg-secondary/30 last:border-0">
          <td colSpan={7} className="px-5 py-6">
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <Eyebrow>Configuration</Eyebrow>
                <div className="mt-2 divide-y divide-border">
                  <DataRow label="Borrow up to" value={formatPercent(reserve.maxLtvPercent, 2)} />
                  <DataRow
                    label="Liquidation threshold"
                    value={formatPercent(reserve.liquidationThresholdPercent, 2)}
                    hint="Where collateral can start being sold"
                  />
                  <DataRow label="Liquidation fee" value={formatPercent(reserve.liquidationBonusPercent, 2)} />
                  <DataRow label="Share of interest retained" value={formatPercent(reserve.reserveFactorPercent, 2)} />
                  <DataRow label="Currently lent out" value={formatPercent(reserve.utilisationPercent, 2)} />
                  <DataRow label="Decimals" value={String(reserve.decimals)} />
                  <DataRow
                    label="Deposit cap"
                    value={reserve.supplyCap === 0n ? "No cap" : reserve.supplyCap.toString()}
                  />
                  <DataRow
                    label="Borrow cap"
                    value={reserve.borrowCap === 0n ? "No cap" : reserve.borrowCap.toString()}
                  />
                  <DataRow label="Usable as collateral" value={reserve.canBeCollateral ? "Yes" : "No"} />
                </div>
              </div>

              <div>
                <Eyebrow>Where the price comes from</Eyebrow>
                <div className="mt-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                      reserve.priceFeedKind === "chainlink"
                        ? "border-[var(--pine)]/40 bg-[var(--pine)]/10 text-[var(--pine)]"
                        : "border-border bg-secondary text-muted-foreground"
                    }`}
                  >
                    {reserve.priceFeedDescription}
                  </span>
                </div>
                <AddressLine label="Price feed" address={reserve.config.priceFeedAddress} />

                <div className="mt-5">
                  <Eyebrow>Contracts</Eyebrow>
                  <AddressLine label="Token" address={reserve.config.underlyingAddress} />
                  <AddressLine label="Deposit receipt" address={reserve.config.aTokenAddress} />
                  <AddressLine label="Loan record" address={reserve.config.variableDebtTokenAddress} />
                </div>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
};

const AddressLine = ({ label, address }: { label: string; address: string }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable; the address is on screen.
    }
  };

  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="tabular font-mono text-xs">{truncateAddress(address, 10, 8)}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label} address`}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          {copied ? <span className="text-[10px]">Copied</span> : <DocumentDuplicateIcon className="h-3.5 w-3.5" />}
        </button>
        <a
          href={`${aaveHackathonMnzdConfig.explorerBaseUrl}/address/${address}`}
          target="_blank"
          rel="noreferrer"
          aria-label={`View ${label} on the block explorer`}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
};

const Contracts = () => (
  <Card>
    <details>
      <summary className="cursor-pointer text-sm font-medium">Market contracts</summary>
      <div className="mt-5 grid gap-8 border-t border-border pt-5 lg:grid-cols-2">
        <div>
          <Eyebrow>Core</Eyebrow>
          <AddressLine label="Lending pool" address={aaveHackathonMnzdConfig.poolAddress} />
          <AddressLine label="Address registry" address={aaveHackathonMnzdConfig.poolAddressesProvider} />
          <AddressLine label="Price oracle" address={aaveHackathonMnzdConfig.aaveOracle} />
        </div>
        <div>
          <Eyebrow>Supporting</Eyebrow>
          <AddressLine label="Market data" address={aaveHackathonMnzdConfig.protocolDataProvider} />
          <AddressLine label="ETH deposit helper" address={aaveHackathonMnzdConfig.wrappedTokenGateway} />
        </div>
      </div>
    </details>
  </Card>
);
