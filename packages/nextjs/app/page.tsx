"use client";

import Link from "next/link";
import type { NextPage } from "next";
import { Card, Eyebrow, Skeleton, Stat } from "~~/components/ora/primitives";
import { useHackathonMarket } from "~~/hooks/aave/useHackathonMarket";
import { formatBase, formatNzd, formatPercent } from "~~/utils/format/money";

/**
 * Landing page.
 *
 * Two audiences, two paths, and as little else as the page can get away with: someone with
 * New Zealand dollars who wants them to earn, and someone holding ETH or Bitcoin who needs
 * NZD without giving up the asset. Each path card carries its own live figure, so there is no
 * separate statistics band competing with them for attention.
 */

const Landing: NextPage = () => {
  return (
    <>
      <Hero />
      <TwoPaths />
      <RiskSection />
      <Footnote />
    </>
  );
};

export default Landing;

const Hero = () => (
  <section className="relative overflow-hidden">
    <div className="grain container-page grid gap-16 pt-16 pb-20 lg:grid-cols-[1.15fr_1fr] lg:pt-24 lg:pb-28">
      <div>
        <Eyebrow>Aotearoa New Zealand</Eyebrow>
        <h1 className="mt-5 font-display text-[3.25rem] leading-[1.02] tracking-[-0.02em] sm:text-[4.5rem] lg:text-[5rem]">
          Earn on your NZD,
          <br />
          borrow against
          <br />
          <em className="text-[var(--pine)]">your crypto.</em>
        </h1>
        <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Nearly every way to earn on-chain is priced in US dollars, so a New Zealander putting savings to work ends up
          holding a currency position they never chose. Ora is denominated in{" "}
          <span className="text-foreground">New Zealand dollars</span> throughout: what you deposit, what you owe and
          what you can borrow are all the same currency.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            href="/app?intent=earn"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-[var(--pine-deep)]"
          >
            Earn on New Zealand dollars
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/app?intent=borrow"
            className="inline-flex items-center gap-2 rounded-full border border-input px-6 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Borrow against your crypto
          </Link>
        </div>
        <p className="mt-6 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Sign in with an email address · No wallet to install
        </p>
      </div>

      <HeroCard />
    </div>
  </section>
);

const HeroCard = () => {
  const { bySymbol, isLoading } = useHackathonMarket();
  const nzd = bySymbol.dNZD;
  const eth = bySymbol.wETH;

  return (
    <div className="relative lg:pt-6">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(circle_at_top,var(--paper),transparent_65%)]" />
      <Card className="relative overflow-hidden">
        <div className="flex items-baseline justify-between">
          <Eyebrow>The NZD market</Eyebrow>
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--pine)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--pine)]" />
            Live
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <Stat
            label="Earn on NZD"
            value={isLoading ? <Skeleton className="h-7 w-20" /> : formatPercent(nzd?.supplyApyPercent ?? 0)}
            accent
            hint="Paid by borrowers"
          />
          <Stat
            label="Borrow NZD at"
            value={isLoading ? <Skeleton className="h-7 w-20" /> : formatPercent(nzd?.borrowApyPercent ?? 0)}
            hint="Variable rate"
          />
          <Stat
            label="Deposited"
            value={
              isLoading || !nzd ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                formatNzd(nzd.totalSupplied, nzd.decimals, { decimals: 0 })
              )
            }
            hint="Across the market"
          />
          <Stat
            label="Borrow up to"
            value={isLoading ? <Skeleton className="h-7 w-16" /> : formatPercent(eth?.maxLtvPercent ?? 0, 0)}
            hint="Of your collateral"
          />
        </div>

        <div className="hairline mt-8 pt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>How much of the pool is lent out</span>
            <span className="tabular font-mono text-foreground">
              {isLoading ? "-" : formatPercent(nzd?.utilisationPercent ?? 0, 1)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-[var(--pine)] transition-[width] duration-500"
              style={{ width: `${Math.min(100, nzd?.utilisationPercent ?? 0)}%` }}
            />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            The more that is borrowed, the more interest flows to the people who deposited it. The rate you earn moves
            with it.
          </p>
        </div>
      </Card>
    </div>
  );
};

const TwoPaths = () => {
  const { bySymbol, isLoading } = useHackathonMarket();
  const nzd = bySymbol.dNZD;
  const eth = bySymbol.wETH;

  return (
    <section className="container-page grid gap-8 pb-24 lg:grid-cols-2">
      <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-8 shadow-card lg:p-10">
        <div>
          <Eyebrow>If you have New Zealand dollars</Eyebrow>
          <h2 className="mt-4 font-display text-4xl leading-[1.05] lg:text-5xl">
            Put them to work.
            <br />
            <em>Take them back whenever.</em>
          </h2>
          <p className="mt-5 max-w-md text-muted-foreground">
            Deposit New Zealand dollars and earn the interest paid by the people borrowing them. Your balance grows
            continuously, and you can withdraw at any time.
          </p>

          <div className="mt-8 flex items-baseline gap-3">
            <span className="tabular font-display text-5xl text-[var(--clay)]">
              {isLoading ? "-" : formatPercent(nzd?.supplyApyPercent ?? 0)}
            </span>
            <span className="text-sm text-muted-foreground">current rate, variable</span>
          </div>
        </div>

        <div className="mt-10">
          <ol className="flex flex-col gap-3 text-sm">
            {[
              "Sign in with your email address",
              "Deposit New Zealand dollars",
              "Interest accrues into your balance",
            ].map((step, index) => (
              <li key={step} className="flex items-center gap-3 text-foreground">
                <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <Link
            href="/app?intent=earn"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-[var(--pine-deep)]"
          >
            Start earning
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>

      <div className="flex flex-col justify-between rounded-2xl border border-[var(--pine)]/40 bg-[var(--pine-deep)] p-8 text-[var(--cream)] shadow-card lg:p-10">
        <div>
          <Eyebrow className="text-[var(--moss)]">If you hold ETH or Bitcoin</Eyebrow>
          <h2 className="mt-4 font-display text-4xl leading-[1.05] lg:text-5xl">
            Get New Zealand dollars
            <br />
            <em className="text-[var(--moss)]">without selling.</em>
          </h2>
          <p className="mt-5 max-w-md text-[var(--cream)]/75">
            Deposit your ETH or Bitcoin as collateral and borrow New Zealand dollars against it. You are not selling.
            The asset stays yours, and so does any movement in its price. Repay whenever you like and take the
            collateral back.
          </p>
        </div>

        <div>
          <div className="mt-10 grid grid-cols-3 gap-6">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--cream)]/60">
                Borrow up to
              </div>
              <div className="tabular mt-1 font-display text-2xl">
                {isLoading ? "-" : formatPercent(eth?.maxLtvPercent ?? 0, 0)}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--cream)]/60">
                Borrow rate
              </div>
              <div className="tabular mt-1 font-display text-2xl">
                {isLoading ? "-" : formatPercent(nzd?.borrowApyPercent ?? 0)}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--cream)]/60">Collateral</div>
              <div className="mt-1 font-display text-2xl">ETH · BTC</div>
            </div>
          </div>

          <p className="mt-8 text-xs leading-relaxed text-[var(--cream)]/60">
            Borrowing against your crypto is not the same as selling it, so you keep the asset. Whether that has any
            bearing on your tax position depends on your own circumstances. This is not tax advice, and it is worth
            speaking to an accountant. If your collateral falls far enough in value, some of it can be sold to repay
            what you owe.
          </p>

          <Link
            href="/app?intent=borrow"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--clay)] px-6 py-3.5 text-sm font-medium text-[var(--cream)] transition-transform hover:-translate-y-0.5"
          >
            See what you could borrow
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
};

const RiskSection = () => {
  const { bySymbol } = useHackathonMarket();
  const eth = bySymbol.wETH;

  return (
    <section className="border-y border-border bg-[var(--paper)]/60">
      <div className="container-page grid gap-10 py-20 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <Eyebrow>Before you borrow</Eyebrow>
          <h2 className="mt-3 font-display text-4xl leading-[1.05] lg:text-5xl">
            See how far
            <br />
            <em>a fall would take you.</em>
          </h2>
          <p className="mt-5 max-w-md text-muted-foreground">
            Borrowing against a volatile asset means a large enough price fall can cost you the collateral. Our stress
            tester takes your actual position, applies declines drawn from how ETH has really moved, and shows where
            liquidation would begin, before you commit to anything.
          </p>
          <Link
            href="/market"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-input px-6 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-card"
          >
            Open the stress tester
            <span aria-hidden>→</span>
          </Link>
        </div>

        <Card>
          <Eyebrow>An illustration · 1 ETH deposited, NZ$1,000 borrowed</Eyebrow>
          <div className="overflow-x-auto">
            <table className="mt-5 w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="pb-2 font-normal text-muted-foreground">If ETH falls</th>
                  <th className="pb-2 text-right font-normal text-muted-foreground">Health factor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { move: "Nothing changes", hf: "1.60", tone: "text-[var(--pine)]" },
                  { move: "A typical day's movement", hf: "1.56", tone: "text-[var(--pine)]" },
                  { move: "Its worst fall in the last month", hf: "1.44", tone: "text-[var(--pine)]" },
                  { move: "25%", hf: "1.20", tone: "text-[var(--clay)]" },
                  { move: "40%", hf: "0.96", tone: "text-destructive" },
                ].map(row => (
                  <tr key={row.move}>
                    <td className="py-2.5">{row.move}</td>
                    <td className={`tabular py-2.5 text-right font-mono ${row.tone}`}>{row.hf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            An illustration, not your position, and not a forecast. The real thing reads your own collateral at its live
            price
            {eth && eth.oraclePrice > 0n ? ` (ETH is currently ${formatBase(eth.oraclePrice)}) ` : " "}
            and shows the decline at which liquidation would begin.
          </p>
        </Card>
      </div>
    </section>
  );
};

const Footnote = () => (
  <section className="container-page py-20">
    <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
      <div>
        <Eyebrow>What is underneath</Eyebrow>
        <p className="mt-6 max-w-3xl font-display text-3xl leading-[1.15] lg:text-4xl">
          Deposits and loans sit in a lending contract, not with us. Balances, rates and every transaction are on a
          public ledger you can read yourself.
        </p>
        <p className="mt-6 max-w-2xl text-muted-foreground">
          Ora never takes custody of your money. Signing in creates a wallet that you control, and every deposit,
          withdrawal, loan and repayment is a transaction you approve. The lending mechanics are the well-proven part;
          what we built is the part a New Zealander can actually use.
        </p>
      </div>
      <div className="flex flex-col justify-end gap-3">
        <Link
          href="/market"
          className="inline-flex items-center justify-between gap-3 rounded-full border border-input px-6 py-4 text-sm font-medium transition-colors hover:bg-card"
        >
          Rates and contracts
          <span aria-hidden>→</span>
        </Link>
        <Link
          href="/app"
          className="inline-flex items-center justify-between gap-3 rounded-full bg-primary px-6 py-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-[var(--pine-deep)]"
        >
          Open your account
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  </section>
);
