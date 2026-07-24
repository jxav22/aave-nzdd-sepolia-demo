#!/usr/bin/env tsx
/**
 * Read-only Sepolia smoke check for official Aave V3 addresses.
 * Requires ALCHEMY_API_KEY. Does not use a private key or submit transactions.
 */
import { aaveSepoliaConfig } from "../config/aaveSepolia";
import { aTokenAbi, erc20Abi } from "../contracts/abis/aaveSepolia";
import { createPublicClient, http, isAddress } from "viem";
import { sepolia } from "viem/chains";

async function main() {
  const apiKey = process.env.ALCHEMY_API_KEY;

  if (!apiKey) {
    console.error(
      "ALCHEMY_API_KEY is not set. Skipping live Sepolia smoke check.\n" +
        "Set ALCHEMY_API_KEY in the environment (or packages/nextjs/.env.local) and re-run:\n" +
        "  yarn aave:smoke",
    );
    process.exit(0);
  }

  const client = createPublicClient({
    chain: sepolia,
    transport: http(`https://eth-sepolia.g.alchemy.com/v2/${apiKey}`),
  });

  const { poolAddress, asset } = aaveSepoliaConfig;

  console.log("Aave Sepolia smoke check");
  console.log("------------------------");
  console.log(`chainId: ${aaveSepoliaConfig.chainId}`);
  console.log(`pool: ${poolAddress}`);
  console.log(`EURS underlying: ${asset.underlyingAddress}`);
  console.log(`aToken: ${asset.aTokenAddress}`);
  console.log(`address-book decimals: ${asset.decimals}`);

  for (const [label, address] of [
    ["Pool", poolAddress],
    ["EURS", asset.underlyingAddress],
    ["aToken", asset.aTokenAddress],
  ] as const) {
    if (!isAddress(address)) {
      throw new Error(`${label} address is invalid: ${address}`);
    }
    const code = await client.getBytecode({ address });
    if (!code || code === "0x") {
      throw new Error(`${label} at ${address} has no bytecode on Sepolia.`);
    }
    console.log(`✓ ${label} has bytecode`);
  }

  const [symbol, decimals] = await Promise.all([
    client.readContract({
      address: asset.underlyingAddress,
      abi: erc20Abi,
      functionName: "symbol",
    }),
    client.readContract({
      address: asset.underlyingAddress,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);

  console.log(`✓ underlying symbol: ${symbol}`);
  console.log(`✓ underlying decimals: ${decimals}`);

  if (String(symbol).toUpperCase() !== asset.protocolSymbol) {
    throw new Error(`Symbol mismatch: on-chain ${symbol} vs expected ${asset.protocolSymbol}`);
  }

  if (decimals !== asset.decimals) {
    throw new Error(`Decimals mismatch: on-chain ${decimals} vs address-book ${asset.decimals}`);
  }

  const aTokenSymbol = await client.readContract({
    address: asset.aTokenAddress,
    abi: aTokenAbi,
    functionName: "symbol",
  });
  console.log(`✓ aToken symbol: ${aTokenSymbol}`);

  console.log("\nVerified configuration:");
  console.log(
    JSON.stringify(
      {
        chainId: aaveSepoliaConfig.chainId,
        poolAddress,
        asset: {
          protocolSymbol: asset.protocolSymbol,
          displaySymbol: asset.displaySymbol,
          underlyingAddress: asset.underlyingAddress,
          aTokenAddress: asset.aTokenAddress,
          decimals: asset.decimals,
          onChainSymbol: symbol,
        },
      },
      null,
      2,
    ),
  );
  console.log("\nSmoke check passed.");
}

main().catch(error => {
  console.error("Smoke check failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
