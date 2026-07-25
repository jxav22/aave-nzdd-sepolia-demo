import type { Address, PublicClient } from "viem";
import { type HackathonAssetSymbol, aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";
import { aTokenAbi, aaveV3PoolAbi, erc20Abi, mintableErc20Abi } from "~~/contracts/abis/aaveSepolia";

export type UserAccountData = {
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  currentLiquidationThreshold: bigint;
  ltv: bigint;
  healthFactor: bigint;
};

export function getAsset(symbol: HackathonAssetSymbol) {
  return aaveHackathonMnzdConfig.assets[symbol];
}

export async function readErc20Balance(publicClient: PublicClient, token: Address, account: Address): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
}

export async function readAllowance(
  publicClient: PublicClient,
  token: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
}

export async function readATokenBalance(
  publicClient: PublicClient,
  symbol: HackathonAssetSymbol,
  account: Address,
): Promise<bigint> {
  const asset = getAsset(symbol);
  return publicClient.readContract({
    address: asset.aTokenAddress,
    abi: aTokenAbi,
    functionName: "balanceOf",
    args: [account],
  });
}

export async function readVariableDebt(
  publicClient: PublicClient,
  symbol: HackathonAssetSymbol,
  account: Address,
): Promise<bigint> {
  const asset = getAsset(symbol);
  return publicClient.readContract({
    address: asset.variableDebtTokenAddress,
    abi: aTokenAbi,
    functionName: "balanceOf",
    args: [account],
  });
}

export async function readTokenOwner(publicClient: PublicClient, token: Address): Promise<Address> {
  return publicClient.readContract({
    address: token,
    abi: mintableErc20Abi,
    functionName: "owner",
  });
}

export async function readUserAccountData(publicClient: PublicClient, user: Address): Promise<UserAccountData> {
  const [totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor] =
    await publicClient.readContract({
      address: aaveHackathonMnzdConfig.poolAddress,
      abi: aaveV3PoolAbi,
      functionName: "getUserAccountData",
      args: [user],
    });

  return {
    totalCollateralBase,
    totalDebtBase,
    availableBorrowsBase,
    currentLiquidationThreshold,
    ltv,
    healthFactor,
  };
}
