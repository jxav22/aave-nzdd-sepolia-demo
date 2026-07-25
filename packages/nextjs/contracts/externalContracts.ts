import { aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";
import { aaveSepoliaConfig } from "~~/config/aaveSepolia";
import {
  aTokenAbi,
  aaveOracleAbi,
  aaveV3PoolAbi,
  erc20Abi,
  mintableErc20Abi,
  protocolDataProviderAbi,
  weth9Abi,
  wrappedTokenGatewayAbi,
} from "~~/contracts/abis/aaveSepolia";
import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

/**
 * External Aave contracts for Scaffold-ETH hooks.
 * - Official Sepolia EURS market from `aaveSepoliaConfig` (reference / unlinked)
 * - Hackathon multi-asset market from `aaveHackathonMnzdConfig`
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
    AaveSepoliaVariableDebt: {
      address: aaveSepoliaConfig.asset.variableDebtTokenAddress,
      abi: aTokenAbi,
    },
    HackathonPool: {
      address: aaveHackathonMnzdConfig.poolAddress,
      abi: aaveV3PoolAbi,
    },
    HackathonMnzd: {
      address: aaveHackathonMnzdConfig.assets.dNZD.underlyingAddress,
      abi: mintableErc20Abi,
    },
    HackathonWeth: {
      address: aaveHackathonMnzdConfig.assets.wETH.underlyingAddress,
      abi: weth9Abi,
    },
    HackathonWbtc: {
      address: aaveHackathonMnzdConfig.assets.wBTC.underlyingAddress,
      abi: mintableErc20Abi,
    },
    HackathonATokenMnzd: {
      address: aaveHackathonMnzdConfig.assets.dNZD.aTokenAddress,
      abi: aTokenAbi,
    },
    HackathonATokenWeth: {
      address: aaveHackathonMnzdConfig.assets.wETH.aTokenAddress,
      abi: aTokenAbi,
    },
    HackathonATokenWbtc: {
      address: aaveHackathonMnzdConfig.assets.wBTC.aTokenAddress,
      abi: aTokenAbi,
    },
    HackathonDebtMnzd: {
      address: aaveHackathonMnzdConfig.assets.dNZD.variableDebtTokenAddress,
      abi: aTokenAbi,
    },
    HackathonDebtWeth: {
      address: aaveHackathonMnzdConfig.assets.wETH.variableDebtTokenAddress,
      abi: aTokenAbi,
    },
    HackathonDebtWbtc: {
      address: aaveHackathonMnzdConfig.assets.wBTC.variableDebtTokenAddress,
      abi: aTokenAbi,
    },
    /** @deprecated Use HackathonATokenMnzd */
    HackathonAToken: {
      address: aaveHackathonMnzdConfig.assets.dNZD.aTokenAddress,
      abi: aTokenAbi,
    },
    /** @deprecated Use HackathonDebtMnzd */
    HackathonVariableDebt: {
      address: aaveHackathonMnzdConfig.assets.dNZD.variableDebtTokenAddress,
      abi: aTokenAbi,
    },
    HackathonWrappedTokenGateway: {
      address: aaveHackathonMnzdConfig.wrappedTokenGateway,
      abi: wrappedTokenGatewayAbi,
    },
    HackathonDataProvider: {
      address: aaveHackathonMnzdConfig.protocolDataProvider,
      abi: protocolDataProviderAbi,
    },
    HackathonOracle: {
      address: aaveHackathonMnzdConfig.aaveOracle,
      abi: aaveOracleAbi,
    },
  },
} as const;

export default externalContracts satisfies GenericContractsDeclaration;
