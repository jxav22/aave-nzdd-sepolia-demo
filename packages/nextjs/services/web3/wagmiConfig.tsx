import { wagmiConnectors } from "./wagmiConnectors";
import { createConfig as createPrivyWagmiConfig } from "@privy-io/wagmi";
import { Chain, createClient, fallback, http } from "viem";
import { hardhat, mainnet } from "viem/chains";
import { createConfig } from "wagmi";
import scaffoldConfig, { DEFAULT_ALCHEMY_API_KEY, ScaffoldConfig } from "~~/scaffold.config";
import { isPrivyEnabled } from "~~/utils/auth/isPrivyEnabled";
import { getAlchemyHttpUrl } from "~~/utils/scaffold-eth";

const { targetNetworks } = scaffoldConfig;

// We always want to have mainnet enabled (ENS resolution, ETH price, etc). But only once.
export const enabledChains = targetNetworks.find((network: Chain) => network.id === 1)
  ? targetNetworks
  : ([...targetNetworks, mainnet] as const);

const buildRpcFallbacks = (chain: Chain) => {
  const mainnetFallbackWithDefaultRPC = [http("https://mainnet.rpc.buidlguidl.com")];
  let rpcFallbacks = [...(chain.id === mainnet.id ? mainnetFallbackWithDefaultRPC : []), http()];
  const rpcOverrideUrl = (scaffoldConfig.rpcOverrides as ScaffoldConfig["rpcOverrides"])?.[chain.id];
  if (rpcOverrideUrl) {
    rpcFallbacks = [http(rpcOverrideUrl), ...rpcFallbacks];
  } else {
    const alchemyHttpUrl = getAlchemyHttpUrl(chain.id);
    if (alchemyHttpUrl) {
      const isUsingDefaultKey = scaffoldConfig.alchemyApiKey === DEFAULT_ALCHEMY_API_KEY;
      rpcFallbacks = isUsingDefaultKey
        ? [...rpcFallbacks, http(alchemyHttpUrl)]
        : [http(alchemyHttpUrl), ...rpcFallbacks];
    }
  }
  return rpcFallbacks;
};

const createRainbowKitWagmiConfig = () =>
  createConfig({
    chains: enabledChains,
    connectors: wagmiConnectors(),
    ssr: true,
    client: ({ chain }) => {
      return createClient({
        chain,
        transport: fallback(buildRpcFallbacks(chain)),
        ...(chain.id !== (hardhat as Chain).id ? { pollingInterval: scaffoldConfig.pollingInterval } : {}),
      });
    },
  });

const createPrivyModeWagmiConfig = () => {
  const transports = Object.fromEntries(
    enabledChains.map(chain => [chain.id, fallback(buildRpcFallbacks(chain))]),
  ) as Record<(typeof enabledChains)[number]["id"], ReturnType<typeof fallback>>;

  return createPrivyWagmiConfig({
    chains: enabledChains,
    ssr: true,
    transports,
  });
};

export const wagmiConfig = isPrivyEnabled ? createPrivyModeWagmiConfig() : createRainbowKitWagmiConfig();
