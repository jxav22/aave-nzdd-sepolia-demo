/**
 * Shared Sepolia clients for gated Aave on-chain e2e.
 *
 * Requires:
 *   AAVE_E2E=1
 *   E2E_PRIVATE_KEY  (dNZD token owner)
 *   ALCHEMY_API_KEY or SEPOLIA_RPC_URL  (optional; falls back to scaffold default / publicnode)
 */
import {
  type Account,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  http,
  isAddressEqual,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import scaffoldConfig from "~~/scaffold.config";

export type E2eClients = {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Account;
  address: Address;
};

const PUBLICNODE_SEPOLIA = "https://ethereum-sepolia-rpc.publicnode.com";

export function e2eEnvReady(): boolean {
  return process.env.AAVE_E2E === "1" && Boolean(process.env.E2E_PRIVATE_KEY?.trim());
}

export function resolveSepoliaRpcUrl(): string {
  if (process.env.SEPOLIA_RPC_URL?.trim()) {
    return process.env.SEPOLIA_RPC_URL.trim();
  }
  const alchemyKey = process.env.ALCHEMY_API_KEY?.trim() || scaffoldConfig.alchemyApiKey;
  if (alchemyKey) {
    return `https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`;
  }
  return PUBLICNODE_SEPOLIA;
}

function normalizePrivateKey(raw: string): Hex {
  const trimmed = raw.trim();
  if (trimmed.startsWith("0x")) {
    return trimmed as Hex;
  }
  return `0x${trimmed}` as Hex;
}

export function createE2eClients(): E2eClients {
  const pk = process.env.E2E_PRIVATE_KEY;
  if (!pk?.trim()) {
    throw new Error("E2E_PRIVATE_KEY is required to run Aave e2e tests.");
  }

  const account = privateKeyToAccount(normalizePrivateKey(pk));
  const transport = http(resolveSepoliaRpcUrl());

  const publicClient = createPublicClient({
    chain: sepolia,
    transport,
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport,
  });

  return {
    publicClient,
    walletClient,
    account,
    address: account.address,
  };
}

export async function writeAndWait(params: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Account;
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}): Promise<Hash> {
  const { publicClient, walletClient, account, address, abi, functionName, args, value } = params;

  const hash = await walletClient.writeContract({
    address,
    abi: abi as never,
    functionName: functionName as never,
    args: (args ?? []) as never,
    account,
    chain: sepolia,
    ...(value !== undefined ? { value } : {}),
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction reverted: ${hash} (${functionName})`);
  }
  return hash;
}

export async function requireOwner(params: {
  publicClient: PublicClient;
  tokenAddress: Address;
  abi: readonly unknown[];
  expectedOwner: Address;
}): Promise<void> {
  const owner = (await params.publicClient.readContract({
    address: params.tokenAddress,
    abi: params.abi as never,
    functionName: "owner",
  })) as Address;

  if (!isAddressEqual(owner, params.expectedOwner)) {
    throw new Error(
      `E2E_PRIVATE_KEY wallet ${params.expectedOwner} is not the dNZD token owner (${owner}). ` +
        "Connect the deployer/owner key to mint and seed liquidity.",
    );
  }
}

export async function requireGasEth(publicClient: PublicClient, address: Address, minWei: bigint): Promise<void> {
  const balance = await publicClient.getBalance({ address });
  if (balance < minWei) {
    throw new Error(
      `Insufficient Sepolia ETH for gas/wrap on ${address}: have ${balance} wei, need at least ${minWei} wei.`,
    );
  }
}
