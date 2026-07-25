"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { PrivyAuthButton } from "~~/components/PrivyAuthButton";
import { OraMark } from "~~/components/ora/OraMark";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick } from "~~/hooks/scaffold-eth";
import { isPrivyEnabled } from "~~/utils/auth/isPrivyEnabled";

type NavLink = { label: string; href: string };

/** Two links, deliberately. Everything else lives in the footer. */
const NAV_LINKS: NavLink[] = [
  { label: "Your account", href: "/app" },
  { label: "Rates & risk", href: "/market" },
];

export const Header = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useOutsideClick(menuRef, () => setMenuOpen(false));

  // Warm the route compiles so the first soft navigation does not race an uncompiled route.
  useEffect(() => {
    for (const { href } of NAV_LINKS) {
      router.prefetch(href);
    }
  }, [router]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <OraMark />
          <span className="font-display text-xl leading-none">Ora</span>
          <span className="ml-1 hidden font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:inline">
            Aotearoa
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm md:flex">
          {NAV_LINKS.map(({ label, href }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                prefetch
                aria-current={isActive ? "page" : undefined}
                className={`transition-colors ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            {isPrivyEnabled ? <PrivyAuthButton /> : <RainbowKitCustomConnectButton />}
          </div>

          <div className="relative md:hidden" ref={menuRef}>
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(open => !open)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-input text-foreground"
            >
              {menuOpen ? <XMarkIcon className="h-4 w-4" /> : <Bars3Icon className="h-4 w-4" />}
            </button>

            {menuOpen ? (
              <div className="absolute right-0 top-11 w-56 rounded-xl border border-border bg-card p-2 shadow-card">
                {NAV_LINKS.map(({ label, href }) => (
                  <Link
                    key={href}
                    href={href}
                    className="block rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-secondary"
                  >
                    {label}
                  </Link>
                ))}
                <div className="hairline mt-2 px-3 pt-3 sm:hidden">
                  {isPrivyEnabled ? <PrivyAuthButton /> : <RainbowKitCustomConnectButton />}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
};
