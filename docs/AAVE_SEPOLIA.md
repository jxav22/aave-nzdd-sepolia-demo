# Aave V3 Sepolia Integration

## 1. What this integration does

This Scaffold-ETH 2 frontend connects to the **official Aave V3 market on Ethereum Sepolia**. A connected wallet can:

- View Sepolia test EURS balance and Pool allowance
- Approve the Aave V3 Pool to spend EURS (exact amount)
- Supply EURS and view the resulting aToken balance
- Withdraw a specified amount or the full position
- **Borrow** EURS against supplied EURS (variable rate) and view variable debt + health factor
- **Repay** partial or full debt (`maxUint256`)

The reusable hook for other engineers is `useAaveSepolia`. Shared UI panel: `AaveMarketPanel`.

**Why EURS:** Public Sepolia **USDC** hits Aave error `51` (`SUPPLY_CAP_EXCEEDED`). Verified `getReserveCaps(EURS)` returns uncapped supply (`supplyCap: 0`). This keeps the demo on live Ethereum Sepolia without a fork.

## 2. What it does not do

- Does **not** deploy Aave, fork Aave, or create a custom lending market
- Does **not** deploy or mint a custom NZDD (or any fake stablecoin)
- Does **not** auto-supply after approve (two separate confirmed transactions)
- Does **not** use unlimited approvals by default

## 3. Official market vs custom deploy

| Approach | This project |
|----------|--------------|
| Connect to existing Aave V3 Sepolia Pool + assets from `@aave-dao/aave-address-book` | Yes (`/aave`) |
| Deploy your own Aave market / Pool / oracles | Deploy lives in aave-v3-origin; UI at `/mnzd` |

Addresses for the official EURS market are resolved from the address book. The custom hackathon mNZD market is documented in [AAVE_HACKATHON_MNZD.md](./AAVE_HACKATHON_MNZD.md).

## 4. Required environment variables

In `packages/nextjs/.env.local` (see `.env.example`):

```env
ALCHEMY_API_KEY=
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=
```

- **`ALCHEMY_API_KEY`** — single RPC convention for frontend + smoke check (exposed to the client via `next.config.ts`). Aligns with Hardhat’s key name.
- Do **not** also set a redundant `NEXT_PUBLIC_ALCHEMY_API_KEY` for this project.

## 5. Install and run

```bash
yarn install
yarn start
```

Open [http://localhost:3000/aave](http://localhost:3000/aave).

Useful checks:

```bash
yarn next:lint
yarn next:check-types
yarn test:aave
yarn next:build
yarn aave:smoke
```

You do **not** need `yarn chain` / `yarn deploy` for the Aave Sepolia flow (no custom market is deployed).

## 6. Switch MetaMask to Sepolia

1. Open MetaMask → Networks
2. Select **Sepolia** (chain ID `11155111`), or add it if missing
3. Or use the **Switch to Sepolia** button on `/aave` when connected to another chain

## 7. Obtain Sepolia ETH

You need Sepolia ETH for gas. Use a public Sepolia faucet (Alchemy, Infura, Google Cloud, etc.) and send ETH to your wallet on chain `11155111`.

## 8. Obtain Aave Sepolia test EURS

Use the **official Aave Ethereum Sepolia faucet** (not Circle USDC, not Base):

1. Open [Aave Sepolia faucet (`proto_sepolia_v3`)](https://bridge-testnet.aave.com/faucet/?marketName=proto_sepolia_v3)
2. Connect your wallet on Ethereum Sepolia
3. Mint **EURS** — use a small amount (EURS has **2 decimals**; large mint amounts often hit faucet limits)

Docs: [Aave testing & debugging](https://aave.com/docs/aave-v3/smart-contracts/testing-and-debugging)

**Important:** Do not use Circle’s Sepolia USDC or Base USDC. Those are different contracts/chains and will not work with this Pool. Sepolia USDC on Aave is also supply-capped for public users.

## 9. Approval → supply / borrow → withdrawal / repay flow

1. **Approve** — `SepoliaEURS.approve(pool, amount)` with an exact amount when allowance is insufficient
2. **Supply** — `Pool.supply(EURS, amount, user, 0)` after allowance covers the amount
3. **aToken balance** — read `aToken.balanceOf(user)` (interest-bearing supply position)
4. **Withdraw** — `Pool.withdraw(EURS, amount, user)` or `withdraw(EURS, maxUint256, user)` for full exit
5. **Borrow** — `Pool.borrow(EURS, amount, interestRateMode=2, referralCode=0, user)` (variable rate, same asset)
6. **Debt / health** — variable debt token `balanceOf` + `Pool.getUserAccountData(user)`
7. **Repay** — approve again if needed, then `Pool.repay(EURS, amount, 2, user)` or `repay(..., maxUint256, ...)` for full exit

Withdrawal / borrow / repay can fail if market liquidity is low or the position is constrained by debt/collateral. Failures are surfaced as errors — never treated as success.

## 10. Where contract addresses come from

```ts
import { AaveV3Sepolia } from "@aave-dao/aave-address-book";
// AaveV3Sepolia.POOL
// AaveV3Sepolia.ASSETS.EURS.UNDERLYING
// AaveV3Sepolia.ASSETS.EURS.A_TOKEN
// AaveV3Sepolia.ASSETS.EURS.V_TOKEN
// AaveV3Sepolia.ASSETS.EURS.decimals  // typically 2
```

Centralized in [`packages/nextjs/config/aaveSepolia.ts`](../packages/nextjs/config/aaveSepolia.ts). Registered for Scaffold-ETH hooks in [`packages/nextjs/contracts/externalContracts.ts`](../packages/nextjs/contracts/externalContracts.ts) as `SepoliaEURS`, `AaveV3Pool`, `AaveSepoliaAToken`, and `AaveSepoliaVariableDebt`.

There is no separate TypeScript `AaveV3SepoliaAssets` export; assets live under `AaveV3Sepolia.ASSETS`.

## 11. How another engineer uses the hook

```tsx
import { useAaveSepolia } from "~~/hooks/aave/useAaveSepolia";

const {
  state,
  approve,
  supply,
  withdraw,
  withdrawAll,
  borrow,
  repay,
  repayAll,
  refresh,
  config,
} = useAaveSepolia();
```

### Return type (summary)

- **`state`**: `walletBalance`, `suppliedBalance`, `borrowedBalance`, `allowance`; account health (`totalCollateralBase`, `totalDebtBase`, `availableBorrowsBase`, `ltv`, `healthFactor`); `decimals`, `symbol`; busy flags including `isBorrowing` / `isRepaying`; optional `error` / `decimalsMismatch`
- **`approve(amount)` / `supply(amount)` / `withdraw(amount)` / `borrow(amount)` / `repay(amount)`**: human-readable decimal strings; parse with token decimals; wait for confirmation; refresh reads afterward
- **`withdrawAll()` / `repayAll()`**: use `maxUint256`
- **`config`**: typed `aaveSepoliaConfig` (addresses + metadata)

Transaction behavior:

- Rejects zero / negative / malformed amounts and excess precision
- Supply / repay require wallet, Sepolia, balance, and sufficient allowance
- Approve uses exact amount (not unlimited)
- Approve and supply/repay never chain automatically
- Errors use mapped Aave / wallet messages for rejection, balance, allowance, health factor, and liquidity

## 12. Known testnet limitations

- Test EURS has no real value; faucets and liquidity can change
- Public Sepolia USDC supply is capped (error `51`) — this demo uses EURS instead
- Withdrawals may revert under low liquidity or health-factor constraints
- Address-book versions can update market addresses — pin and refresh the package periodically
- RPC rate limits apply to free Alchemy keys

## 13. Warning — not NZDD, not production

This integration uses **Sepolia test EURS** from the official Aave market as a prototype settlement asset only.

**It is not actual NZDD. It is not production infrastructure. Do not treat balances or rates as real value.**
