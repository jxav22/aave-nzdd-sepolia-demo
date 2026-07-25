import React from "react";
import Link from "next/link";
import { OraMark } from "~~/components/ora/OraMark";
import { aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";

const PRODUCT_LINKS = [
  { label: "Your account", href: "/app" },
  { label: "Rates & risk", href: "/market" },
];

/** Everything de-emphasised from the header ends up here. */
const TECHNICAL_LINKS = [
  { label: "API for developers", href: "/developer-api" },
  { label: "Advanced panel", href: "/advanced" },
];

export const Footer = () => {
  const explorer = `${aaveHackathonMnzdConfig.explorerBaseUrl}/address/${aaveHackathonMnzdConfig.poolAddress}`;

  return (
    <footer className="mt-auto border-t border-border bg-[var(--paper)]/50">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Link href="/" className="flex items-center gap-2.5">
            <OraMark size={22} />
            <span className="font-display text-lg leading-none">Ora</span>
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
            A New Zealand dollar lending market. Earn on NZD, or borrow against the crypto you already hold.
          </p>
        </div>

        <nav aria-label="Product">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Product</h2>
          <ul className="mt-4 flex flex-col gap-2.5 text-sm">
            {PRODUCT_LINKS.map(link => (
              <li key={link.href}>
                <Link href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Developers">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Developers</h2>
          <ul className="mt-4 flex flex-col gap-2.5 text-sm">
            {TECHNICAL_LINKS.map(link => (
              <li key={link.href}>
                <Link href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href="/api/v1/openapi.json"
                className="text-muted-foreground transition-colors hover:text-foreground"
                target="_blank"
                rel="noreferrer"
              >
                OpenAPI specification
              </a>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Market</h2>
          <ul className="mt-4 flex flex-col gap-2.5 text-sm">
            <li>
              <a
                href={explorer}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Lending pool contract
              </a>
            </li>
            <li>
              <Link href="/market" className="text-muted-foreground transition-colors hover:text-foreground">
                All contract addresses
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border/60">
        <div className="container-page flex flex-col gap-3 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="font-mono uppercase tracking-[0.18em]">Ora · Aotearoa New Zealand</span>
          <span className="max-w-xl leading-relaxed">
            Interest rates vary with market conditions and are not guaranteed. Borrowing against collateral carries a
            risk of liquidation. Nothing here is financial or tax advice.
          </span>
        </div>
      </div>
    </footer>
  );
};
