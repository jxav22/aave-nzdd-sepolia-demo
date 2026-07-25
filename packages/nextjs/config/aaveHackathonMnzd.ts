import { type Address, isAddress } from "viem";
import { sepolia } from "viem/chains";
import hackathonMarket from "~~/config/hackathon-market.json";

/**
 * Custom Web3NZ hackathon Aave V3 market on Ethereum Sepolia.
 *
 * Multi-asset: dNZD, wETH, wBTC. Addresses from `hackathon-market.json`
 * (aave-v3-origin deploy / ListHackathonWethWbtc).
 *
 * dNZD is a demo NZD stable stand-in (6 decimals). It is not production NewMoney issuance.
 */

export type HackathonAssetSymbol = "dNZD" | "wETH" | "wBTC";
export type HackathonAcquisition = "ownerMint" | "wrapNative";

export type HackathonAssetConfig = {
  protocolSymbol: HackathonAssetSymbol;
  displaySymbol: HackathonAssetSymbol;
  underlyingAddress: Address;
  aTokenAddress: Address;
  variableDebtTokenAddress: Address;
  priceFeedAddress: Address;
  decimals: number;
  mintable: boolean;
  acquisition: HackathonAcquisition;
};

type RawAsset = {
  symbol: string;
  decimals: number;
  underlying: string;
  aToken: string;
  variableDebtToken: string;
  priceFeed: string;
  mintable: boolean;
  acquisition: string;
};

if (!hackathonMarket.pool || !isAddress(hackathonMarket.pool)) {
  throw new Error("hackathon-market.json: pool is missing or invalid.");
}

if (hackathonMarket.chainId !== sepolia.id) {
  throw new Error(`hackathon-market.json: expected chainId ${sepolia.id} (Sepolia), got ${hackathonMarket.chainId}.`);
}

const rawAssets = (hackathonMarket as { assets?: RawAsset[] }).assets;
if (!Array.isArray(rawAssets) || rawAssets.length === 0) {
  throw new Error("hackathon-market.json: assets[] is missing or empty.");
}

const REQUIRED_SYMBOLS: HackathonAssetSymbol[] = ["dNZD", "wETH", "wBTC"];

function parseAsset(raw: RawAsset): HackathonAssetConfig {
  if (!REQUIRED_SYMBOLS.includes(raw.symbol as HackathonAssetSymbol)) {
    throw new Error(`hackathon-market.json: unexpected asset symbol "${raw.symbol}".`);
  }
  if (!isAddress(raw.underlying) || !isAddress(raw.aToken) || !isAddress(raw.variableDebtToken)) {
    throw new Error(`hackathon-market.json: invalid addresses for ${raw.symbol}.`);
  }
  if (!isAddress(raw.priceFeed)) {
    throw new Error(`hackathon-market.json: invalid priceFeed for ${raw.symbol}.`);
  }
  if (typeof raw.decimals !== "number" || raw.decimals <= 0) {
    throw new Error(`hackathon-market.json: invalid decimals for ${raw.symbol}.`);
  }
  if (raw.acquisition !== "ownerMint" && raw.acquisition !== "wrapNative") {
    throw new Error(`hackathon-market.json: invalid acquisition for ${raw.symbol}.`);
  }

  const symbol = raw.symbol as HackathonAssetSymbol;
  return {
    protocolSymbol: symbol,
    displaySymbol: symbol,
    underlyingAddress: raw.underlying as Address,
    aTokenAddress: raw.aToken as Address,
    variableDebtTokenAddress: raw.variableDebtToken as Address,
    priceFeedAddress: raw.priceFeed as Address,
    decimals: raw.decimals,
    mintable: Boolean(raw.mintable),
    acquisition: raw.acquisition,
  };
}

const assetsList = rawAssets.map(parseAsset);
const assetsBySymbol = Object.fromEntries(assetsList.map(a => [a.protocolSymbol, a])) as Record<
  HackathonAssetSymbol,
  HackathonAssetConfig
>;

for (const symbol of REQUIRED_SYMBOLS) {
  if (!assetsBySymbol[symbol]) {
    throw new Error(`hackathon-market.json: missing required asset ${symbol}.`);
  }
}

const wrappedTokenGateway = (hackathonMarket as { wrappedTokenGateway?: string }).wrappedTokenGateway;
if (!wrappedTokenGateway || !isAddress(wrappedTokenGateway)) {
  throw new Error("hackathon-market.json: wrappedTokenGateway is missing or invalid.");
}

/** @deprecated Prefer `assets.dNZD`, kept for single-asset call sites. */
const dNZD = assetsBySymbol.dNZD;

export const aaveHackathonMnzdConfig = {
  chainId: hackathonMarket.chainId,
  marketId: hackathonMarket.marketId,
  poolAddress: hackathonMarket.pool as Address,
  poolAddressesProvider: hackathonMarket.poolAddressesProvider as Address,
  aaveOracle: hackathonMarket.aaveOracle as Address,
  protocolDataProvider: hackathonMarket.protocolDataProvider as Address,
  wrappedTokenGateway: wrappedTokenGateway as Address,
  explorerBaseUrl: sepolia.blockExplorers.default.url,
  notes: hackathonMarket.notes,
  assetSymbols: REQUIRED_SYMBOLS,
  assets: assetsBySymbol,
  assetsList,
  /** Legacy single-asset field, always dNZD. */
  asset: {
    protocolSymbol: dNZD.protocolSymbol,
    displaySymbol: dNZD.displaySymbol,
    underlyingAddress: dNZD.underlyingAddress,
    aTokenAddress: dNZD.aTokenAddress,
    variableDebtTokenAddress: dNZD.variableDebtTokenAddress,
    decimals: dNZD.decimals,
  },
} as const;

export type AaveHackathonMnzdConfig = typeof aaveHackathonMnzdConfig;

export function getHackathonAsset(symbol: HackathonAssetSymbol): HackathonAssetConfig {
  return aaveHackathonMnzdConfig.assets[symbol];
}
