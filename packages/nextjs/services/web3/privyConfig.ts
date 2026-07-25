import type { PrivyClientConfig } from "@privy-io/react-auth";
import scaffoldConfig from "~~/scaffold.config";

const defaultChain = scaffoldConfig.targetNetworks[0];

export const privyConfig: PrivyClientConfig = {
  loginMethods: ["email", "wallet", "google", "apple", "twitter"],
  appearance: {
    accentColor: "#2299dd",
    showWalletLoginFirst: false,
  },
  defaultChain,
  supportedChains: [...scaffoldConfig.targetNetworks],
  embeddedWallets: {
    ethereum: {
      createOnLogin: "users-without-wallets",
    },
  },
};
