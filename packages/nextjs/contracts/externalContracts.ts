import { aaveSepoliaConfig } from "~~/config/aaveSepolia";
import { aTokenAbi, aaveV3PoolAbi, erc20Abi } from "~~/contracts/abis/aaveSepolia";
import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

/**
 * Official Aave V3 Sepolia contracts registered for Scaffold-ETH hooks.
 * Addresses come from `aaveSepoliaConfig` (address book) — no duplicated literals.
 */
const externalContracts = {
  [aaveSepoliaConfig.chainId]: {
    AaveV3Pool: {
      address: aaveSepoliaConfig.poolAddress,
      abi: aaveV3PoolAbi,
    },
    SepoliaEURS: {
      address: aaveSepoliaConfig.asset.underlyingAddress,
      abi: erc20Abi,
    },
    AaveSepoliaAToken: {
      address: aaveSepoliaConfig.asset.aTokenAddress,
      abi: aTokenAbi,
    },
  },
} as const;

export default externalContracts satisfies GenericContractsDeclaration;
