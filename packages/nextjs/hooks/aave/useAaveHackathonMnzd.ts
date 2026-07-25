import { useCallback, useMemo, useState } from "react";
import { type Address, formatUnits, getAddress, isAddressEqual } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import {
  ParseAmountError,
  WITHDRAW_ALL_AMOUNT,
  hasSufficientAllowance,
  hasSufficientBalance,
  parseTokenAmount,
} from "~~/utils/aave/amount";
import { getParsedError, notification } from "~~/utils/scaffold-eth";

export type AaveHackathonMnzdState = {
  walletBalance: bigint;
  suppliedBalance: bigint;
  allowance: bigint;
  decimals: number;
  symbol: string;
  tokenOwner?: Address;
  isCorrectNetwork: boolean;
  isConnected: boolean;
  isReading: boolean;
  isApproving: boolean;
  isSupplying: boolean;
  isWithdrawing: boolean;
  isMinting: boolean;
  isOwner: boolean;
  decimalsMismatch?: string;
  error?: string;
};

export type AaveHackathonMnzdActions = {
  mint: (amount: string, to?: string) => Promise<void>;
  approve: (amount: string) => Promise<void>;
  supply: (amount: string) => Promise<void>;
  withdraw: (amount: string) => Promise<void>;
  withdrawAll: () => Promise<void>;
  refresh: () => Promise<void>;
  switchToSepolia: () => Promise<void>;
};

export type UseAaveHackathonMnzdReturn = AaveHackathonMnzdActions & {
  state: AaveHackathonMnzdState;
  config: typeof aaveHackathonMnzdConfig;
  formatAmount: (value: bigint) => string;
};

const ZERO = 0n;

function mapTxError(error: unknown, fallback: string): string {
  if (error instanceof ParseAmountError) {
    return error.message;
  }

  const message = getParsedError(error);
  const lower = message.toLowerCase();
  const raw = typeof error === "object" && error !== null ? JSON.stringify(error) : String(error ?? "");
  const combined = `${message}\n${raw}`.toLowerCase();

  if (lower.includes("user rejected") || lower.includes("user denied") || lower.includes("rejected the request")) {
    return "Transaction rejected in wallet.";
  }

  // OZ OwnableUnauthorizedAccount(address) — selector 0x118cdaa7
  if (
    combined.includes("ownableunauthorizedaccount") ||
    combined.includes("0x118cdaa7") ||
    combined.includes("onlyowner") ||
    combined.includes("caller is not the owner")
  ) {
    return "Only the mNZD token owner can mint. Connect the deployer wallet or ask the owner to mint for you.";
  }

  return message || fallback;
}

/**
 * Custom hackathon Aave V3 market (mNZD) integration hook.
 *
 * Mint (owner), approve, and supply are separate confirmed transactions.
 */
export function useAaveHackathonMnzd(): UseAaveHackathonMnzdReturn {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [error, setError] = useState<string | undefined>();
  const [isApproving, setIsApproving] = useState(false);
  const [isSupplying, setIsSupplying] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isMinting, setIsMinting] = useState(false);

  const isCorrectNetwork = isConnected && chainId === aaveHackathonMnzdConfig.chainId;
  const enabled = Boolean(address) && isCorrectNetwork;

  const {
    data: walletBalance,
    isLoading: isLoadingBalance,
    refetch: refetchBalance,
  } = useScaffoldReadContract({
    contractName: "HackathonMnzd",
    functionName: "balanceOf",
    args: [address],
    query: { enabled },
  });

  const {
    data: allowance,
    isLoading: isLoadingAllowance,
    refetch: refetchAllowance,
  } = useScaffoldReadContract({
    contractName: "HackathonMnzd",
    functionName: "allowance",
    args: [address, aaveHackathonMnzdConfig.poolAddress],
    query: { enabled },
  });

  const {
    data: onChainDecimals,
    isLoading: isLoadingDecimals,
    refetch: refetchDecimals,
  } = useScaffoldReadContract({
    contractName: "HackathonMnzd",
    functionName: "decimals",
    query: { enabled: isCorrectNetwork },
  });

  const {
    data: onChainSymbol,
    isLoading: isLoadingSymbol,
    refetch: refetchSymbol,
  } = useScaffoldReadContract({
    contractName: "HackathonMnzd",
    functionName: "symbol",
    query: { enabled: isCorrectNetwork },
  });

  const {
    data: tokenOwner,
    isLoading: isLoadingOwner,
    refetch: refetchOwner,
  } = useScaffoldReadContract({
    contractName: "HackathonMnzd",
    functionName: "owner",
    query: { enabled: isCorrectNetwork },
  });

  const {
    data: suppliedBalance,
    isLoading: isLoadingSupplied,
    refetch: refetchSupplied,
  } = useScaffoldReadContract({
    contractName: "HackathonAToken",
    functionName: "balanceOf",
    args: [address],
    query: { enabled },
  });

  const { writeContractAsync: writeUnderlyingAsync } = useScaffoldWriteContract({
    contractName: "HackathonMnzd",
  });

  const { writeContractAsync: writePoolAsync } = useScaffoldWriteContract({
    contractName: "HackathonPool",
  });

  const decimals = onChainDecimals ?? aaveHackathonMnzdConfig.asset.decimals;
  const symbol = onChainSymbol ?? aaveHackathonMnzdConfig.asset.displaySymbol;
  const isOwner = Boolean(address && tokenOwner && isAddressEqual(address, tokenOwner));

  const decimalsMismatch =
    onChainDecimals !== undefined && onChainDecimals !== aaveHackathonMnzdConfig.asset.decimals
      ? `On-chain decimals (${onChainDecimals}) differ from config decimals (${aaveHackathonMnzdConfig.asset.decimals}). Using on-chain value.`
      : undefined;

  const refresh = useCallback(async () => {
    await Promise.all([
      refetchBalance(),
      refetchAllowance(),
      refetchSupplied(),
      refetchDecimals(),
      refetchSymbol(),
      refetchOwner(),
    ]);
  }, [refetchAllowance, refetchBalance, refetchDecimals, refetchOwner, refetchSupplied, refetchSymbol]);

  const requireWalletAndNetwork = useCallback(() => {
    if (!isConnected || !address) {
      throw new Error("Connect a wallet to continue.");
    }
    if (!isCorrectNetwork) {
      throw new Error("Switch to Ethereum Sepolia (chain ID 11155111) to continue.");
    }
    return address;
  }, [address, isConnected, isCorrectNetwork]);

  const switchToSepolia = useCallback(async () => {
    setError(undefined);
    try {
      await switchChainAsync?.({ chainId: aaveHackathonMnzdConfig.chainId });
    } catch (e) {
      const message = mapTxError(e, "Failed to switch to Sepolia.");
      setError(message);
      notification.error(message);
      throw e;
    }
  }, [switchChainAsync]);

  const mint = useCallback(
    async (amount: string, to?: string) => {
      setError(undefined);
      setIsMinting(true);
      try {
        const caller = requireWalletAndNetwork();
        if (!isOwner) {
          throw new Error("Only the mNZD token owner can mint. Connect the deployer wallet.");
        }

        const recipient = to?.trim() ? getAddress(to.trim()) : caller;
        const parsed = parseTokenAmount(amount, decimals);

        const txHash = await writeUnderlyingAsync({
          functionName: "mint",
          args: [recipient, parsed],
        });

        if (!txHash) {
          throw new Error("Mint transaction was not submitted.");
        }

        await refetchBalance();
        notification.success(`Minted ${amount} ${symbol} to ${recipient}.`);
      } catch (e) {
        const message = mapTxError(e, "Mint failed.");
        setError(message);
        notification.error(message);
        throw e;
      } finally {
        setIsMinting(false);
      }
    },
    [decimals, isOwner, refetchBalance, requireWalletAndNetwork, symbol, writeUnderlyingAsync],
  );

  const approve = useCallback(
    async (amount: string) => {
      setError(undefined);
      setIsApproving(true);
      try {
        requireWalletAndNetwork();
        const parsed = parseTokenAmount(amount, decimals);

        if (!hasSufficientBalance(parsed, walletBalance ?? ZERO)) {
          throw new Error(`Insufficient wallet ${symbol} balance for this approval amount.`);
        }

        const txHash = await writeUnderlyingAsync({
          functionName: "approve",
          args: [aaveHackathonMnzdConfig.poolAddress, parsed],
        });

        if (!txHash) {
          throw new Error("Approval transaction was not submitted.");
        }

        await refetchAllowance();
        notification.success(`Approved ${amount} ${symbol} for the hackathon Pool.`);
      } catch (e) {
        const message = mapTxError(e, "Approval failed.");
        setError(message);
        notification.error(message);
        throw e;
      } finally {
        setIsApproving(false);
      }
    },
    [decimals, refetchAllowance, requireWalletAndNetwork, symbol, walletBalance, writeUnderlyingAsync],
  );

  const supply = useCallback(
    async (amount: string) => {
      setError(undefined);
      setIsSupplying(true);
      try {
        const user = requireWalletAndNetwork();
        const parsed = parseTokenAmount(amount, decimals);
        const balance = walletBalance ?? ZERO;
        const currentAllowance = allowance ?? ZERO;

        if (!hasSufficientBalance(parsed, balance)) {
          throw new Error(`Insufficient wallet ${symbol} balance to supply.`);
        }

        if (!hasSufficientAllowance(parsed, currentAllowance)) {
          throw new Error(
            "Insufficient allowance. Approve the hackathon Pool for this amount first (separate transaction).",
          );
        }

        const txHash = await writePoolAsync({
          functionName: "supply",
          args: [aaveHackathonMnzdConfig.asset.underlyingAddress, parsed, user, 0],
        });

        if (!txHash) {
          throw new Error("Supply transaction was not submitted.");
        }

        await refresh();
        notification.success(`Supplied ${amount} ${symbol} to the hackathon market.`);
      } catch (e) {
        const message = mapTxError(e, "Supply failed.");
        setError(message);
        notification.error(message);
        throw e;
      } finally {
        setIsSupplying(false);
      }
    },
    [allowance, decimals, refresh, requireWalletAndNetwork, symbol, walletBalance, writePoolAsync],
  );

  const withdraw = useCallback(
    async (amount: string) => {
      setError(undefined);
      setIsWithdrawing(true);
      try {
        const user = requireWalletAndNetwork();
        const parsed = parseTokenAmount(amount, decimals);
        const supplied = suppliedBalance ?? ZERO;

        if (!hasSufficientBalance(parsed, supplied)) {
          throw new Error("Insufficient supplied (aToken) balance to withdraw.");
        }

        const txHash = await writePoolAsync({
          functionName: "withdraw",
          args: [aaveHackathonMnzdConfig.asset.underlyingAddress, parsed, user],
        });

        if (!txHash) {
          throw new Error("Withdraw transaction was not submitted.");
        }

        await refresh();
        notification.success(`Withdrew ${amount} ${symbol} from the hackathon market.`);
      } catch (e) {
        const message = mapTxError(
          e,
          "Withdrawal failed. This can happen when market liquidity is unavailable or the position is constrained by debt/collateral requirements.",
        );
        setError(message);
        notification.error(message);
        throw e;
      } finally {
        setIsWithdrawing(false);
      }
    },
    [decimals, refresh, requireWalletAndNetwork, suppliedBalance, symbol, writePoolAsync],
  );

  const withdrawAll = useCallback(async () => {
    setError(undefined);
    setIsWithdrawing(true);
    try {
      const user = requireWalletAndNetwork();
      const supplied = suppliedBalance ?? ZERO;

      if (supplied <= ZERO) {
        throw new Error("No supplied balance to withdraw.");
      }

      const txHash = await writePoolAsync({
        functionName: "withdraw",
        args: [aaveHackathonMnzdConfig.asset.underlyingAddress, WITHDRAW_ALL_AMOUNT, user],
      });

      if (!txHash) {
        throw new Error("Withdraw-all transaction was not submitted.");
      }

      await refresh();
      notification.success(`Withdrew full ${symbol} position from the hackathon market.`);
    } catch (e) {
      const message = mapTxError(
        e,
        "Withdraw-all failed. This can happen when market liquidity is unavailable or the position is constrained by debt/collateral requirements.",
      );
      setError(message);
      notification.error(message);
      throw e;
    } finally {
      setIsWithdrawing(false);
    }
  }, [refresh, requireWalletAndNetwork, suppliedBalance, symbol, writePoolAsync]);

  const formatAmount = useCallback(
    (value: bigint) => {
      try {
        return formatUnits(value, decimals);
      } catch {
        return value.toString();
      }
    },
    [decimals],
  );

  const state: AaveHackathonMnzdState = useMemo(
    () => ({
      walletBalance: walletBalance ?? ZERO,
      suppliedBalance: suppliedBalance ?? ZERO,
      allowance: allowance ?? ZERO,
      decimals,
      symbol,
      tokenOwner: tokenOwner as Address | undefined,
      isCorrectNetwork: Boolean(isCorrectNetwork),
      isConnected,
      isReading:
        isLoadingBalance ||
        isLoadingAllowance ||
        isLoadingSupplied ||
        isLoadingDecimals ||
        isLoadingSymbol ||
        isLoadingOwner,
      isApproving,
      isSupplying,
      isWithdrawing,
      isMinting,
      isOwner,
      decimalsMismatch,
      error,
    }),
    [
      allowance,
      decimals,
      decimalsMismatch,
      error,
      isApproving,
      isConnected,
      isCorrectNetwork,
      isLoadingAllowance,
      isLoadingBalance,
      isLoadingDecimals,
      isLoadingOwner,
      isLoadingSupplied,
      isLoadingSymbol,
      isMinting,
      isOwner,
      isSupplying,
      isWithdrawing,
      suppliedBalance,
      symbol,
      tokenOwner,
      walletBalance,
    ],
  );

  return {
    state,
    config: aaveHackathonMnzdConfig,
    mint,
    approve,
    supply,
    withdraw,
    withdrawAll,
    refresh,
    switchToSepolia,
    formatAmount,
  };
}
