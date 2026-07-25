"use client";

import { useMemo } from "react";
import { useBlockNumber, useReadContracts } from "wagmi";
import {
  type HackathonAssetConfig,
  type HackathonAssetSymbol,
  aaveHackathonMnzdConfig,
} from "~~/config/aaveHackathonMnzd";
import { aaveOracleAbi, protocolDataProviderAbi } from "~~/contracts/abis/aaveSepolia";
import { bpsToPercent, rayAprToApyPercent, utilisationPercent } from "~~/utils/aave/rates";

/**
 * Aggregate market state for all three reserves: rates, sizes, liquidity and configuration.
 *
 * One multicall per refresh via wagmi's batching. This is the market-wide counterpart to
 * `useAaveHackathonMnzd`, which covers a single asset from the connected wallet's point of view.
 */

export type ReserveSummary = {
  symbol: HackathonAssetSymbol;
  name: string;
  config: HackathonAssetConfig;
  decimals: number;

  /** Oracle price in the market's base currency (8 decimals). */
  oraclePrice: bigint;
  /** Fixed NZD mock / settable aggregator, or a live Chainlink feed. */
  priceFeedKind: "chainlink" | "mock";
  priceFeedDescription: string;

  totalSupplied: bigint;
  totalBorrowed: bigint;
  /** Deposited minus borrowed, what can actually be borrowed or withdrawn right now. */
  availableLiquidity: bigint;

  supplyApyPercent: number;
  borrowApyPercent: number;
  utilisationPercent: number;

  maxLtvPercent: number;
  liquidationThresholdPercent: number;
  liquidationBonusPercent: number;
  reserveFactorPercent: number;
  supplyCap: bigint;
  borrowCap: bigint;

  canBeCollateral: boolean;
  borrowingEnabled: boolean;
  isActive: boolean;
  isFrozen: boolean;
};

export type HackathonMarketData = {
  reserves: ReserveSummary[];
  bySymbol: Record<HackathonAssetSymbol, ReserveSummary | undefined>;
  blockNumber?: bigint;
  isLoading: boolean;
  error?: Error;
  refetch: () => void;
};

const ASSET_NAMES: Record<HackathonAssetSymbol, string> = {
  dNZD: "New Zealand Dollar",
  wETH: "Ether",
  wBTC: "Bitcoin",
};

/**
 * Feeds are identified by address, not guessed. `hackathon-market.json` records the
 * aggregator each reserve was listed with. All three are NZD-denominated mocks;
 * wETH/wBTC use SettableAggregators so demos can shock prices.
 */
const PRICE_FEEDS: Record<HackathonAssetSymbol, { kind: "chainlink" | "mock"; description: string }> = {
  dNZD: { kind: "mock", description: "Fixed NZ$1.00" },
  wETH: { kind: "mock", description: "Fixed NZ$3,090 (settable)" },
  wBTC: { kind: "mock", description: "Fixed NZ$106,526 (settable)" },
};

const ORDER: HackathonAssetSymbol[] = ["dNZD", "wETH", "wBTC"];

export function useHackathonMarket(): HackathonMarketData {
  const { data: blockNumber } = useBlockNumber({
    chainId: aaveHackathonMnzdConfig.chainId,
    watch: false,
  });

  const contracts = useMemo(() => {
    const dataProvider = {
      address: aaveHackathonMnzdConfig.protocolDataProvider,
      abi: protocolDataProviderAbi,
    } as const;
    const oracle = {
      address: aaveHackathonMnzdConfig.aaveOracle,
      abi: aaveOracleAbi,
    } as const;

    return ORDER.flatMap(symbol => {
      const asset = aaveHackathonMnzdConfig.assets[symbol];
      return [
        {
          ...dataProvider,
          functionName: "getReserveData",
          args: [asset.underlyingAddress],
          chainId: aaveHackathonMnzdConfig.chainId,
        },
        {
          ...dataProvider,
          functionName: "getReserveConfigurationData",
          args: [asset.underlyingAddress],
          chainId: aaveHackathonMnzdConfig.chainId,
        },
        {
          ...dataProvider,
          functionName: "getReserveCaps",
          args: [asset.underlyingAddress],
          chainId: aaveHackathonMnzdConfig.chainId,
        },
        {
          ...oracle,
          functionName: "getAssetPrice",
          args: [asset.underlyingAddress],
          chainId: aaveHackathonMnzdConfig.chainId,
        },
      ] as const;
    });
  }, []);

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts,
    query: { refetchInterval: 30_000 },
  });

  const reserves = useMemo<ReserveSummary[]>(() => {
    if (!data) {
      return [];
    }

    return ORDER.flatMap((symbol, index): ReserveSummary[] => {
      const offset = index * 4;
      const reserveData = data[offset]?.result as readonly bigint[] | undefined;
      const configData = data[offset + 1]?.result as readonly (bigint | boolean)[] | undefined;
      const caps = data[offset + 2]?.result as readonly bigint[] | undefined;
      const price = data[offset + 3]?.result as bigint | undefined;

      if (!reserveData || !configData) {
        return [];
      }

      const asset = aaveHackathonMnzdConfig.assets[symbol];
      const totalSupplied = reserveData[2] ?? 0n;
      const totalBorrowed = reserveData[4] ?? 0n;
      const feed = PRICE_FEEDS[symbol];

      return [
        {
          symbol,
          name: ASSET_NAMES[symbol],
          config: asset,
          decimals: Number(configData[0] ?? BigInt(asset.decimals)),

          oraclePrice: price ?? 0n,
          priceFeedKind: feed.kind,
          priceFeedDescription: feed.description,

          totalSupplied,
          totalBorrowed,
          availableLiquidity: totalSupplied > totalBorrowed ? totalSupplied - totalBorrowed : 0n,

          supplyApyPercent: rayAprToApyPercent(reserveData[5]),
          borrowApyPercent: rayAprToApyPercent(reserveData[6]),
          utilisationPercent: utilisationPercent(totalSupplied, totalBorrowed),

          maxLtvPercent: bpsToPercent(configData[1] as bigint),
          liquidationThresholdPercent: bpsToPercent(configData[2] as bigint),
          // Aave stores the bonus as 10500 = a 5% bonus.
          liquidationBonusPercent: Math.max(0, bpsToPercent(configData[3] as bigint) - 100),
          reserveFactorPercent: bpsToPercent(configData[4] as bigint),
          supplyCap: caps?.[1] ?? 0n,
          borrowCap: caps?.[0] ?? 0n,

          canBeCollateral: Boolean(configData[5]),
          borrowingEnabled: Boolean(configData[6]),
          isActive: Boolean(configData[8]),
          isFrozen: Boolean(configData[9]),
        },
      ];
    });
  }, [data]);

  const bySymbol = useMemo(() => {
    const map = {} as Record<HackathonAssetSymbol, ReserveSummary | undefined>;
    for (const symbol of ORDER) {
      map[symbol] = reserves.find(r => r.symbol === symbol);
    }
    return map;
  }, [reserves]);

  return {
    reserves,
    bySymbol,
    blockNumber,
    isLoading,
    error: error ?? undefined,
    refetch,
  };
}
