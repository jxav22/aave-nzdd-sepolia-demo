# Engineering Handover — NZD Lending Prototype → Product

**Audience:** a frontend / data engineer taking this over to build a product.
**Written:** 25 Jul 2026, reconciled against live Sepolia reads at block **11,346,539**.

You are inheriting a **working technical prototype**, not a product. The hard, risky part —
a real Aave V3 market denominated in a NZD-labelled asset, with live Chainlink price feeds
and a deterministic risk engine on top — is **done and running on Sepolia**. What does not
exist is a product: no consumer UI, no onboarding, no yield/APY surface, no analytics, and
no indexed history.

This document tells you exactly what is real, what is stale in the other docs, what blocks
you on day one, and the order I would build in.

---

## Contents

1. [What this actually is](#1-what-this-actually-is)
2. [Verified live state](#2-verified-live-state)
3. [Read this before you trust the other docs](#3-read-this-before-you-trust-the-other-docs)
4. [Day-one blockers](#4-day-one-blockers)
5. [Repository map](#5-repository-map)
6. [The integration seam](#6-the-integration-seam)
7. [The data layer](#7-the-data-layer)
8. [Product gap analysis](#8-product-gap-analysis)
9. [Suggested build order](#9-suggested-build-order)
10. [Runbooks](#10-runbooks)
11. [Traps](#11-traps)
12. [Open questions for whoever owns this](#12-open-questions-for-whoever-owns-this)

---

## 1. What this actually is

A **Scaffold-ETH 2 monorepo** whose product surface is entirely in `packages/nextjs`. It is
a frontend + API client for a **private Aave V3 market deployed on Ethereum Sepolia**.

Three things are stacked here, and it is worth keeping them separate in your head:

| Layer | What it is | Maturity |
| :--- | :--- | :--- |
| **The market** | A real, private Aave V3 deployment on Sepolia with three reserves: `dNZD` (mock NZD stable, 6dp), `wETH` (18dp), `wBTC` (8dp). Deployed from the **sibling repo** `aave-v3-origin`, not from here. | Live, correctly configured, under-seeded |
| **The dApp** | `/mnzd` — a technical panel over that market: approve, supply, withdraw, borrow, repay, wrap ETH, owner-mint faucet. | Functional prototype, developer-facing |
| **The risk product** | A deterministic borrow stress-tester (no LLM) that combines the Aave oracle with public Binance ETH market data, exposed as both UI and a documented public REST API. | The most product-ready thing in the repo |

**There are no custom Solidity contracts in this repo.** `packages/hardhat` contains stock
`YourContract` boilerplate and `deployedContracts.ts` is literally `{}`. You will not run
`yarn chain` or `yarn deploy` for any product work. Ignore that half of the monorepo.

### The intended product story

A New Zealander holds crypto and wants NZD liquidity without selling. They post wETH as
collateral and borrow dNZD against it. Suppliers of dNZD earn interest from those borrowers.
It is Aave, denominated in NZD instead of USD.

That story is **one transaction away from being demonstrable** (see §4), and a long way from
being a product (see §8).

---

## 2. Verified live state

Everything in this section I read directly from Sepolia at block 11,346,539 while writing
this document. It supersedes every address and status table in `docs/BUILD_PLAN.md`.

### Market

| Item | Value |
| :--- | :--- |
| Chain | Ethereum Sepolia (`11155111`) |
| Market ID | `Web3NZ Hackathon dNZD Market` |
| Pool | `0xe1556e1f65Aa99682e96Ad3de866f446D2A1275e` |
| PoolAddressesProvider | `0x4e8a83e4061a9A3EC26f575f918C1CDb8775291b` |
| AaveOracle | `0x809779d09cB0B9F85D191761Ef4a0a0076eED429` |
| ProtocolDataProvider | `0x59d373bfc3E4c7c0813eE81566Fcf91C37f55D35` |
| ACLManager | `0xaed9938445b4fa4E9cA72b96C7B977d08298a971` |
| WrappedTokenGateway | `0x2Ac0b0B36CD831d71D315AF868429C312d1C5B52` |
| **Owner / ACL admin / token owner** | **`0x1bE00A54aF36eDF41f169258eCF27574EB61F10f`** |

`Pool.getReservesList()` returns exactly the three assets in
`packages/nextjs/config/hackathon-market.json`. The committed config and the chain agree.

### Reserves — all three identically configured

LTV **82.50%** · liquidation threshold **86.00%** · liquidation bonus **5%** · reserve factor
**10%** · collateral enabled · borrowing enabled · active · not frozen · **supply and borrow
caps both `0` (uncapped)**.

| | dNZD (6dp) | wETH (18dp) | wBTC (8dp) |
| :--- | :--- | :--- | :--- |
| Underlying | `0x9c6ed608…9416F` | `0xA9e6db07…2B508` | `0x82Ae4041…94a12` |
| Token total supply | 2,000,000 | 1.5 | 100,100 |
| **Supplied to pool (aToken)** | **0** | **1** | **100** |
| Borrowed (variable debt) | 0 | 0 | 0 |
| Oracle price (8dp base) | **1.00** | **1,853.80** | **63,915.57** |
| Price feed | `0x8EBF44cb…a424C` — **mock**, constant | `0x694AA176…25306` — **real Chainlink `ETH / USD`** | `0x1b44F351…51Ee43` — **real Chainlink `BTC / USD`** |
| How to get it | owner `mint` | wrap Sepolia ETH via this market's own WETH9 | owner `mint` |

### The admin wallet's position

`0x1bE00A54…F10f` currently holds and has supplied:

| Asset | In wallet | Supplied as collateral |
| :--- | :--- | :--- |
| dNZD | **1,000,000** | **0** |
| wETH | 0.5 | 1 |
| wBTC | 0 | 100 |

So roughly **US$6.39M of collateral is posted** (1 wETH ≈ $1,854 plus 100 wBTC ≈ $6.39M) and
**zero dNZD is available to borrow**.

### What this means

1. **The crypto oracles are real and live.** wETH reads $1,853.80 from Chainlink while Binance
   independently reports ETH at $1,851.52 — a 0.12% gap. This is a genuine improvement over the
   market described in `BUILD_PLAN.md`, which used constant mock feeds at $1,800/$27,000. Your
   risk scenarios are now coherent with what the protocol actually prices.
2. **Prices now move on their own.** Real feeds drift, so health factors change between page
   loads and a scripted demo can behave differently each run. Design for it.
3. **dNZD is still a constant $1 mock**, and that is the remaining pricing defect (§4.2).
4. **Nothing has ever been borrowed on this market.** Total debt across all three reserves is
   zero. Every borrow-side code path is written but unproven against this pool.

---

## 3. Read this before you trust the other docs

**This file (§2) and `packages/nextjs/config/hackathon-market.json` are the address / liquidity
source of truth.** Other docs were reconciled on 25 Jul 2026 against the current market.

| Doc | Trust it for | Caveat |
| :--- | :--- | :--- |
| `docs/HANDOVER.md` (this file) | Live state, blockers, product gaps, build order | Re-run `yarn risk:smoke` if balances may have changed |
| `README.md` | Quickstart and doc index | Points here for blockers |
| `docs/API.md` | Public API surface | Accurate |
| `docs/BORROW_RISK_ASSISTANT.md` | Risk methodology, demo script | Accurate; seeding section matches current liquidity story |
| `docs/AAVE_HACKATHON_MNZD.md` | `/mnzd` runbook + address table | Accurate |
| `docs/AAVE_SEPOLIA.md` | Official EURS reference (`/aave`) | Secondary path — hidden from nav |
| `docs/WEB2_HANDOFF.md` | Web2→web3 onboarding for `/mnzd` | Primary path is dNZD, not EURS |
| `docs/BUILD_PLAN.md` | Product framing, pitch honesty, active seam | Live addresses/status aligned with this file; superseded-market history in its §17 |

### Historical footnote (superseded market)

An earlier private market used **mNZD**, pool `0xB0ce6154…CC69`, admin `0x3C51…e434`, and
mock ETH/BTC aggregators. Frontend was pointed at the current deployment in commit
`02bbbc7`. Do not cite old tx hashes or that pool as evidence about today’s market.

---

## 4. Day-one blockers

### 4.1 The dNZD reserve has zero liquidity — nothing can be borrowed

This is the single blocker for the entire product story. `dNZD` aToken total supply is `0`,
so `Pool.borrow(dNZD, …)` reverts for everyone, always, regardless of collateral. The
`risk:smoke` script says so explicitly:

> Note: the dNZD reserve holds no liquidity, so borrowing will revert until the market is seeded.

**The fix is two transactions from a key that already holds the tokens.** The admin wallet
holds 1,000,000 dNZD:

```
dNZD.approve(pool, amount)         // from 0x1bE00A54…F10f
Pool.supply(dNZD, amount, 0x1bE00A54…F10f, 0)
```

You can do this through the existing `/mnzd` UI — connect the admin wallet, dNZD tab, Approve,
Supply. No new code. **Do this first**; almost nothing else you build is testable until you
have.

Whoever holds that private key is a hard dependency. Confirm that before you plan anything.

### 4.2 dNZD is priced at US$1, not NZ$1

The oracle base unit is 8-decimal USD (wETH and wBTC are quoted in USD by real Chainlink
feeds). dNZD's mock feed returns `1.00`, which the protocol therefore reads as **US$1** — but
dNZD is meant to represent **NZ$1**.

Every cross-asset number is consequently wrong in the product's own unit. At a NZD/USD rate
around 0.60, borrowing capacity against crypto collateral is **understated by roughly 40%**:
1 wETH × 82.5% LTV shows as 1,529 dNZD when the NZD-correct answer is about 2,549.

Two ways out, both requiring the admin key and an `AaveOracle.setAssetSources` call from the
sibling repo:

- **Re-price dNZD to ~0.60e8.** One mock aggregator deploy plus one admin call. The account
  view stays USD-denominated — an NZD product reporting in USD.
- **Re-denominate the whole market into NZD.** Wrap the Chainlink ETH/USD and BTC/USD feeds in
  adapters that divide by a NZD/USD rate. More work, and you lose the "it's a real Chainlink
  feed" talking point unless the adapter is clean, but the entire account view then reads in
  NZD, which is the actual product.

Note that same-asset flows (supply dNZD, borrow dNZD) are unaffected — the price cancels on
both sides.

**Frontend consequence, independent of which fix:** `AaveMarketPanel.tsx` line 93 hardcodes
the label `Available to borrow (USD base)`. That is the only string in the codebase tied to
the reference currency.

```93:95:packages/nextjs/components/aave/AaveMarketPanel.tsx
          <div className="opacity-70">Available to borrow (USD base)</div>
          <div className="font-mono text-lg">{isReading ? "…" : formatAaveBaseAmount(availableBorrowsBase)}</div>
        </div>
```

### 4.3 There is no way for a user to obtain dNZD

`mint` is `onlyOwner`. A visitor cannot get test NZD without someone manually minting to
them. Any multi-user demo, user test, or public deployment needs one of: an open faucet
contract, a relayer endpoint that mints on request (which weakens the non-custodial claim —
see `BUILD_PLAN.md` §13, still accurate on this point), or pre-minting to a known list.

### 4.4 100 wBTC of collateral looks like test data, because it is

The admin has US$6.39M of wBTC posted. Any "available to borrow" figure derived from it is
absurd on its face. Before showing this to anyone, either withdraw most of the wBTC or demo
from a second wallet with a realistic position.

---

## 5. Repository map

```
packages/nextjs/                    ← the entire product
  app/
    mnzd/page.tsx                   ← PRIMARY product page
    aave/page.tsx                   ← official Aave Sepolia EURS reference, hidden from nav
    developer-api/page.tsx          ← interactive playground for the public API
    binance-chat/page.tsx           ← LLM chat demo over the public API, needs OPENAI_API_KEY
    api/v1/**                       ← the public REST API
    page.tsx                        ← still the stock Scaffold-ETH landing page
    debug/, blockexplorer/          ← Scaffold defaults; blockexplorer is localhost-only
  components/aave/
    AaveMarketPanel.tsx             ← shared supply/borrow panel, both markets
    BorrowRiskAssistant.tsx         ← risk UI, calls the API, never writes on-chain
  hooks/aave/
    useAaveHackathonMnzd.ts         ← all /mnzd contract interaction
    useAaveSepolia.ts               ← the EURS reference path
  services/
    aave/readPosition.ts            ← server-side viem multicall position read
    risk/assistant.ts               ← report assembly (deterministic, no LLM)
    risk/simulate.ts                ← stateless BYO-position simulation
    binance/ethMarket.ts            ← ETH price + volatility, 60s cache
    binance/tokenInfo.ts            ← query-token-info search / dynamic / meta
    agent/apiTools.ts               ← turns the OpenAPI doc into the chat agent's tools
    agent/chat.ts                   ← chat turn: tool loop over /api/v1 + follow-up prompts
    api/{respond,validate,rateLimit,openapi}.ts
  utils/
    aave/{amount,errors}.ts         ← unit parsing, Aave revert-code mapping
    risk/{stress,wording}.ts        ← pure bigint HF maths; disclaimer/wording guards
  config/
    hackathon-market.json           ← THE address source of truth
    aaveHackathonMnzd.ts            ← parses + validates that JSON at import time
  contracts/
    externalContracts.ts            ← registers Aave contracts for Scaffold hooks
    abis/aaveSepolia.ts             ← hand-written minimal ABIs
    deployedContracts.ts            ← {} — nothing is deployed from this repo

packages/hardhat/                   ← stock boilerplate. Not part of the product
.agents/skills/                     ← ~30 vendored Binance agent skills, mostly unused
```

`.agents/skills/` is worth a note: the last two commits (`7627d82`, `c2dec26`, the second
literally titled "more binance agent skills bloat") vendored a large tree of Binance skill
definitions. Only `query-token-info` is actually used, by `services/binance/`. The rest is
dead weight you can delete without consequence.

---

## 6. The integration seam

### Contract names registered for Scaffold hooks

Use these names with `useScaffoldReadContract` / `useScaffoldWriteContract`; they are wired in
`contracts/externalContracts.ts`.

| Name | Role |
| :--- | :--- |
| `HackathonPool` | The Aave V3 Pool |
| `HackathonMnzd` / `HackathonWeth` / `HackathonWbtc` | Underlying ERC-20s |
| `HackathonATokenMnzd` / `…Weth` / `…Wbtc` | Supply receipts |
| `HackathonDebtMnzd` / `…Weth` / `…Wbtc` | Variable debt tokens |
| `HackathonWrappedTokenGateway` | Wrap ETH and supply in one transaction |

Deprecated aliases `HackathonAToken` and `HackathonVariableDebt` still exist and point at the
dNZD tokens. Prefer the explicit per-asset names.

### Writes

| Action | Call |
| :--- | :--- |
| Mint dNZD / wBTC | `mint(to, amount)` — **owner only** |
| Wrap ETH | `HackathonWeth.deposit()` payable — this market's own WETH9 |
| Approve | `underlying.approve(pool, amount)` |
| Supply | `Pool.supply(asset, amount, onBehalfOf, 0)` |
| Supply ETH in one tx | `Gateway.depositETH(pool, onBehalfOf, 0)` payable |
| Withdraw | `Pool.withdraw(asset, amount, to)` — full exit uses `maxUint256` |
| Borrow | `Pool.borrow(asset, amount, 2, 0, onBehalfOf)` — variable rate only |
| Repay | `Pool.repay(asset, amount, 2, onBehalfOf)` — full uses `maxUint256`, approve first |

Approve and supply/repay are deliberately **never auto-chained**, except the gateway path.
Whether to keep that is a product decision (§8).

### Units — the thing that will bite you

| Quantity | Units |
| :--- | :--- |
| dNZD | **6 decimals** |
| wETH | 18 decimals |
| wBTC | **8 decimals** |
| EURS (reference path only) | **2 decimals** |
| Health factor | WAD, `1e18` = 1.0. No debt → `maxUint256`, display as `∞` |
| Collateral / debt / `availableBorrowsBase` | **8 decimals**, base currency currently USD |

Do not do this arithmetic by hand. `utils/aave/amount.ts` and `utils/risk/stress.ts` already
handle it in `bigint` throughout, and `utils/risk/stress.test.ts` covers the edge cases.

### The public API

Nine routes under `/api/v1`, fully documented in `docs/API.md` with an OpenAPI 3.1 spec at
`/api/v1/openapi.json`. Shared envelope `{ ok, schemaVersion, data | error }`, open CORS,
in-memory per-IP rate limiting, and chain quantities as `{ raw, decimals, formatted }` decimal
strings rather than JSON numbers.

| Route | Purpose |
| :--- | :--- |
| `GET /borrow-risk` | Full report for an address against this market |
| `POST /borrow-risk/simulate` | Stateless, bring-your-own-position. No RPC, no wallet |
| `GET /position/{address}` | Raw Aave read, including the liquidation threshold the UI hooks discard |
| `GET /market/eth` | Binance ETH context and derived scenarios. No RPC involved |
| `GET /binance/token/search` | Proxy to the public Binance token search |
| `GET /binance/token/dynamic` | Live price, volume, liquidity and holders for one token |
| `GET /binance/token/meta` | Name, decimals, website and socials for one token |
| `GET|POST /binance/chat` | LLM chat demo whose tools are the routes above |
| `GET /openapi.json` | Spec |

Three design decisions here are worth preserving because they are better than they look:

- **The chat agent's tools are generated from the OpenAPI document and called over HTTP.**
  `services/agent/apiTools.ts` reads `buildOpenApiDocument()`, so a documented operation
  becomes a tool with no further work, and the agent can only do what the published contract
  does. Operations opt out with `x-agent-tool: false` and supply a starter prompt with
  `x-agent-example`.
- **Binance being unreachable is not an error.** The response degrades to fixed reference
  shocks with `degraded: true` so an integrator's tool keeps working. Surface that flag.
- **`selfCheck`** recomputes the health factor from decomposed collateral legs and compares it
  to Aave's own. When `matches` is false, the risk model disagrees with the protocol and the
  scenarios should not be trusted. That is a real correctness guard — keep it wired to the UI.

---

## 7. The data layer

You are a data engineer, so: **there isn't one.** This is the largest greenfield area and
probably where you add the most value.

### What exists

Live RPC reads only. `services/aave/readPosition.ts` does a single viem `multicall` per
request — account data, three oracle prices, three reserve configs, three aToken balances,
debt, and pool liquidity. It is clean, correct, and about as good as a stateless read gets.

`services/binance/ethMarket.ts` pulls ETH spot and 31 daily candles from public Binance
endpoints, computes daily sigma and 30-day max drawdown, and caches for 60 seconds.

### What does not exist

- **No indexer.** No subgraph, no Ponder, no database. Skills for both are vendored under
  `.agents/skills/` but neither is integrated.
- **No historical data at all.** Every number is "right now". You cannot render a position
  over time, a TVL chart, a rate history, or a user count.
- **No aggregate market reads.** Nothing calls `getReserveData`, so supply APY, borrow APY and
  utilisation are invisible in the UI. For a product whose story is "suppliers earn interest
  from borrowers", this is a conspicuous hole.
- **No charting library.** Nothing in `package.json` — no Recharts, Chart.js or D3. Greenfield.
- **Rate limiting is per-instance memory**, so it does not survive serverless fan-out. Fine for
  a demo, not a quota.

### What I would build

The events you need are already emitted — Aave's `Supply`, `Withdraw`, `Borrow`, `Repay`,
`ReserveDataUpdated` on `0xe1556e1f…275e`. Nothing on-chain needs to change to start indexing.

1. **Read `getReserveData` on the client first.** Supply APY, borrow APY and utilisation, live,
   no infrastructure. This is a few hours and it makes the yield story visible, which is the
   single highest-value data change available.
2. **Then index events.** Ponder is the better fit than a subgraph here: TypeScript, its own
   Postgres, and it runs alongside Next.js without the Graph Node overhead. Start with the four
   Pool events and `ReserveDataUpdated`. That gives you TVL over time, rate history, unique
   suppliers and borrowers, and per-user position history.
3. **Snapshot rates on a schedule.** APY is a spot read; a chart needs a time series. A cron
   writing `ReserveDataUpdated`-derived rates hourly is enough.
4. **Then the dashboard.** TVL, utilisation, rate curves, unique users, and a position history
   view. This is also what makes the product legible to a non-crypto audience.

Do not let anyone deploy the indexer against `0xB0ce6154…CC69`. That is the superseded pool.

---

## 8. Product gap analysis

What is genuinely production-shaped:

- The risk engine and its API. Pure `bigint` maths, well tested, honest about its limits, with
  a documented spec and disclaimers enforced in `utils/risk/wording.ts`. This is the best code
  in the repo and could be published as-is.
- Contract wiring and unit handling. Correct, tested, and centralised.
- The config-validates-at-import pattern in `aaveHackathonMnzd.ts` — a bad address file fails
  the build rather than producing a subtly wrong UI.

What is prototype-only:

| Gap | Detail |
| :--- | :--- |
| **The UI is a developer panel** | `/mnzd` exposes aTokens, allowances, variable debt tokens and raw addresses. A consumer sees "Wallet dNZD / Allowance / Supplied (aToken) / Borrowed (variable debt)". It needs an NZD-denominated shell with the mechanics behind a "technical details" toggle |
| **Home page is stock Scaffold-ETH** | `app/page.tsx` is untouched boilerplate. First impression is "someone's demo repo" |
| **Two-transaction Earn** | Approve then supply, both user-confirmed, no sequencing UI. At minimum, sequence them behind one button with clear progress. EIP-5792 batching is an option — there is a vendored skill for it |
| **No APY or utilisation anywhere** | See §7 |
| **Onboarding / gas** | Privy email + wallet + social login is implemented when `NEXT_PUBLIC_PRIVY_APP_ID` is set (embedded wallets + iron-session). Without it, RainbowKit remains. Gas sponsorship still not implemented. Users still need Sepolia ETH and someone to mint dNZD |
| **No error recovery UX** | `utils/aave/errors.ts` maps Aave revert codes to messages, which is good, but there is no guided recovery |
| **No mobile design pass** | DaisyUI responsive defaults only |
| **No analytics or telemetry** | Nothing measures whether anyone completes a flow |
| **`/aave` is orphaned** | The EURS reference path still exists, unlinked. Either delete it or give it a purpose |

---

## 9. Suggested build order

**Phase 0 — unblock (hours, needs the admin key)**

1. Seed dNZD liquidity (§4.1). Nothing else is testable first.
2. Execute wETH → borrow dNZD → repay → withdraw once end to end, and record the hashes.
   Until that exists, the core product story is unproven on this pool.
3. Decide the oracle denomination (§4.2) and fix the `USD base` label to match.
4. Reduce the admin's 100 wBTC position, or demo from a clean second wallet.
5. Keep `BUILD_PLAN.md` / this handover aligned when addresses or liquidity change.

**Phase 1 — make it legible (days)**

6. Surface supply APY, borrow APY and utilisation from `getReserveData`.
7. Consumer shell on `/mnzd`: NZD copy, plain-language balances, technical details collapsed.
8. Sequence approve→supply behind one button with real progress states.
9. Replace the stock home page.

**Phase 2 — make it usable by someone who is not you (weeks)**

10. Solve dNZD distribution (§4.3) — open faucet or relayer.
11. Onboarding: embedded wallet and gas sponsorship, so a user needs neither a wallet nor
    Sepolia ETH.
12. Mobile pass, error recovery, empty states.

**Phase 3 — the data product (weeks)**

13. Ponder indexer over the four Pool events plus `ReserveDataUpdated`.
14. Rate snapshotting.
15. Dashboard: TVL, utilisation, rate history, unique users, position history.
16. Position monitoring and health factor alerting — the natural extension of the risk engine
    from one-shot assessment to ongoing, which is where it becomes a product rather than a
    calculator.

---

## 10. Runbooks

### Start

```bash
yarn install
# packages/nextjs/.env.local:
#   ALCHEMY_API_KEY=...
#   NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=...
#   OPENAI_API_KEY=...   # only for /binance-chat
#   # Production auth (optional locally; required for Privy on deploy):
#   NEXT_PUBLIC_PRIVY_APP_ID=...
#   PRIVY_APP_SECRET=...
#   IRON_SESSION_SECRET=...   # 32+ chars
yarn start                       # → http://localhost:3000/mnzd
```

Defaults for the Alchemy key and WalletConnect project ID are committed in
`scaffold.config.ts`, so it runs without `.env.local` — but they are shared and rate-limited.
Get your own.

**Privy Dashboard (when enabling production auth):** create an app at
[dashboard.privy.io](https://dashboard.privy.io); enable Email, Wallet, Google, Apple, Twitter/X;
allow `localhost:3000` and the production domain; enable Ethereum embedded wallets. With
`NEXT_PUBLIC_PRIVY_APP_ID` set, the header uses Privy Sign in (not RainbowKit). Server session is
`POST/GET/DELETE /api/auth/session` (Privy JWT → iron-session cookie).

**Embedded wallet private key export:** users with a Privy-created Ethereum embedded wallet can
export via the account dropdown → **Export private key**. That opens a warning, then Privy’s
cross-origin `exportWallet` modal (key never touches our app origin). No dashboard toggle is
required — export is enabled by default unless a DENY policy is set. External wallets (e.g.
MetaMask) do not show this item. Do not add a server-side export path with `PRIVY_APP_SECRET`
for these client-created wallets. Optional hardening later: enable wallet MFA in Privy Dashboard
→ User management → MFA.

`NEXT_PUBLIC_PRIVY_APP_ID` is inlined at **build time** — set it on Vercel before
`yarn vercel:yolo --prod`, not only as a runtime secret after the build.

**Do not run `yarn chain` or `yarn deploy`.** They only touch the boilerplate Hardhat contract.

### Checks

```bash
yarn test:aave                   # Vitest unit + API route suite
yarn next:check-types
yarn next:lint
yarn aave:smoke                  # read-only check of the official EURS market
cd packages/nextjs && yarn risk:smoke   # live position + Binance + stress engine
```

`yarn risk:smoke` is the fastest way to confirm the market is alive and see its real state —
it prints pool, oracle, block, prices, liquidity and a stress table. Run it first whenever
something looks wrong. Note it is only wired at the `packages/nextjs` level, not the root.

Live write tests exist but are opt-in and need funded keys:

```bash
AAVE_E2E=1 E2E_PRIVATE_KEY=0x… yarn aave:e2e
```

### Changing the market addresses

If `aave-v3-origin` redeploys:

1. Copy its `reports/hackathon-market.json` over `packages/nextjs/config/hackathon-market.json`
2. Restart Next.js — the config validates at import, so a bad file fails loudly
3. `yarn test:aave`
4. `cd packages/nextjs && yarn risk:smoke` to confirm against the chain
5. Update §2 of this document

### Deploy

```bash
yarn vercel:yolo --prod
```

Before any public deployment: `OPENAI_API_KEY` is spent by unauthenticated `POST`s to
`/api/v1/binance/chat`, and CORS is `*` across the whole API. Either gate that route or drop it.

---

## 11. Traps

- **Prefer this file + `hackathon-market.json` over memory.** Older chat/docs may still say
  `mNZD` or pool `0xB0ce…CC69` — that market is gone.
- **This market has its own WETH9** at `0xA9e6db07…2B508`. It is neither canonical Sepolia WETH
  nor Aave's official Sepolia WETH. ETH wrapped anywhere else is useless here. Users must wrap
  through this contract or the gateway.
- **`ALCHEMY_API_KEY` is exposed client-side** via `next.config.ts`. Intentional in this
  template, but it means the key is public. Do not reuse a key that has anything else on it.
- **dNZD is 6 decimals, wBTC is 8.** Neither is 18. Assuming 18 anywhere produces silently
  wrong numbers rather than errors.
- **Health factor is `maxUint256`, not zero, when there is no debt.** Render `∞`.
- **`availableBorrowsBase` is not liquidity.** A borrow within your capacity still reverts if
  the reserve is empty — which, right now, it always is. Check `borrowAsset.poolLiquidity`.
- **Real Chainlink feeds move.** Health factors will differ between runs. Do not script a demo
  around an exact number.
- **`.agents/skills/` is ~30 vendored skill trees and mostly dead.** Only `query-token-info` is
  used. Do not assume the rest is load-bearing.
- **The risk API's own rules are in `docs/API.md` under "Requirements for clients"** — render
  the disclaimer, never relabel `stressTestedMaximum` as "safe", keep Aave authoritative. They
  apply to your own UI too, and `utils/risk/wording.ts` has tests enforcing forbidden phrasing.
  If you are building consumer copy, read that file before you write marketing language.

---

## 12. Open questions for whoever owns this

1. **Who holds `0x1bE00A54…F10f`?** It is market owner, ACL admin, and token minter. Every
   blocker in §4 needs it. This is a single point of failure and it is not documented anywhere.
2. **NZD or USD reference currency?** §4.2. This decides an oracle change, a UI label, and
   whether the product's core numbers are in its own unit.
3. **Is dNZD staying a mock?** The name gestures at NewMoney's dNZD but this is an unrelated
   owner-mintable stand-in. A real issuer integration changes the distribution problem (§4.3)
   entirely.
4. **Testnet or mainnet?** Everything here is Sepolia. A mainnet product needs a real NZD
   stablecoin, real liquidity, and an Aave listing or a permissioned market — a different
   project, not a port.
5. **Is the Borrow Risk API a product on its own?** It is the most finished thing here, it works
   against any Aave-compatible position via `simulate`, and it has no dependency on the NZD
   story. It may be more valuable standalone than as a feature of this dApp.
