"use client";

import { usePrivy } from "@privy-io/react-auth";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { isPrivyEnabled } from "~~/utils/auth/isPrivyEnabled";

/**
 * Sign-in call to action.
 *
 * `isPrivyEnabled` is fixed for a given build, so branching on it selects between two
 * components rather than conditionally calling a hook, `usePrivy` is only ever reached
 * when the provider is mounted.
 */

const PrivyLogin = ({ label, tone }: { label: string; tone: "primary" | "clay" }) => {
  const { login, ready, authenticated } = usePrivy();

  return (
    <button
      type="button"
      onClick={login}
      disabled={!ready || authenticated}
      className={`inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium transition-colors disabled:opacity-60 ${
        tone === "clay"
          ? "bg-[var(--clay)] text-[var(--cream)] hover:opacity-90"
          : "bg-primary text-primary-foreground hover:bg-[var(--pine-deep)]"
      }`}
    >
      {ready ? label : "Loading…"}
      <span aria-hidden>→</span>
    </button>
  );
};

export const SignInCta = ({
  label = "Sign in to continue",
  tone = "primary",
}: {
  label?: string;
  tone?: "primary" | "clay";
}) => {
  if (isPrivyEnabled) {
    return <PrivyLogin label={label} tone={tone} />;
  }
  return <RainbowKitCustomConnectButton />;
};
