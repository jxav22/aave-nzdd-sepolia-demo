# Web2 Engineer Handoff

This guide is for engineers comfortable with React / Next.js who are new to crypto. It gets you from clone → running the Aave Sepolia demo → knowing which files to edit.

For hook API details, addresses, and testnet limitations, see [AAVE_SEPOLIA.md](./AAVE_SEPOLIA.md).

---

## 1. What you’re building

This repo is a **Scaffold-ETH 2** frontend that talks to the **official Aave V3 market on Ethereum Sepolia** (a public test network).

A connected wallet can:

1. Mint test **EURS** from the Aave faucet
2. **Approve** the Aave Pool to spend that EURS
3. **Supply** EURS into Aave and see an **aToken** balance
4. **Withdraw** back to the wallet

This is a **frontend-only** integration. You do **not** deploy Aave, deploy a custom stablecoin, or run a local blockchain for this path.

| This is | This is not |
|---------|-------------|
| Sepolia **test** EURS | Real money or mainnet |
| A prototype settlement asset | **NZDD** (do not label it as such) |
| Live public Aave V3 on Sepolia | Your own lending market |

---

## 2. Web2 → Web3 mental model

| Web3 term | Rough web2 analogy |
|-----------|-------------------|
| **Wallet** (e.g. MetaMask) | Signed-in identity + private keystore. The user confirms every write. |
| **Network / chain ID** | Environment. Sepolia (`11155111`) ≈ staging. Mainnet ≈ production — we do not use it here. |
| **RPC** (Alchemy) | Backend API your app calls to read chain state and submit transactions. |
| **Transaction** | A user-confirmed “POST” that costs **gas** (paid in Sepolia ETH) and can fail on-chain. |
| **Approve** then **supply** | Like granting spend permission, then executing the action — **two separate confirmed steps**. They are never auto-chained. |
| **Allowance** | How much the Pool is currently allowed to pull from the user’s EURS balance. |
| **aToken balance** | Receipt for what you supplied; it can grow slightly with interest. |
| **EURS decimals = 2** | Amounts behave like currency with cents (`1.50` → `150` base units). Not 6-decimal USDC. |

You are not calling a REST API you own for lend/borrow. The “backend” is public smart contracts on Sepolia; your Next.js app is the client UI.

---

## 3. Day-1: run the demo (no local blockchain)

**Skip** `yarn chain` and `yarn deploy` for the Aave path. Those are for Scaffold-ETH’s optional local Hardhat network and are unrelated to live Sepolia Aave.

### Prerequisites

- [Node.js](https://nodejs.org/en/download/) ≥ v20.18.3
- [Yarn](https://yarnpkg.com/getting-started/install)
- [Git](https://git-scm.com/downloads)
- A browser wallet such as [MetaMask](https://metamask.io/download/)

### Environment variables

1. Copy `packages/nextjs/.env.example` → `packages/nextjs/.env.local`
2. Fill in:

```env
ALCHEMY_API_KEY=
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=
```

| Variable | Where to get it |
|----------|-----------------|
| `ALCHEMY_API_KEY` | [Alchemy](https://www.alchemy.com/) → create an app → Ethereum Sepolia |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | [WalletConnect Cloud](https://cloud.walletconnect.com/) → create a project → copy Project ID |

`ALCHEMY_API_KEY` is exposed to the client via `next.config.ts` (intentional for this template). Do not also set a redundant `NEXT_PUBLIC_ALCHEMY_API_KEY`.

### Install and start

From the repo root:

```bash
yarn install
yarn start
```

Open [http://localhost:3000/aave](http://localhost:3000/aave).

### Connect on Sepolia

1. Connect your wallet in the app
2. Ensure the network is **Ethereum Sepolia** (chain ID `11155111`)
3. Or use the **Switch to Sepolia** button on `/aave` if you are on another chain

### Get Sepolia ETH (gas)

Every approve / supply / withdraw costs a small amount of Sepolia ETH. Use a public Sepolia faucet (Alchemy, Infura, Google Cloud, etc.) and send test ETH to your wallet on chain `11155111`.

### Get test EURS

Use the **official Aave Ethereum Sepolia faucet** (not Circle USDC, not Base):

1. Open [Aave Sepolia faucet (`proto_sepolia_v3`)](https://bridge-testnet.aave.com/faucet/?marketName=proto_sepolia_v3)
2. Connect the same wallet on Ethereum Sepolia
3. Mint **EURS** — prefer a small amount (EURS has **2 decimals**; large mints often hit faucet limits)

**Do not** use Circle’s Sepolia USDC or Base USDC. Different contracts/chains — they will not work with this Pool. Public Sepolia USDC on Aave is also **supply-capped** (error `51`), which is why this demo uses EURS.

### Walk the UI

On `/aave`:

1. Confirm wallet EURS balance appears
2. Enter an amount → **Approve** → confirm in the wallet
3. **Supply** the same amount → confirm again
4. Confirm **aToken / supplied** balance updates
5. **Withdraw** (partial or all) → confirm

---

## 4. Where the code lives

| If you want to change… | Edit |
|------------------------|------|
| Page copy, layout, empty states, faucet links | [`packages/nextjs/app/aave/page.tsx`](../packages/nextjs/app/aave/page.tsx) |
| Approve / supply / withdraw logic, balances, errors | [`packages/nextjs/hooks/aave/useAaveSepolia.ts`](../packages/nextjs/hooks/aave/useAaveSepolia.ts) |
| Pool / EURS / aToken addresses, symbols, decimals | [`packages/nextjs/config/aaveSepolia.ts`](../packages/nextjs/config/aaveSepolia.ts) |
| Names registered for Scaffold-ETH contract hooks | [`packages/nextjs/contracts/externalContracts.ts`](../packages/nextjs/contracts/externalContracts.ts) |
| Human amount ↔ on-chain units parsing | [`packages/nextjs/utils/aave/amount.ts`](../packages/nextjs/utils/aave/amount.ts) |
| Target chain for the app | [`packages/nextjs/scaffold.config.ts`](../packages/nextjs/scaffold.config.ts) |

Addresses come from `@aave-dao/aave-address-book` (`AaveV3Sepolia`), not from hardcoded blog snippets.

---

## 5. How to extend safely

- Prefer the existing **`useAaveSepolia`** hook from UI code instead of re-implementing Pool calls.
- Keep **approve** and **supply** as separate user-confirmed transactions.
- Do **not** hardcode token or Pool addresses in components — go through `aaveSepoliaConfig`.
- For new contract reads/writes, use Scaffold-ETH hooks from `~~/hooks/scaffold-eth`:
  - `useScaffoldReadContract`
  - `useScaffoldWriteContract`
- Surface user-facing errors with `notification` / `getParsedError` from `~~/utils/scaffold-eth`.

Hook usage sketch:

```tsx
import { useAaveSepolia } from "~~/hooks/aave/useAaveSepolia";

const { state, approve, supply, withdraw, withdrawAll, refresh, config } = useAaveSepolia();
```

Full return-type notes: [AAVE_SEPOLIA.md §11](./AAVE_SEPOLIA.md#11-how-another-engineer-uses-the-hook).

---

## 6. Common failures

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| “Wrong network” / reads empty | Wallet not on Sepolia | Switch to Sepolia (`11155111`) or use **Switch to Sepolia** |
| Tx fails immediately / “insufficient funds” | No Sepolia ETH for gas | Use a Sepolia ETH faucet |
| Wallet EURS is `0` | Not minted, or wrong token | Mint **EURS** from the Aave Sepolia faucet above |
| Supply reverts with error `51` | Tried capped USDC (or wrong asset) | Use EURS from this market only |
| Supply says allowance too low | Approve not done or amount too small | Approve the exact amount first, then supply |
| RPC / rate-limit errors | Free Alchemy quota | Create your own Alchemy app key; retry later |
| Decimals mismatch warning | On-chain `decimals()` ≠ address-book metadata | Check `aaveSepoliaConfig` and address-book package version |
| Withdraw reverts | Low market liquidity or position constraints | Try a smaller amount; see limitations in AAVE_SEPOLIA.md |

---

## 7. Verification commands

From the repo root (with `ALCHEMY_API_KEY` set for smoke):

```bash
yarn test:aave
yarn next:check-types
yarn next:lint
yarn next:build
yarn aave:smoke
```

---

## 8. Next reading

| Doc | When |
|-----|------|
| [AAVE_SEPOLIA.md](./AAVE_SEPOLIA.md) | Hook API, address book, known limitations |
| [Scaffold-ETH 2 docs](https://docs.scaffoldeth.io) | Hooks, components, general SE-2 patterns |
| README Quickstart (`yarn chain` / `yarn deploy`) | Only if you want a **local** Hardhat playground — not required for Aave Sepolia |

**Reminder:** Sepolia test EURS is a prototype asset only. It is **not** NZDD and **not** production.
