import { AaveV3Sepolia } from "@aave-dao/aave-address-book";
import { type Address, isAddress } from "viem";
import { sepolia } from "viem/chains";

/**
 * Official Aave V3 Sepolia market configuration.
 *
 * Addresses come exclusively from `@aave-dao/aave-address-book` (`AaveV3Sepolia`).
 * Asset: EURS (euro-pegged test stable). Sepolia USDC is supply-capped (Aave error 51)
 * on the public market, so this integration uses uncapped EURS instead.
 *
 * Decimals come from address-book metadata (`ASSETS.EURS.decimals`, typically 2).
 * The integration hook also reads on-chain `decimals()` and surfaces a mismatch.
 *
 * This is Aave's Sepolia test EURS — not NZDD and not USDC.
 */

const eursAsset = AaveV3Sepolia.ASSETS?.EURS;

if (!eursAsset) {
  throw new Error(
    "Aave V3 Sepolia EURS is unavailable in @aave-dao/aave-address-book. " +
      "Refusing to substitute another token. Update the address-book package or check exports.",
  );
}

if (!eursAsset.UNDERLYING || !isAddress(eursAsset.UNDERLYING)) {
  throw new Error("Aave V3 Sepolia EURS.UNDERLYING is missing or invalid in the address book.");
}

if (!eursAsset.A_TOKEN || !isAddress(eursAsset.A_TOKEN)) {
  throw new Error("Aave V3 Sepolia EURS.A_TOKEN is missing or invalid in the address book.");
}

if (!eursAsset.V_TOKEN || !isAddress(eursAsset.V_TOKEN)) {
  throw new Error("Aave V3 Sepolia EURS.V_TOKEN is missing or invalid in the address book.");
}

if (!AaveV3Sepolia.POOL || !isAddress(AaveV3Sepolia.POOL)) {
  throw new Error("Aave V3 Sepolia POOL is missing or invalid in the address book.");
}

/** Address-book metadata decimals for Sepolia EURS (validated; typically 2). */
const ADDRESS_BOOK_EURS_DECIMALS = eursAsset.decimals;

if (typeof ADDRESS_BOOK_EURS_DECIMALS !== "number" || ADDRESS_BOOK_EURS_DECIMALS <= 0) {
  throw new Error(
    "Aave V3 Sepolia EURS.decimals is missing from the address book. " +
      "Refusing undocumented fallback — update @aave-dao/aave-address-book.",
  );
}

export const aaveSepoliaConfig = {
  chainId: AaveV3Sepolia.CHAIN_ID,
  poolAddress: AaveV3Sepolia.POOL as Address,
  faucetAddress: AaveV3Sepolia.FAUCET as Address,
  explorerBaseUrl: sepolia.blockExplorers.default.url,
  asset: {
    protocolSymbol: "EURS" as const,
    displaySymbol: "EURS" as const,
    underlyingAddress: eursAsset.UNDERLYING as Address,
    aTokenAddress: eursAsset.A_TOKEN as Address,
    variableDebtTokenAddress: eursAsset.V_TOKEN as Address,
    decimals: ADDRESS_BOOK_EURS_DECIMALS,
  },
} as const;

export type AaveSepoliaConfig = typeof aaveSepoliaConfig;

export const AAVE_TESTNET_FAUCET_DOCS_URL = "https://aave.com/docs/aave-v3/smart-contracts/testing-and-debugging";

export const AAVE_APP_URL = "https://app.aave.com";

/** Direct Ethereum Sepolia market faucet UI (prefer over Base default in app.aave.com). */
export const AAVE_SEPOLIA_FAUCET_URL = "https://bridge-testnet.aave.com/faucet/?marketName=proto_sepolia_v3";
