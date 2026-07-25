import { aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";
import { aaveSepoliaConfig } from "~~/config/aaveSepolia";
import { aTokenAbi, aaveV3PoolAbi, erc20Abi, mintableErc20Abi } from "~~/contracts/abis/aaveSepolia";
import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

/**
 * External Aave contracts for Scaffold-ETH hooks.
 * - Official Sepolia EURS market from `aaveSepoliaConfig`
 * - Hackathon mNZD market from `aaveHackathonMnzdConfig` (aave-v3-origin deploy)
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
    HackathonPool: {
      address: aaveHackathonMnzdConfig.poolAddress,
      abi: aaveV3PoolAbi,
    },
    HackathonMnzd: {
      address: aaveHackathonMnzdConfig.asset.underlyingAddress,
      abi: mintableErc20Abi,
    },
    HackathonAToken: {
      address: aaveHackathonMnzdConfig.asset.aTokenAddress,
      abi: aTokenAbi,
    },
  },
} as const;

export default externalContracts satisfies GenericContractsDeclaration;
