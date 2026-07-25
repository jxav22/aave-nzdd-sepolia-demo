import { useCallback, useEffect, useMemo, useState } from "react";
import { type Address, formatUnits, getAddress, isAddressEqual, maxUint256 } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { type HackathonAssetSymbol, aaveHackathonMnzdConfig, getHackathonAsset } from "~~/config/aaveHackathonMnzd";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import {
  REPAY_ALL_AMOUNT,
  WITHDRAW_ALL_AMOUNT,
  hasSufficientAllowance,
  hasSufficientBalance,
  parseTokenAmount,
} from "~~/utils/aave/amount";
import { VARIABLE_INTEREST_RATE_MODE, mapAaveTxError } from "~~/utils/aave/errors";
import { notification } from "~~/utils/scaffold-eth";
import type { ContractName } from "~~/utils/scaffold-eth/contract";

type UnderlyingContract = "HackathonMnzd" | "HackathonWeth" | "HackathonWbtc";
type ATokenContract = "HackathonATokenMnzd" | "HackathonATokenWeth" | "HackathonATokenWbtc";
type DebtContract = "HackathonDebtMnzd" | "HackathonDebtWeth" | "HackathonDebtWbtc";

const UNDERLYING_CONTRACT: Record<HackathonAssetSymbol, UnderlyingContract> = {
  dNZD: "HackathonMnzd",
  wETH: "HackathonWeth",
  wBTC: "HackathonWbtc",
};

const ATOKEN_CONTRACT: Record<HackathonAssetSymbol, ATokenContract> = {
  dNZD: "HackathonATokenMnzd",
  wETH: "HackathonATokenWeth",
  wBTC: "HackathonATokenWbtc",
};

const DEBT_CONTRACT: Record<HackathonAssetSymbol, DebtContract> = {
  dNZD: "HackathonDebtMnzd",
  wETH: "HackathonDebtWeth",
  wBTC: "HackathonDebtWbtc",
};

export type AaveHackathonMnzdState = {
  selectedAsset: HackathonAssetSymbol;
  walletBalance: bigint;
  suppliedBalance: bigint;
  borrowedBalance: bigint;
  allowance: bigint;
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  ltv: bigint;
  healthFactor: bigint;
  decimals: number;
  symbol: string;
  tokenOwner?: Address;
  isCorrectNetwork: boolean;
  isConnected: boolean;
  isReading: boolean;
  isApproving: boolean;
  isSupplying: boolean;
  isWithdrawing: boolean;
  isBorrowing: boolean;
  isRepaying: boolean;
  isMinting: boolean;
  isWrapping: boolean;
  isOwner: boolean;
  canMint: boolean;
  canWrap: boolean;
  decimalsMismatch?: string;
  error?: string;
};

export type AaveHackathonMnzdActions = {
  mint: (amount: string, to?: string) => Promise<void>;
  wrapEth: (amountEth: string) => Promise<void>;
  supplyEth: (amountEth: string) => Promise<void>;
  approve: (amount: string) => Promise<void>;
  supply: (amount: string) => Promise<void>;
  withdraw: (amount: string) => Promise<void>;
  withdrawAll: () => Promise<void>;
  borrow: (amount: string) => Promise<void>;
  repay: (amount: string) => Promise<void>;
  repayAll: () => Promise<void>;
  refresh: () => Promise<void>;
  switchToSepolia: () => Promise<void>;
};

export type UseAaveHackathonMnzdReturn = AaveHackathonMnzdActions & {
  state: AaveHackathonMnzdState;
  config: typeof aaveHackathonMnzdConfig;
  selectedAssetConfig: ReturnType<typeof getHackathonAsset>;
  formatAmount: (value: bigint) => string;
};

const ZERO = 0n;

const OWNABLE_MINT_HINT =
  "Only the token owner can mint. Connect the deployer wallet or ask the owner to mint for you.";

function mapTxError(error: unknown, fallback: string): string {
  return mapAaveTxError(error, fallback, { ownableMintHint: OWNABLE_MINT_HINT });
}

/**
 * Custom hackathon Aave V3 multi-asset market (dNZD / wETH / wBTC).
 *
 * Mint (owner), wrap ETH, approve, supply, and repay are separate confirmed transactions.
 */
export function useAaveHackathonMnzd(selectedAsset: HackathonAssetSymbol = "wETH"): UseAaveHackathonMnzdReturn {
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const assetConfig = getHackathonAsset(selectedAsset);

  const [error, setError] = useState<string | undefined>();
  const [isApproving, setIsApproving] = useState(false);
  const [isSupplying, setIsSupplying] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isBorrowing, setIsBorrowing] = useState(false);
  const [isRepaying, setIsRepaying] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [isWrapping, setIsWrapping] = useState(false);

  useEffect(() => {
    setError(undefined);
  }, [selectedAsset]);

  const isCorrectNetwork = isConnected && chainId === aaveHackathonMnzdConfig.chainId;
  const enabled = Boolean(address) && isCorrectNetwork;

  const underlyingName = UNDERLYING_CONTRACT[selectedAsset] as ContractName;
  const aTokenName = ATOKEN_CONTRACT[selectedAsset] as ContractName;
  const debtName = DEBT_CONTRACT[selectedAsset] as ContractName;

  const {
    data: walletBalance,
    isLoading: isLoadingBalance,
    refetch: refetchBalance,
  } = useScaffoldReadContract({
    contractName: underlyingName,
    functionName: "balanceOf",
    args: [address],
    query: { enabled },
  });

  const {
    data: allowance,
    isLoading: isLoadingAllowance,
    refetch: refetchAllowance,
  } = useScaffoldReadContract({
    contractName: underlyingName,
    functionName: "allowance",
    args: [address, aaveHackathonMnzdConfig.poolAddress],
    query: { enabled },
  });

  const {
    data: onChainDecimals,
    isLoading: isLoadingDecimals,
    refetch: refetchDecimals,
  } = useScaffoldReadContract({
    contractName: underlyingName,
    functionName: "decimals",
    query: { enabled: isCorrectNetwork },
  });

  const { isLoading: isLoadingSymbol, refetch: refetchSymbol } = useScaffoldReadContract({
    contractName: underlyingName,
    functionName: "symbol",
    query: { enabled: isCorrectNetwork },
  });

  const {
    data: tokenOwner,
    isLoading: isLoadingOwner,
    refetch: refetchOwner,
  } = useScaffoldReadContract({
    contractName: underlyingName,
    functionName: "owner",
    query: { enabled: isCorrectNetwork && assetConfig.mintable },
  });

  const {
    data: suppliedBalance,
    isLoading: isLoadingSupplied,
    refetch: refetchSupplied,
  } = useScaffoldReadContract({
    contractName: aTokenName,
    functionName: "balanceOf",
    args: [address],
    query: { enabled },
  });

  const {
    data: borrowedBalance,
    isLoading: isLoadingBorrowed,
    refetch: refetchBorrowed,
  } = useScaffoldReadContract({
    contractName: debtName,
    functionName: "balanceOf",
    args: [address],
    query: { enabled },
  });

  const {
    data: accountData,
    isLoading: isLoadingAccount,
    refetch: refetchAccount,
  } = useScaffoldReadContract({
    contractName: "HackathonPool",
    functionName: "getUserAccountData",
    args: [address],
    query: { enabled },
  });

  const { writeContractAsync: writeMnzdAsync } = useScaffoldWriteContract({
    contractName: "HackathonMnzd",
  });
  const { writeContractAsync: writeWethAsync } = useScaffoldWriteContract({
    contractName: "HackathonWeth",
  });
  const { writeContractAsync: writeWbtcAsync } = useScaffoldWriteContract({
    contractName: "HackathonWbtc",
  });
  const { writeContractAsync: writePoolAsync } = useScaffoldWriteContract({
    contractName: "HackathonPool",
  });
  const { writeContractAsync: writeGatewayAsync } = useScaffoldWriteContract({
    contractName: "HackathonWrappedTokenGateway",
  });

  const decimals = (onChainDecimals as number | undefined) ?? assetConfig.decimals;
  // Prefer config display names over legacy on-chain symbols from the live Sepolia deploy.
  const symbol = assetConfig.displaySymbol;
  const isOwner = Boolean(
    assetConfig.mintable && address && tokenOwner && isAddressEqual(address, tokenOwner as Address),
  );
  const canMint = assetConfig.mintable;
  const canWrap = assetConfig.acquisition === "wrapNative";

  const decimalsMismatch =
    onChainDecimals !== undefined && Number(onChainDecimals) !== assetConfig.decimals
      ? `On-chain decimals (${onChainDecimals}) differ from config decimals (${assetConfig.decimals}). Using on-chain value.`
      : undefined;

  const writeUnderlying = useCallback(
    async (args: { functionName: string; args?: readonly unknown[]; value?: bigint }) => {
      // Dynamic asset → contract; cast through unknown for Scaffold write typing.
      if (selectedAsset === "dNZD") {
        return writeMnzdAsync(args as unknown as Parameters<typeof writeMnzdAsync>[0]);
      }
      if (selectedAsset === "wETH") {
        return writeWethAsync(args as unknown as Parameters<typeof writeWethAsync>[0]);
      }
      return writeWbtcAsync(args as unknown as Parameters<typeof writeWbtcAsync>[0]);
    },
    [selectedAsset, writeMnzdAsync, writeWbtcAsync, writeWethAsync],
  );

  const refresh = useCallback(async () => {
    await Promise.all([
      refetchBalance(),
      refetchAllowance(),
      refetchSupplied(),
      refetchBorrowed(),
      refetchAccount(),
      refetchDecimals(),
      refetchSymbol(),
      assetConfig.mintable ? refetchOwner() : Promise.resolve(),
    ]);
  }, [
    assetConfig.mintable,
    refetchAccount,
    refetchAllowance,
    refetchBalance,
    refetchBorrowed,
    refetchDecimals,
    refetchOwner,
    refetchSupplied,
    refetchSymbol,
  ]);

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
        if (!canMint) {
          throw new Error(`${symbol} is not mintable. Wrap Sepolia ETH to get wETH.`);
        }
        if (!isOwner) {
          throw new Error(`Only the ${symbol} token owner can mint. Connect the deployer wallet.`);
        }

        const recipient = to?.trim() ? getAddress(to.trim()) : caller;
        const parsed = parseTokenAmount(amount, decimals);

        const txHash = await writeUnderlying({
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
    [canMint, decimals, isOwner, refetchBalance, requireWalletAndNetwork, symbol, writeUnderlying],
  );

  const wrapEth = useCallback(
    async (amountEth: string) => {
      setError(undefined);
      setIsWrapping(true);
      try {
        requireWalletAndNetwork();
        if (!canWrap) {
          throw new Error("Wrap ETH is only available for wETH.");
        }
        const value = parseTokenAmount(amountEth, 18);
        if (value <= ZERO) {
          throw new Error("Enter a positive ETH amount to wrap.");
        }

        const txHash = await writeWethAsync({
          functionName: "deposit",
          value,
        });

        if (!txHash) {
          throw new Error("Wrap transaction was not submitted.");
        }

        await refetchBalance();
        notification.success(`Wrapped ${amountEth} ETH to wETH.`);
      } catch (e) {
        const message = mapTxError(e, "Wrap ETH failed.");
        setError(message);
        notification.error(message);
        throw e;
      } finally {
        setIsWrapping(false);
      }
    },
    [canWrap, refetchBalance, requireWalletAndNetwork, writeWethAsync],
  );

  const supplyEth = useCallback(
    async (amountEth: string) => {
      setError(undefined);
      setIsSupplying(true);
      try {
        const user = requireWalletAndNetwork();
        if (!canWrap) {
          throw new Error("Supply ETH is only available on the wETH reserve.");
        }
        const value = parseTokenAmount(amountEth, 18);
        if (value <= ZERO) {
          throw new Error("Enter a positive ETH amount to supply.");
        }

        const txHash = await writeGatewayAsync({
          functionName: "depositETH",
          args: [aaveHackathonMnzdConfig.poolAddress, user, 0],
          value,
        });

        if (!txHash) {
          throw new Error("Supply ETH transaction was not submitted.");
        }

        await refresh();
        notification.success(`Supplied ${amountEth} ETH via WrappedTokenGateway.`);
      } catch (e) {
        const message = mapTxError(e, "Supply ETH failed.");
        setError(message);
        notification.error(message);
        throw e;
      } finally {
        setIsSupplying(false);
      }
    },
    [canWrap, refresh, requireWalletAndNetwork, writeGatewayAsync],
  );

  const approve = useCallback(
    async (amount: string) => {
      setError(undefined);
      setIsApproving(true);
      try {
        requireWalletAndNetwork();
        const parsed = parseTokenAmount(amount, decimals);

        if (!hasSufficientBalance(parsed, (walletBalance as bigint | undefined) ?? ZERO)) {
          throw new Error(`Insufficient wallet ${symbol} balance for this approval amount.`);
        }

        const txHash = await writeUnderlying({
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
    [decimals, refetchAllowance, requireWalletAndNetwork, symbol, walletBalance, writeUnderlying],
  );

  const supply = useCallback(
    async (amount: string) => {
      setError(undefined);
      setIsSupplying(true);
      try {
        const user = requireWalletAndNetwork();
        const parsed = parseTokenAmount(amount, decimals);
        const balance = (walletBalance as bigint | undefined) ?? ZERO;
        const currentAllowance = (allowance as bigint | undefined) ?? ZERO;

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
          args: [assetConfig.underlyingAddress, parsed, user, 0],
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
    [
      allowance,
      assetConfig.underlyingAddress,
      decimals,
      refresh,
      requireWalletAndNetwork,
      symbol,
      walletBalance,
      writePoolAsync,
    ],
  );

  const withdraw = useCallback(
    async (amount: string) => {
      setError(undefined);
      setIsWithdrawing(true);
      try {
        const user = requireWalletAndNetwork();
        const parsed = parseTokenAmount(amount, decimals);
        const supplied = (suppliedBalance as bigint | undefined) ?? ZERO;

        if (!hasSufficientBalance(parsed, supplied)) {
          throw new Error("Insufficient supplied (aToken) balance to withdraw.");
        }

        const txHash = await writePoolAsync({
          functionName: "withdraw",
          args: [assetConfig.underlyingAddress, parsed, user],
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
    [
      assetConfig.underlyingAddress,
      decimals,
      refresh,
      requireWalletAndNetwork,
      suppliedBalance,
      symbol,
      writePoolAsync,
    ],
  );

  const withdrawAll = useCallback(async () => {
    setError(undefined);
    setIsWithdrawing(true);
    try {
      const user = requireWalletAndNetwork();
      const supplied = (suppliedBalance as bigint | undefined) ?? ZERO;

      if (supplied <= ZERO) {
        throw new Error("No supplied balance to withdraw.");
      }

      const txHash = await writePoolAsync({
        functionName: "withdraw",
        args: [assetConfig.underlyingAddress, WITHDRAW_ALL_AMOUNT, user],
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
  }, [assetConfig.underlyingAddress, refresh, requireWalletAndNetwork, suppliedBalance, symbol, writePoolAsync]);

  const borrow = useCallback(
    async (amount: string) => {
      setError(undefined);
      setIsBorrowing(true);
      try {
        const user = requireWalletAndNetwork();
        const parsed = parseTokenAmount(amount, decimals);

        const txHash = await writePoolAsync({
          functionName: "borrow",
          args: [assetConfig.underlyingAddress, parsed, VARIABLE_INTEREST_RATE_MODE, 0, user],
        });

        if (!txHash) {
          throw new Error("Borrow transaction was not submitted.");
        }

        await refresh();
        notification.success(`Borrowed ${amount} ${symbol} from the hackathon market.`);
      } catch (e) {
        const message = mapTxError(
          e,
          "Borrow failed. Supply collateral first, keep health factor above 1, and ensure the reserve has liquidity.",
        );
        setError(message);
        notification.error(message);
        throw e;
      } finally {
        setIsBorrowing(false);
      }
    },
    [assetConfig.underlyingAddress, decimals, refresh, requireWalletAndNetwork, symbol, writePoolAsync],
  );

  const repay = useCallback(
    async (amount: string) => {
      setError(undefined);
      setIsRepaying(true);
      try {
        const user = requireWalletAndNetwork();
        const parsed = parseTokenAmount(amount, decimals);
        const debt = (borrowedBalance as bigint | undefined) ?? ZERO;
        const balance = (walletBalance as bigint | undefined) ?? ZERO;
        const currentAllowance = (allowance as bigint | undefined) ?? ZERO;

        if (debt <= ZERO) {
          throw new Error("No outstanding debt to repay.");
        }

        if (!hasSufficientBalance(parsed, balance)) {
          throw new Error(`Insufficient wallet ${symbol} balance to repay.`);
        }

        if (!hasSufficientAllowance(parsed, currentAllowance)) {
          throw new Error(
            "Insufficient allowance. Approve the hackathon Pool for this amount first (separate transaction).",
          );
        }

        const txHash = await writePoolAsync({
          functionName: "repay",
          args: [assetConfig.underlyingAddress, parsed, VARIABLE_INTEREST_RATE_MODE, user],
        });

        if (!txHash) {
          throw new Error("Repay transaction was not submitted.");
        }

        await refresh();
        notification.success(`Repaid ${amount} ${symbol} on the hackathon market.`);
      } catch (e) {
        const message = mapTxError(e, "Repay failed.");
        setError(message);
        notification.error(message);
        throw e;
      } finally {
        setIsRepaying(false);
      }
    },
    [
      allowance,
      assetConfig.underlyingAddress,
      borrowedBalance,
      decimals,
      refresh,
      requireWalletAndNetwork,
      symbol,
      walletBalance,
      writePoolAsync,
    ],
  );

  const repayAll = useCallback(async () => {
    setError(undefined);
    setIsRepaying(true);
    try {
      const user = requireWalletAndNetwork();
      const debt = (borrowedBalance as bigint | undefined) ?? ZERO;
      const balance = (walletBalance as bigint | undefined) ?? ZERO;
      const currentAllowance = (allowance as bigint | undefined) ?? ZERO;

      if (debt <= ZERO) {
        throw new Error("No outstanding debt to repay.");
      }

      if (!hasSufficientBalance(debt, balance)) {
        throw new Error(
          `Insufficient wallet ${symbol} balance to repay the full debt (${formatUnits(debt, decimals)}).`,
        );
      }

      if (!hasSufficientAllowance(debt, currentAllowance)) {
        throw new Error(
          `Insufficient allowance. Approve at least ${formatUnits(debt, decimals)} ${symbol} for the hackathon Pool first (separate transaction).`,
        );
      }

      const txHash = await writePoolAsync({
        functionName: "repay",
        args: [assetConfig.underlyingAddress, REPAY_ALL_AMOUNT, VARIABLE_INTEREST_RATE_MODE, user],
      });

      if (!txHash) {
        throw new Error("Repay-all transaction was not submitted.");
      }

      await refresh();
      notification.success(`Repaid full ${symbol} debt on the hackathon market.`);
    } catch (e) {
      const message = mapTxError(e, "Repay-all failed.");
      setError(message);
      notification.error(message);
      throw e;
    } finally {
      setIsRepaying(false);
    }
  }, [
    allowance,
    assetConfig.underlyingAddress,
    borrowedBalance,
    decimals,
    refresh,
    requireWalletAndNetwork,
    symbol,
    walletBalance,
    writePoolAsync,
  ]);

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
      selectedAsset,
      walletBalance: (walletBalance as bigint | undefined) ?? ZERO,
      suppliedBalance: (suppliedBalance as bigint | undefined) ?? ZERO,
      borrowedBalance: (borrowedBalance as bigint | undefined) ?? ZERO,
      allowance: (allowance as bigint | undefined) ?? ZERO,
      totalCollateralBase: (accountData as readonly bigint[] | undefined)?.[0] ?? ZERO,
      totalDebtBase: (accountData as readonly bigint[] | undefined)?.[1] ?? ZERO,
      availableBorrowsBase: (accountData as readonly bigint[] | undefined)?.[2] ?? ZERO,
      ltv: (accountData as readonly bigint[] | undefined)?.[4] ?? ZERO,
      healthFactor: (accountData as readonly bigint[] | undefined)?.[5] ?? maxUint256,
      decimals,
      symbol,
      tokenOwner: tokenOwner as Address | undefined,
      isCorrectNetwork: Boolean(isCorrectNetwork),
      isConnected,
      isReading:
        isLoadingBalance ||
        isLoadingAllowance ||
        isLoadingSupplied ||
        isLoadingBorrowed ||
        isLoadingAccount ||
        isLoadingDecimals ||
        isLoadingSymbol ||
        isLoadingOwner,
      isApproving,
      isSupplying,
      isWithdrawing,
      isBorrowing,
      isRepaying,
      isMinting,
      isWrapping,
      isOwner,
      canMint,
      canWrap,
      decimalsMismatch,
      error,
    }),
    [
      accountData,
      allowance,
      borrowedBalance,
      canMint,
      canWrap,
      decimals,
      decimalsMismatch,
      error,
      isApproving,
      isBorrowing,
      isConnected,
      isCorrectNetwork,
      isLoadingAccount,
      isLoadingAllowance,
      isLoadingBalance,
      isLoadingBorrowed,
      isLoadingDecimals,
      isLoadingOwner,
      isLoadingSupplied,
      isLoadingSymbol,
      isMinting,
      isOwner,
      isRepaying,
      isSupplying,
      isWithdrawing,
      isWrapping,
      selectedAsset,
      suppliedBalance,
      symbol,
      tokenOwner,
      walletBalance,
    ],
  );

  return {
    state,
    config: aaveHackathonMnzdConfig,
    selectedAssetConfig: assetConfig,
    mint,
    wrapEth,
    supplyEth,
    approve,
    supply,
    withdraw,
    withdrawAll,
    borrow,
    repay,
    repayAll,
    refresh,
    switchToSepolia,
    formatAmount,
  };
}
