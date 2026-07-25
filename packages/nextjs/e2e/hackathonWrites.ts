import type { Account, Address, Hash, PublicClient, WalletClient } from "viem";
import { parseEther } from "viem";
import { type HackathonAssetSymbol, aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";
import { aaveV3PoolAbi, mintableErc20Abi, wrappedTokenGatewayAbi } from "~~/contracts/abis/aaveSepolia";
import { getAsset, readATokenBalance, readVariableDebt } from "~~/e2e/hackathonReads";
import { writeAndWait } from "~~/e2e/viemClients";
import { REPAY_ALL_AMOUNT, WITHDRAW_ALL_AMOUNT, parseTokenAmount } from "~~/utils/aave/amount";
import { VARIABLE_INTEREST_RATE_MODE } from "~~/utils/aave/errors";

type WriteCtx = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Account;
  user: Address;
};

export type { WriteCtx };

export function toWriteCtx(clients: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Account;
  address: Address;
}): WriteCtx {
  return {
    publicClient: clients.publicClient,
    walletClient: clients.walletClient,
    account: clients.account,
    user: clients.address,
  };
}

/** Extra dNZD minted before repay so wallet balance covers accrued interest dust. */
export const REPAY_INTEREST_BUFFER = "1";

async function write(
  ctx: WriteCtx,
  params: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
  },
): Promise<Hash> {
  return writeAndWait({
    publicClient: ctx.publicClient,
    walletClient: ctx.walletClient,
    account: ctx.account,
    address: params.address,
    abi: params.abi,
    functionName: params.functionName,
    args: params.args,
    value: params.value,
  });
}

export async function mintDnzd(ctx: WriteCtx, humanAmount: string): Promise<Hash> {
  const asset = getAsset("dNZD");
  const amount = parseTokenAmount(humanAmount, asset.decimals);
  return write(ctx, {
    address: asset.underlyingAddress,
    abi: mintableErc20Abi,
    functionName: "mint",
    args: [ctx.user, amount],
  });
}

export async function approveUnderlying(
  ctx: WriteCtx,
  symbol: HackathonAssetSymbol,
  humanAmount: string,
): Promise<Hash> {
  const asset = getAsset(symbol);
  const amount = parseTokenAmount(humanAmount, asset.decimals);
  return write(ctx, {
    address: asset.underlyingAddress,
    abi: mintableErc20Abi,
    functionName: "approve",
    args: [aaveHackathonMnzdConfig.poolAddress, amount],
  });
}

export async function approveUnderlyingRaw(ctx: WriteCtx, symbol: HackathonAssetSymbol, amount: bigint): Promise<Hash> {
  const asset = getAsset(symbol);
  return write(ctx, {
    address: asset.underlyingAddress,
    abi: mintableErc20Abi,
    functionName: "approve",
    args: [aaveHackathonMnzdConfig.poolAddress, amount],
  });
}

export async function supply(ctx: WriteCtx, symbol: HackathonAssetSymbol, humanAmount: string): Promise<Hash> {
  const asset = getAsset(symbol);
  const amount = parseTokenAmount(humanAmount, asset.decimals);
  return write(ctx, {
    address: aaveHackathonMnzdConfig.poolAddress,
    abi: aaveV3PoolAbi,
    functionName: "supply",
    args: [asset.underlyingAddress, amount, ctx.user, 0],
  });
}

export async function withdraw(ctx: WriteCtx, symbol: HackathonAssetSymbol, amount: bigint): Promise<Hash> {
  const asset = getAsset(symbol);
  return write(ctx, {
    address: aaveHackathonMnzdConfig.poolAddress,
    abi: aaveV3PoolAbi,
    functionName: "withdraw",
    args: [asset.underlyingAddress, amount, ctx.user],
  });
}

export async function withdrawAll(ctx: WriteCtx, symbol: HackathonAssetSymbol): Promise<Hash> {
  return withdraw(ctx, symbol, WITHDRAW_ALL_AMOUNT);
}

export async function borrow(ctx: WriteCtx, symbol: HackathonAssetSymbol, humanAmount: string): Promise<Hash> {
  const asset = getAsset(symbol);
  const amount = parseTokenAmount(humanAmount, asset.decimals);
  return write(ctx, {
    address: aaveHackathonMnzdConfig.poolAddress,
    abi: aaveV3PoolAbi,
    functionName: "borrow",
    args: [asset.underlyingAddress, amount, VARIABLE_INTEREST_RATE_MODE, 0, ctx.user],
  });
}

export async function repay(ctx: WriteCtx, symbol: HackathonAssetSymbol, amount: bigint): Promise<Hash> {
  const asset = getAsset(symbol);
  return write(ctx, {
    address: aaveHackathonMnzdConfig.poolAddress,
    abi: aaveV3PoolAbi,
    functionName: "repay",
    args: [asset.underlyingAddress, amount, VARIABLE_INTEREST_RATE_MODE, ctx.user],
  });
}

export async function repayAll(ctx: WriteCtx, symbol: HackathonAssetSymbol): Promise<Hash> {
  return repay(ctx, symbol, REPAY_ALL_AMOUNT);
}

/**
 * Ensure wallet can cover debt + interest, approve, then repay maxUint256.
 * Mints a small dNZD buffer when symbol is dNZD (owner-only).
 */
export async function repayAllWithBuffer(ctx: WriteCtx, symbol: HackathonAssetSymbol): Promise<Hash | undefined> {
  const debt = await readVariableDebt(ctx.publicClient, symbol, ctx.user);
  if (debt === 0n) {
    return undefined;
  }

  if (symbol === "dNZD") {
    await mintDnzd(ctx, REPAY_INTEREST_BUFFER);
  }

  const buffer = debt + debt / 50n + parseTokenAmount(REPAY_INTEREST_BUFFER, getAsset(symbol).decimals);
  await approveUnderlyingRaw(ctx, symbol, buffer);
  return repayAll(ctx, symbol);
}

/** Gateway: wrap + supply ETH in one tx (mirrors useAaveHackathonMnzd.supplyEth). */
export async function supplyEth(ctx: WriteCtx, amountEth: string): Promise<Hash> {
  const value = parseEther(amountEth);
  return write(ctx, {
    address: aaveHackathonMnzdConfig.wrappedTokenGateway,
    abi: wrappedTokenGatewayAbi,
    functionName: "depositETH",
    args: [aaveHackathonMnzdConfig.poolAddress, ctx.user, 0],
    value,
  });
}

/**
 * Best-effort cleanup so a failed mid-run does not leave debt / aTokens stuck.
 * Swallows errors — callers should still assert happy-path cleanup.
 */
export async function bestEffortCleanup(ctx: WriteCtx, symbols: HackathonAssetSymbol[]): Promise<void> {
  for (const symbol of symbols) {
    try {
      await repayAllWithBuffer(ctx, symbol);
    } catch {
      // ignore
    }
  }

  for (const symbol of symbols) {
    try {
      const supplied = await readATokenBalance(ctx.publicClient, symbol, ctx.user);
      if (supplied > 0n) {
        await withdrawAll(ctx, symbol);
      }
    } catch {
      // ignore
    }
  }
}
