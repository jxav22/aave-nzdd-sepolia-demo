"use client";

import { useMemo } from "react";
import { maxUint256 } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { type HackathonAssetSymbol, aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";
import { aTokenAbi, aaveV3PoolAbi, erc20Abi } from "~~/contracts/abis/aaveSepolia";

/**
 * The connected wallet's position across every reserve, in one batched read.
 *
 * `useAaveHackathonMnzd` covers a single asset and owns the write paths. This is the read-only
 * cross-asset view the account overview needs, so the overview does not have to instantiate the
 * action hook once per asset.
 */

export type AssetPosition = {
  symbol: HackathonAssetSymbol;
  decimals: number;
  walletBalance: bigint;
  allowance: bigint;
  deposited: bigint;
  borrowed: bigint;
};

export type UserPositions = {
  positions: Record<HackathonAssetSymbol, AssetPosition>;
  /** Aggregate figures from the pool, in the market's base currency (8 decimals). */
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  liquidationThresholdBps: bigint;
  ltvBps: bigint;
  healthFactor: bigint;
  hasAnyDeposit: boolean;
  hasAnyDebt: boolean;
  hasCollateral: boolean;
  isConnected: boolean;
  isCorrectNetwork: boolean;
  isLoading: boolean;
  refetch: () => void;
};

const ORDER: HackathonAssetSymbol[] = ["dNZD", "wETH", "wBTC"];

function emptyPosition(symbol: HackathonAssetSymbol): AssetPosition {
  return {
    symbol,
    decimals: aaveHackathonMnzdConfig.assets[symbol].decimals,
    walletBalance: 0n,
    allowance: 0n,
    deposited: 0n,
    borrowed: 0n,
  };
}

function emptyPositions(): Record<HackathonAssetSymbol, AssetPosition> {
  return {
    dNZD: emptyPosition("dNZD"),
    wETH: emptyPosition("wETH"),
    wBTC: emptyPosition("wBTC"),
  };
}

export function useUserPositions(): UserPositions {
  const { address, chainId, isConnected } = useAccount();
  const isCorrectNetwork = isConnected && chainId === aaveHackathonMnzdConfig.chainId;
  const enabled = Boolean(address) && isCorrectNetwork;

  const contracts = useMemo(() => {
    if (!address) {
      return [];
    }

    const perAsset = ORDER.flatMap(symbol => {
      const asset = aaveHackathonMnzdConfig.assets[symbol];
      return [
        {
          address: asset.underlyingAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
          chainId: aaveHackathonMnzdConfig.chainId,
        },
        {
          address: asset.underlyingAddress,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, aaveHackathonMnzdConfig.poolAddress],
          chainId: aaveHackathonMnzdConfig.chainId,
        },
        {
          address: asset.aTokenAddress,
          abi: aTokenAbi,
          functionName: "balanceOf",
          args: [address],
          chainId: aaveHackathonMnzdConfig.chainId,
        },
        {
          address: asset.variableDebtTokenAddress,
          abi: aTokenAbi,
          functionName: "balanceOf",
          args: [address],
          chainId: aaveHackathonMnzdConfig.chainId,
        },
      ] as const;
    });

    return [
      ...perAsset,
      {
        address: aaveHackathonMnzdConfig.poolAddress,
        abi: aaveV3PoolAbi,
        functionName: "getUserAccountData",
        args: [address],
        chainId: aaveHackathonMnzdConfig.chainId,
      } as const,
    ];
  }, [address]);

  const { data, isLoading, refetch } = useReadContracts({
    contracts,
    query: { enabled, refetchInterval: 30_000 },
  });

  return useMemo<UserPositions>(() => {
    const positions = emptyPositions();

    if (!data || !enabled) {
      return {
        positions,
        totalCollateralBase: 0n,
        totalDebtBase: 0n,
        availableBorrowsBase: 0n,
        liquidationThresholdBps: 0n,
        ltvBps: 0n,
        healthFactor: maxUint256,
        hasAnyDeposit: false,
        hasAnyDebt: false,
        hasCollateral: false,
        isConnected: Boolean(isConnected),
        isCorrectNetwork: Boolean(isCorrectNetwork),
        isLoading,
        refetch,
      };
    }

    ORDER.forEach((symbol, index) => {
      const offset = index * 4;
      positions[symbol] = {
        symbol,
        decimals: aaveHackathonMnzdConfig.assets[symbol].decimals,
        walletBalance: (data[offset]?.result as bigint | undefined) ?? 0n,
        allowance: (data[offset + 1]?.result as bigint | undefined) ?? 0n,
        deposited: (data[offset + 2]?.result as bigint | undefined) ?? 0n,
        borrowed: (data[offset + 3]?.result as bigint | undefined) ?? 0n,
      };
    });

    const account = data[ORDER.length * 4]?.result as readonly bigint[] | undefined;

    return {
      positions,
      totalCollateralBase: account?.[0] ?? 0n,
      totalDebtBase: account?.[1] ?? 0n,
      availableBorrowsBase: account?.[2] ?? 0n,
      liquidationThresholdBps: account?.[3] ?? 0n,
      ltvBps: account?.[4] ?? 0n,
      // No debt reports maxUint256, not zero.
      healthFactor: account?.[5] ?? maxUint256,
      hasAnyDeposit: ORDER.some(symbol => positions[symbol].deposited > 0n),
      hasAnyDebt: ORDER.some(symbol => positions[symbol].borrowed > 0n),
      hasCollateral: (account?.[0] ?? 0n) > 0n,
      isConnected: Boolean(isConnected),
      isCorrectNetwork: Boolean(isCorrectNetwork),
      isLoading,
      refetch,
    };
  }, [data, enabled, isConnected, isCorrectNetwork, isLoading, refetch]);
}
