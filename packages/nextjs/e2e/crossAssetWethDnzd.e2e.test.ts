/**
 * Suite B, cross-asset: wETH collateral → borrow dNZD on live Sepolia.
 *
 * Opt-in only (excluded from `yarn test:aave`):
 *
 *   PowerShell:
 *     $env:AAVE_E2E="1"; $env:E2E_PRIVATE_KEY="0x..."; yarn aave:e2e
 *
 *   Optional: $env:ALCHEMY_API_KEY or $env:SEPOLIA_RPC_URL
 *
 * Wallet needs Sepolia ETH for gas and for `supplyEth` (default 0.01 ETH).
 * E2E_PRIVATE_KEY must be the dNZD token owner.
 */
import { parseEther } from "viem";
import { beforeAll, describe, expect, it } from "vitest";
import { aaveHackathonMnzdConfig } from "~~/config/aaveHackathonMnzd";
import { mintableErc20Abi } from "~~/contracts/abis/aaveSepolia";
import { readATokenBalance, readUserAccountData, readVariableDebt } from "~~/e2e/hackathonReads";
import {
  approveUnderlying,
  bestEffortCleanup,
  borrow,
  mintDnzd,
  repayAllWithBuffer,
  supply,
  supplyEth,
  toWriteCtx,
  withdrawAll,
} from "~~/e2e/hackathonWrites";
import { type E2eClients, createE2eClients, requireGasEth, requireOwner } from "~~/e2e/viemClients";

const WAD = 10n ** 18n;
const SEED_DNZD = "10000";
const SUPPLY_ETH = "0.01";
const BORROW_DNZD = "10";
/** Gas + wrap amount + buffer */
const MIN_ETH = parseEther("0.02");

describe("e2e cross-asset wETH → dNZD (Sepolia)", () => {
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
    await requireGasEth(clients.publicClient, clients.address, MIN_ETH);
  }, 60_000);

  it("seed dNZD → supplyEth → borrow dNZD → repayAll → withdrawAll wETH (+ cleanup seed)", async () => {
    const ctx = toWriteCtx(clients);

    try {
      const seedBefore = await readATokenBalance(clients.publicClient, "dNZD", clients.address);
      await mintDnzd(ctx, SEED_DNZD);
      await approveUnderlying(ctx, "dNZD", SEED_DNZD);
      await supply(ctx, "dNZD", SEED_DNZD);
      const seedAfter = await readATokenBalance(clients.publicClient, "dNZD", clients.address);
      expect(seedAfter).toBeGreaterThan(seedBefore);

      const wethBefore = await readATokenBalance(clients.publicClient, "wETH", clients.address);
      await supplyEth(ctx, SUPPLY_ETH);
      const wethAfter = await readATokenBalance(clients.publicClient, "wETH", clients.address);
      expect(wethAfter).toBeGreaterThan(wethBefore);

      await borrow(ctx, "dNZD", BORROW_DNZD);
      const debtAfterBorrow = await readVariableDebt(clients.publicClient, "dNZD", clients.address);
      expect(debtAfterBorrow).toBeGreaterThan(0n);

      const account = await readUserAccountData(clients.publicClient, clients.address);
      expect(account.healthFactor).toBeGreaterThan(WAD);

      await repayAllWithBuffer(ctx, "dNZD");
      const debtAfterRepay = await readVariableDebt(clients.publicClient, "dNZD", clients.address);
      expect(debtAfterRepay).toBe(0n);

      await withdrawAll(ctx, "wETH");
      const wethFinal = await readATokenBalance(clients.publicClient, "wETH", clients.address);
      expect(wethFinal).toBe(0n);

      await withdrawAll(ctx, "dNZD");
      const seedFinal = await readATokenBalance(clients.publicClient, "dNZD", clients.address);
      expect(seedFinal).toBe(0n);
    } finally {
      await bestEffortCleanup(ctx, ["dNZD", "wETH"]);
    }
  }, 420_000);
});
