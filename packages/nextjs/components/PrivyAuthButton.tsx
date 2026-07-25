"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Balance } from "@scaffold-ui/components";
import { getBlockExplorerAddressLink } from "@scaffold-ui/hooks";
import { Address } from "viem";
import { useAccount } from "wagmi";
import { AddressInfoDropdown } from "~~/components/scaffold-eth/RainbowKitCustomConnectButton/AddressInfoDropdown";
import { AddressQRCodeModal } from "~~/components/scaffold-eth/RainbowKitCustomConnectButton/AddressQRCodeModal";
import { WrongNetworkDropdown } from "~~/components/scaffold-eth/RainbowKitCustomConnectButton/WrongNetworkDropdown";
import { useNetworkColor, useTargetNetwork } from "~~/hooks/scaffold-eth";

export const PrivyAuthButton = () => {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { address, chain } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const networkColor = useNetworkColor();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const email =
    user?.email?.address ?? user?.google?.email ?? user?.apple?.email ?? user?.twitter?.username ?? undefined;

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE", credentials: "include" });
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (!ready) {
    return <button className="btn btn-primary btn-sm btn-disabled">Loading…</button>;
  }

  if (!authenticated) {
    return (
      <button className="btn btn-primary btn-sm" type="button" onClick={login}>
        Sign in
      </button>
    );
  }

  if (address && chain && chain.id !== targetNetwork.id) {
    return <WrongNetworkDropdown onDisconnect={handleLogout} />;
  }

  if (address) {
    const blockExplorerAddressLink = getBlockExplorerAddressLink(targetNetwork, address);
    return (
      <div className="flex items-center gap-2">
        <div className="flex flex-col items-center mr-1">
          <Balance
            address={address as Address}
            style={{
              minHeight: "0",
              height: "auto",
              fontSize: "0.8em",
            }}
          />
          <span className="text-xs" style={{ color: networkColor }}>
            {chain?.name ?? targetNetwork.name}
          </span>
          {email ? <span className="text-[10px] opacity-60 max-w-[9rem] truncate">{email}</span> : null}
        </div>
        <AddressInfoDropdown
          address={address as Address}
          displayName={address}
          ensAvatar={undefined}
          blockExplorerAddressLink={blockExplorerAddressLink}
          onDisconnect={handleLogout}
        />
        <AddressQRCodeModal address={address as Address} modalId="qrcode-modal" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm opacity-70">{email ?? "Signed in"}</span>
      <button className="btn btn-ghost btn-sm" type="button" onClick={handleLogout} disabled={isLoggingOut}>
        {isLoggingOut ? "…" : "Sign out"}
      </button>
    </div>
  );
};
