# Web2 Engineer Handoff

For engineers comfortable with React / Next.js who are new to crypto. Gets you from clone → running the **hackathon dNZD market** → knowing which files to edit.

| Doc | When |
|-----|------|
| [HANDOVER.md](./HANDOVER.md) | Live market state, blockers, product gaps — **read first** |
| [AAVE_HACKATHON_MNZD.md](./AAVE_HACKATHON_MNZD.md) | `/mnzd` runbook, assets, e2e |
| [AAVE_SEPOLIA.md](./AAVE_SEPOLIA.md) | Official EURS reference at `/aave` (secondary, hidden from nav) |
| [API.md](./API.md) / [BORROW_RISK_ASSISTANT.md](./BORROW_RISK_ASSISTANT.md) | Public risk API |

---

## 1. What you’re building

This repo is a **Scaffold-ETH 2** frontend (+ small Next.js API) for a **private Aave V3 market on Ethereum Sepolia** with three reserves: **wETH**, **wBTC**, and **dNZD** (demo NZD stable).

Primary page: **`/mnzd`** (nav: Hackathon Market).

A connected wallet can:

1. Wrap Sepolia ETH into this market’s wETH (or Supply ETH in one tx)
2. Mint wBTC / dNZD **if** you hold the token-owner key (owner faucet on the page)
3. **Approve** → **Supply** collateral or liquidity
4. **Borrow** dNZD against crypto collateral (once the dNZD reserve has liquidity)
5. Use the **Borrow Risk Assistant** before borrowing (read-only; no tx)
6. **Repay** / **Withdraw**

This is a **frontend + API** integration. Custom Aave contracts are **not** deployed from this repo (they live in sibling `aave-v3-origin`). Skip `yarn chain` / `yarn deploy` for product work.

| This is | This is not |
|---------|-------------|
| Sepolia **test** assets | Real money or mainnet |
| **dNZD** demo stand-in | Production NewMoney / **NZDD** |
| Private Aave V3 market + official EURS reference | An official Aave-listed NZD market |

---

## 2. Web2 → Web3 mental model

| Web3 term | Rough web2 analogy |
|-----------|-------------------|
| **Wallet** (e.g. MetaMask) | Signed-in identity + private keystore. User confirms every write. |
| **Network / chain ID** | Environment. Sepolia (`11155111`) ≈ staging. |
| **RPC** (Alchemy) | Backend API to read chain state and submit transactions. |
| **Transaction** | User-confirmed “POST” that costs **gas** (Sepolia ETH) and can fail on-chain. |
| **Approve** then **supply** | Grant spend permission, then execute — **two separate confirms** (unless Supply ETH gateway). |
| **Allowance** | How much the Pool may pull from the user’s token balance. |
| **aToken balance** | Receipt for supplied amount; can grow with interest. |
| **Health factor** | Over-collateralisation score. Below 1.0 → liquidation risk. No debt → ∞. |
| **dNZD decimals = 6** | Like USDC-style units, not 18-decimal ETH. **wBTC = 8**. |

You are not calling a REST API you own for lend/borrow. The “backend” for market actions is public smart contracts on Sepolia; Next.js also exposes a **read-only** risk/market API under `/api/v1`.

---

## 3. Day-1: run the demo

### Prerequisites

- [Node.js](https://nodejs.org/en/download/) **≥ 22.10.0**
- [Yarn 4](https://yarnpkg.com/getting-started/install)
- [Git](https://git-scm.com/downloads)
- Browser wallet on **Ethereum Sepolia**

### Environment

Copy `packages/nextjs/.env.example` → `packages/nextjs/.env.local`:

```env
ALCHEMY_API_KEY=
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=
# OPENAI_API_KEY=          # only for /binance-chat
# OPENAI_MODEL=gpt-4o-mini
```

| Variable | Where |
|----------|--------|
| `ALCHEMY_API_KEY` | [Alchemy](https://www.alchemy.com/) → Ethereum Sepolia app |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | [WalletConnect Cloud](https://cloud.walletconnect.com/) |

`ALCHEMY_API_KEY` is exposed client-side via `next.config.ts` (template convention). Defaults exist in `scaffold.config.ts` for quick prototyping.

### Install and start

```bash
yarn install
yarn start
```

Open **http://localhost:3000/mnzd** (not `/aave` — that is the secondary EURS reference).

### Connect on Sepolia

1. Connect wallet → network **Ethereum Sepolia** (`11155111`)
2. Or use **Switch to Sepolia** on the page

### Get Sepolia ETH (gas)

Use a public Sepolia faucet. Needed for every write.

### Get assets

| Asset | How |
|-------|-----|
| **wETH** | Wrap on the wETH tab, or **Supply ETH** (gateway) |
| **wBTC** / **dNZD** | Owner faucet on the page — only the token owner can mint |

If you are not the owner, someone with the admin key must mint dNZD/wBTC to you. See [HANDOVER §4.3](./HANDOVER.md#43-there-is-no-way-for-a-user-to-obtain-dnzd).

### Walk the happy path (once liquidity exists)

1. **wETH tab** — Supply ETH as collateral  
2. **dNZD tab** — (admin) mint + supply liquidity so others can borrow  
3. Enter a borrow amount; read the **Borrow Risk Assistant** panel  
4. Borrow → repay → withdraw  

If borrow reverts with liquidity errors, the dNZD reserve is empty — seed it first (`yarn risk:smoke` prints `dNZD pool liquidity`).

---

## 4. Where the code lives

| If you want to change… | Edit |
|------------------------|------|
| Hackathon page | [`packages/nextjs/app/mnzd/page.tsx`](../packages/nextjs/app/mnzd/page.tsx) |
| Supply/borrow UI panel | [`packages/nextjs/components/aave/AaveMarketPanel.tsx`](../packages/nextjs/components/aave/AaveMarketPanel.tsx) |
| Risk UI | [`packages/nextjs/components/aave/BorrowRiskAssistant.tsx`](../packages/nextjs/components/aave/BorrowRiskAssistant.tsx) |
| Contract writes / reads | [`packages/nextjs/hooks/aave/useAaveHackathonMnzd.ts`](../packages/nextjs/hooks/aave/useAaveHackathonMnzd.ts) |
| Market addresses | [`packages/nextjs/config/hackathon-market.json`](../packages/nextjs/config/hackathon-market.json) |
| Scaffold contract names | [`packages/nextjs/contracts/externalContracts.ts`](../packages/nextjs/contracts/externalContracts.ts) |
| Amounts / Aave errors | [`packages/nextjs/utils/aave/`](../packages/nextjs/utils/aave/) |
| Public API routes | [`packages/nextjs/app/api/v1/`](../packages/nextjs/app/api/v1/) |
| Target chain | [`packages/nextjs/scaffold.config.ts`](../packages/nextjs/scaffold.config.ts) |

Official EURS path (secondary): `app/aave/page.tsx` + `useAaveSepolia.ts` + `aaveSepolia.ts`.

---

## 5. How to extend safely

- Prefer **`useAaveHackathonMnzd`** from UI code; do not re-implement Pool calls.
- Keep **approve** and **supply/repay** as separate user confirms (except gateway ETH).
- Do **not** hardcode addresses in components — load from `hackathon-market.json` / typed config.
- Use Scaffold-ETH hooks: `useScaffoldReadContract`, `useScaffoldWriteContract`.
- Surface errors with `notification` / `getParsedError` from `~~/utils/scaffold-eth`.
- For risk copy, respect `utils/risk/wording.ts` (forbidden phrases are tested).

```tsx
import { useAaveHackathonMnzd } from "~~/hooks/aave/useAaveHackathonMnzd";

const { state, approve, supply, borrow, repay, wrapEth, supplyEth, mint, refresh } =
  useAaveHackathonMnzd("wETH"); // or "wBTC" | "dNZD"
```

---

## 6. Common failures

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| Wrong network / empty reads | Not on Sepolia | Switch to `11155111` |
| Tx fails / insufficient funds | No Sepolia ETH | Faucet gas |
| Cannot mint dNZD/wBTC | Not token owner | Ask admin to mint to you |
| Borrow reverts | dNZD pool liquidity 0 | Admin supplies dNZD; check `yarn risk:smoke` |
| Wrapped “WETH” useless | Used canonical Sepolia WETH | Wrap via **this** market’s WETH9 / gateway |
| Allowance too low | Approve not done | Approve exact amount, then supply/repay |
| RPC rate limits | Shared Alchemy key | Use your own `ALCHEMY_API_KEY` |
| Weird borrow capacity vs NZD story | dNZD priced as US$1 | See HANDOVER §4.2 |

---

## 7. Verification commands

```bash
yarn test:aave
yarn next:check-types
yarn next:lint
yarn next:build
yarn aave:smoke
cd packages/nextjs && yarn risk:smoke
```

---

## 8. Next reading

| Doc | When |
|-----|------|
| [HANDOVER.md](./HANDOVER.md) | Blockers, repo map, suggested build order |
| [AAVE_HACKATHON_MNZD.md](./AAVE_HACKATHON_MNZD.md) | Asset table, e2e env vars |
| [BUILD_PLAN.md](./BUILD_PLAN.md) | Pitch honesty / product framing |
| [Scaffold-ETH 2 docs](https://docs.scaffoldeth.io) | SE-2 patterns |

**Reminder:** dNZD and Sepolia EURS are prototype assets only. Not NZDD. Not production.
