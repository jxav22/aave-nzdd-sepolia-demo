/**
 * Server-side read of a user's position in the hackathon Aave V3 market.
 *
 * Read-only: no signer, no private key, no write path. The Aave oracle is the sole
 * source of truth for collateral value, borrowing capacity and liquidation, exactly as
 * the protocol itself uses it. Binance data never enters this file.
 *
 * Every collateral leg is decomposed per asset so the stress engine can shock the
 * ETH-correlated leg alone, and so the recomputed health factor can be reconciled
 * against the one Aave reports.
 */
import { type Address, createPublicClient, http, maxUint256 } from "viem";
import { sepolia } from "viem/chains";
import { type HackathonAssetSymbol, aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";
import { aaveOracleAbi, aaveV3PoolAbi, erc20Abi, protocolDataProviderAbi } from "~~/contracts/abis/aaveSepolia";
import scaffoldConfig from "~~/scaffold.config";
import type { CollateralLeg } from "~~/utils/risk/stress";

/** The asset a price shock applies to. Everything else holds its value in a scenario. */
export const SHOCKABLE_SYMBOL: HackathonAssetSymbol = "wETH";
export const COLLATERAL_SYMBOL: HackathonAssetSymbol = "wETH";
export const BORROW_SYMBOL: HackathonAssetSymbol = "dNZD";

export type ReserveSnapshot = {
  symbol: HackathonAssetSymbol;
  decimals: number;
  priceBase: bigint;
  liquidationThresholdBps: bigint;
  ltvBps: bigint;
  suppliedBalance: bigint;
  collateralValueBase: bigint;
  borrowingEnabled: boolean;
  isActive: boolean;
  isFrozen: boolean;
};

export type AavePositionSnapshot = {
  chainId: number;
  poolAddress: Address;
  oracleAddress: Address;
  user: Address;
  blockNumber: bigint;
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  currentLiquidationThresholdBps: bigint;
  ltvBps: bigint;
  /** Null rather than `maxUint256` when the user has no debt. */
  healthFactorWad: bigint | null;
  reserves: Record<HackathonAssetSymbol, ReserveSnapshot>;
  collateralLegs: CollateralLeg[];
  borrowAssetDebt: bigint;
  /** Underlying held by the aToken: the amount the pool can actually pay out. */
  borrowAssetLiquidity: bigint;
};

function resolveRpcUrl(): string {
  if (process.env.SEPOLIA_RPC_URL) {
    return process.env.SEPOLIA_RPC_URL;
  }
  if (scaffoldConfig.alchemyApiKey) {
    return `https://eth-sepolia.g.alchemy.com/v2/${scaffoldConfig.alchemyApiKey}`;
  }
  return "https://ethereum-sepolia-rpc.publicnode.com";
}

let client: ReturnType<typeof createPublicClient> | null = null;

export function getPublicClient() {
  if (!client) {
    client = createPublicClient({ chain: sepolia, transport: http(resolveRpcUrl()) });
  }
  return client;
}

/** Test hook — drops the memoised client so a stubbed RPC URL takes effect. */
export function resetPublicClient(): void {
  client = null;
}

const { assetSymbols, assets, poolAddress, aaveOracle, protocolDataProvider } = aaveHackathonMnzdConfig;

export async function readAavePosition(user: Address): Promise<AavePositionSnapshot> {
  const publicClient = getPublicClient();

  const contracts = [
    { address: poolAddress, abi: aaveV3PoolAbi, functionName: "getUserAccountData", args: [user] } as const,
    ...assetSymbols.map(
      symbol =>
        ({
          address: aaveOracle,
          abi: aaveOracleAbi,
          functionName: "getAssetPrice",
          args: [assets[symbol].underlyingAddress],
        }) as const,
    ),
    ...assetSymbols.map(
      symbol =>
        ({
          address: protocolDataProvider,
          abi: protocolDataProviderAbi,
          functionName: "getReserveConfigurationData",
          args: [assets[symbol].underlyingAddress],
        }) as const,
    ),
    ...assetSymbols.map(
      symbol =>
        ({ address: assets[symbol].aTokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [user] }) as const,
    ),
    {
      address: assets[BORROW_SYMBOL].variableDebtTokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [user],
    } as const,
    {
      address: assets[BORROW_SYMBOL].underlyingAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [assets[BORROW_SYMBOL].aTokenAddress],
    } as const,
  ];

  const [blockNumber, results] = await Promise.all([
    publicClient.getBlockNumber(),
    publicClient.multicall({ contracts, allowFailure: false }),
  ]);

  const assetCount = assetSymbols.length;
  let cursor = 0;
  const accountData = results[cursor++] as readonly bigint[];
  const prices = results.slice(cursor, (cursor += assetCount)) as bigint[];
  const configs = results.slice(cursor, (cursor += assetCount)) as readonly (readonly [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
  ])[];
  const suppliedBalances = results.slice(cursor, (cursor += assetCount)) as bigint[];
  const borrowAssetDebt = results[cursor++] as bigint;
  const borrowAssetLiquidity = results[cursor++] as bigint;

  const reserves = {} as Record<HackathonAssetSymbol, ReserveSnapshot>;
  const collateralLegs: CollateralLeg[] = [];

  assetSymbols.forEach((symbol, index) => {
    const { decimals } = assets[symbol];
    const priceBase = prices[index];
    const config = configs[index];
    const suppliedBalance = suppliedBalances[index];
    const collateralValueBase = (suppliedBalance * priceBase) / 10n ** BigInt(decimals);
    const liquidationThresholdBps = config[2];

    reserves[symbol] = {
      symbol,
      decimals,
      priceBase,
      liquidationThresholdBps,
      ltvBps: config[1],
      suppliedBalance,
      collateralValueBase,
      borrowingEnabled: config[6],
      isActive: config[8],
      isFrozen: config[9],
    };

    if (collateralValueBase > 0n) {
      collateralLegs.push({
        symbol,
        valueBase: collateralValueBase,
        liquidationThresholdBps,
        shockable: symbol === SHOCKABLE_SYMBOL,
      });
    }
  });

  const rawHealthFactor = accountData[5];

  return {
    chainId: sepolia.id,
    poolAddress,
    oracleAddress: aaveOracle,
    user,
    blockNumber,
    totalCollateralBase: accountData[0],
    totalDebtBase: accountData[1],
    availableBorrowsBase: accountData[2],
    currentLiquidationThresholdBps: accountData[3],
    ltvBps: accountData[4],
    healthFactorWad: rawHealthFactor === maxUint256 ? null : rawHealthFactor,
    reserves,
    collateralLegs,
    borrowAssetDebt,
    borrowAssetLiquidity,
  };
}

/**
 * Aave reports collateral it does not count toward the health factor (a reserve with a
 * zero liquidation threshold, or one the user disabled as collateral). Our legs are built
 * from aToken balances, so comparing the two totals catches that divergence before the
 * stress table is built on a collateral set Aave does not recognise.
 */
export function collateralLegsCoverReportedTotal(snapshot: AavePositionSnapshot, toleranceBase = 100n): boolean {
  const legTotal = snapshot.collateralLegs.reduce((sum, leg) => sum + leg.valueBase, 0n);
  const difference =
    legTotal > snapshot.totalCollateralBase
      ? legTotal - snapshot.totalCollateralBase
      : snapshot.totalCollateralBase - legTotal;

  return difference <= toleranceBase;
}
