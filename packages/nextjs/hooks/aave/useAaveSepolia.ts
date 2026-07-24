import { useCallback, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { aaveSepoliaConfig } from "~~/config/aaveSepolia";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import {
  ParseAmountError,
  WITHDRAW_ALL_AMOUNT,
  hasSufficientAllowance,
  hasSufficientBalance,
  parseTokenAmount,
} from "~~/utils/aave/amount";
import { getParsedError, notification } from "~~/utils/scaffold-eth";

export type AaveSepoliaState = {
  walletBalance: bigint;
  suppliedBalance: bigint;
  allowance: bigint;
  decimals: number;
  symbol: string;
  isCorrectNetwork: boolean;
  isConnected: boolean;
  isReading: boolean;
  isApproving: boolean;
  isSupplying: boolean;
  isWithdrawing: boolean;
  decimalsMismatch?: string;
  error?: string;
};

export type AaveSepoliaActions = {
  approve: (amount: string) => Promise<void>;
  supply: (amount: string) => Promise<void>;
  withdraw: (amount: string) => Promise<void>;
  withdrawAll: () => Promise<void>;
  refresh: () => Promise<void>;
  switchToSepolia: () => Promise<void>;
};

export type UseAaveSepoliaReturn = AaveSepoliaActions & {
  state: AaveSepoliaState;
  config: typeof aaveSepoliaConfig;
  formatAmount: (value: bigint) => string;
};

const ZERO = 0n;

function mapTxError(error: unknown, fallback: string): string {
  if (error instanceof ParseAmountError) {
    return error.message;
  }

  const message = getParsedError(error);
  const lower = message.toLowerCase();

  if (lower.includes("user rejected") || lower.includes("user denied") || lower.includes("rejected the request")) {
    return "Transaction rejected in wallet.";
  }

  return message || fallback;
}

/**
 * Reusable Aave V3 Sepolia integration hook.
 *
 * Approve and supply are separate confirmed transactions — supply never auto-runs after approve.
 */
export function useAaveSepolia(): UseAaveSepoliaReturn {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [error, setError] = useState<string | undefined>();
  const [isApproving, setIsApproving] = useState(false);
  const [isSupplying, setIsSupplying] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const isCorrectNetwork = isConnected && chainId === aaveSepoliaConfig.chainId;
  const enabled = Boolean(address) && isCorrectNetwork;

  const {
    data: walletBalance,
    isLoading: isLoadingBalance,
    refetch: refetchBalance,
  } = useScaffoldReadContract({
    contractName: "SepoliaEURS",
    functionName: "balanceOf",
    args: [address],
    query: { enabled },
  });

  const {
    data: allowance,
    isLoading: isLoadingAllowance,
    refetch: refetchAllowance,
  } = useScaffoldReadContract({
    contractName: "SepoliaEURS",
    functionName: "allowance",
    args: [address, aaveSepoliaConfig.poolAddress],
    query: { enabled },
  });

  const {
    data: onChainDecimals,
    isLoading: isLoadingDecimals,
    refetch: refetchDecimals,
  } = useScaffoldReadContract({
    contractName: "SepoliaEURS",
    functionName: "decimals",
    query: { enabled: isCorrectNetwork },
  });

  const {
    data: onChainSymbol,
    isLoading: isLoadingSymbol,
    refetch: refetchSymbol,
  } = useScaffoldReadContract({
    contractName: "SepoliaEURS",
    functionName: "symbol",
    query: { enabled: isCorrectNetwork },
  });

  const {
    data: suppliedBalance,
    isLoading: isLoadingSupplied,
    refetch: refetchSupplied,
  } = useScaffoldReadContract({
    contractName: "AaveSepoliaAToken",
    functionName: "balanceOf",
    args: [address],
    query: { enabled },
  });

  const { writeContractAsync: writeUnderlyingAsync } = useScaffoldWriteContract({
    contractName: "SepoliaEURS",
  });

  const { writeContractAsync: writePoolAsync } = useScaffoldWriteContract({
    contractName: "AaveV3Pool",
  });

  const decimals = onChainDecimals ?? aaveSepoliaConfig.asset.decimals;
  const symbol = onChainSymbol ?? aaveSepoliaConfig.asset.displaySymbol;

  const decimalsMismatch =
    onChainDecimals !== undefined && onChainDecimals !== aaveSepoliaConfig.asset.decimals
      ? `On-chain decimals (${onChainDecimals}) differ from address-book decimals (${aaveSepoliaConfig.asset.decimals}). Using on-chain value.`
      : undefined;

  const refresh = useCallback(async () => {
    await Promise.all([refetchBalance(), refetchAllowance(), refetchSupplied(), refetchDecimals(), refetchSymbol()]);
  }, [refetchAllowance, refetchBalance, refetchDecimals, refetchSupplied, refetchSymbol]);

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
      await switchChainAsync?.({ chainId: aaveSepoliaConfig.chainId });
    } catch (e) {
      const message = mapTxError(e, "Failed to switch to Sepolia.");
      setError(message);
      notification.error(message);
      throw e;
    }
  }, [switchChainAsync]);

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
          args: [aaveSepoliaConfig.poolAddress, parsed],
        });

        if (!txHash) {
          throw new Error("Approval transaction was not submitted.");
        }

        await refetchAllowance();
        notification.success(`Approved ${amount} ${symbol} for the Aave Pool.`);
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
            "Insufficient allowance. Approve the Aave Pool for this amount first (separate transaction).",
          );
        }

        const txHash = await writePoolAsync({
          functionName: "supply",
          args: [aaveSepoliaConfig.asset.underlyingAddress, parsed, user, 0],
        });

        if (!txHash) {
          throw new Error("Supply transaction was not submitted.");
        }

        await refresh();
        notification.success(`Supplied ${amount} ${symbol} to Aave.`);
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
          args: [aaveSepoliaConfig.asset.underlyingAddress, parsed, user],
        });

        if (!txHash) {
          throw new Error("Withdraw transaction was not submitted.");
        }

        await refresh();
        notification.success(`Withdrew ${amount} ${symbol} from Aave.`);
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
        args: [aaveSepoliaConfig.asset.underlyingAddress, WITHDRAW_ALL_AMOUNT, user],
      });

      if (!txHash) {
        throw new Error("Withdraw-all transaction was not submitted.");
      }

      await refresh();
      notification.success(`Withdrew full ${symbol} position from Aave.`);
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

  const state: AaveSepoliaState = useMemo(
    () => ({
      walletBalance: walletBalance ?? ZERO,
      suppliedBalance: suppliedBalance ?? ZERO,
      allowance: allowance ?? ZERO,
      decimals,
      symbol,
      isCorrectNetwork: Boolean(isCorrectNetwork),
      isConnected,
      isReading: isLoadingBalance || isLoadingAllowance || isLoadingSupplied || isLoadingDecimals || isLoadingSymbol,
      isApproving,
      isSupplying,
      isWithdrawing,
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
      isLoadingSupplied,
      isLoadingSymbol,
      isSupplying,
      isWithdrawing,
      suppliedBalance,
      symbol,
      walletBalance,
    ],
  );

  return {
    state,
    config: aaveSepoliaConfig,
    approve,
    supply,
    withdraw,
    withdrawAll,
    refresh,
    switchToSepolia,
    formatAmount,
  };
}
