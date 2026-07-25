/**
 * Suite A, same-asset dNZD lifecycle on live Sepolia.
 *
 * Opt-in only (excluded from `yarn test:aave`):
 *
 *   PowerShell:
 *     $env:AAVE_E2E="1"; $env:E2E_PRIVATE_KEY="0x..."; yarn aave:e2e
 *
 *   Optional: $env:ALCHEMY_API_KEY or $env:SEPOLIA_RPC_URL
 *
 * E2E_PRIVATE_KEY must be the dNZD token owner.
 */
import { parseEther } from "viem";
import { beforeAll, describe, expect, it } from "vitest";
import { aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";
import { mintableErc20Abi } from "~~/contracts/abis/aaveSepolia";
import { readATokenBalance, readErc20Balance, readUserAccountData, readVariableDebt } from "~~/e2e/hackathonReads";
import {
  approveUnderlying,
  bestEffortCleanup,
  borrow,
  mintDnzd,
  repayAllWithBuffer,
  supply,
  toWriteCtx,
  withdrawAll,
} from "~~/e2e/hackathonWrites";
import { type E2eClients, createE2eClients, requireGasEth, requireOwner } from "~~/e2e/viemClients";

const WAD = 10n ** 18n;
const MINT_AMOUNT = "100";
const SUPPLY_AMOUNT = "100";
const BORROW_AMOUNT = "20";
const MIN_GAS_ETH = parseEther("0.005");

describe("e2e same-asset dNZD (Sepolia)", () => {
  let clients: E2eClients;
  const dNZD = aaveHackathonMnzdConfig.assets.dNZD;

  beforeAll(async () => {
    clients = createE2eClients();
    await requireOwner({
      publicClient: clients.publicClient,
      tokenAddress: dNZD.underlyingAddress,
      abi: mintableErc20Abi,
      expectedOwner: clients.address,
    });
    await requireGasEth(clients.publicClient, clients.address, MIN_GAS_ETH);
  }, 60_000);

  it("mint → approve → supply → borrow → repayAll → withdrawAll", async () => {
    const ctx = toWriteCtx(clients);

    try {
      const walletBefore = await readErc20Balance(clients.publicClient, dNZD.underlyingAddress, clients.address);

      await mintDnzd(ctx, MINT_AMOUNT);
      const walletAfterMint = await readErc20Balance(clients.publicClient, dNZD.underlyingAddress, clients.address);
      expect(walletAfterMint).toBeGreaterThan(walletBefore);

      const aTokenBefore = await readATokenBalance(clients.publicClient, "dNZD", clients.address);
      await approveUnderlying(ctx, "dNZD", SUPPLY_AMOUNT);
      await supply(ctx, "dNZD", SUPPLY_AMOUNT);
      const aTokenAfterSupply = await readATokenBalance(clients.publicClient, "dNZD", clients.address);
      expect(aTokenAfterSupply).toBeGreaterThan(aTokenBefore);

      await borrow(ctx, "dNZD", BORROW_AMOUNT);
      const debtAfterBorrow = await readVariableDebt(clients.publicClient, "dNZD", clients.address);
      expect(debtAfterBorrow).toBeGreaterThan(0n);

      const account = await readUserAccountData(clients.publicClient, clients.address);
      expect(account.healthFactor).toBeGreaterThan(WAD);

      await repayAllWithBuffer(ctx, "dNZD");
      const debtAfterRepay = await readVariableDebt(clients.publicClient, "dNZD", clients.address);
      expect(debtAfterRepay).toBe(0n);

      await withdrawAll(ctx, "dNZD");
      const aTokenAfterWithdraw = await readATokenBalance(clients.publicClient, "dNZD", clients.address);
      expect(aTokenAfterWithdraw).toBe(0n);
    } finally {
      await bestEffortCleanup(ctx, ["dNZD"]);
    }
  }, 300_000);
});
