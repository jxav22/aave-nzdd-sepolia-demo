import { type Address, isAddress } from "viem";
import { sepolia } from "viem/chains";
import hackathonMarket from "~~/config/hackathon-market.json";

/**
 * Custom Web3NZ hackathon Aave V3 market (mNZD) on Ethereum Sepolia.
 *
 * Addresses come from `hackathon-market.json`, produced by the aave-v3-origin deploy.
 * Refresh that JSON after redeploying the market — do not use official Aave Sepolia EURS/USDC.
 *
 * mNZD is a Mock NZD Stable stand-in (6 decimals). It is not real NZDD / dNZD / zNZD.
 */

if (!hackathonMarket.pool || !isAddress(hackathonMarket.pool)) {
  throw new Error("hackathon-market.json: pool is missing or invalid.");
}

if (!hackathonMarket.underlying?.address || !isAddress(hackathonMarket.underlying.address)) {
  throw new Error("hackathon-market.json: underlying.address is missing or invalid.");
}

if (!hackathonMarket.aToken || !isAddress(hackathonMarket.aToken)) {
  throw new Error("hackathon-market.json: aToken is missing or invalid.");
}

if (!hackathonMarket.variableDebtToken || !isAddress(hackathonMarket.variableDebtToken)) {
  throw new Error("hackathon-market.json: variableDebtToken is missing or invalid.");
}

if (typeof hackathonMarket.underlying.decimals !== "number" || hackathonMarket.underlying.decimals <= 0) {
  throw new Error("hackathon-market.json: underlying.decimals is missing or invalid.");
}

if (hackathonMarket.chainId !== sepolia.id) {
  throw new Error(`hackathon-market.json: expected chainId ${sepolia.id} (Sepolia), got ${hackathonMarket.chainId}.`);
}

if (hackathonMarket.underlying.symbol !== "mNZD") {
  throw new Error(
    `hackathon-market.json: expected underlying.symbol "mNZD", got "${hackathonMarket.underlying.symbol}".`,
  );
}

export const aaveHackathonMnzdConfig = {
  chainId: hackathonMarket.chainId,
  marketId: hackathonMarket.marketId,
  poolAddress: hackathonMarket.pool as Address,
  poolAddressesProvider: hackathonMarket.poolAddressesProvider as Address,
  aaveOracle: hackathonMarket.aaveOracle as Address,
  protocolDataProvider: hackathonMarket.protocolDataProvider as Address,
  explorerBaseUrl: sepolia.blockExplorers.default.url,
  notes: hackathonMarket.notes,
  asset: {
    protocolSymbol: "mNZD" as const,
    displaySymbol: "mNZD" as const,
    underlyingAddress: hackathonMarket.underlying.address as Address,
    aTokenAddress: hackathonMarket.aToken as Address,
    variableDebtTokenAddress: hackathonMarket.variableDebtToken as Address,
    decimals: hackathonMarket.underlying.decimals,
  },
} as const;

export type AaveHackathonMnzdConfig = typeof aaveHackathonMnzdConfig;
