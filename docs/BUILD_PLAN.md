# WEB3NZ Hackathon — Build Plan & Source of Truth

**Project:** New Zealand's version of Aave — a NZD savings & lending market, built for people who've never touched crypto.

**Team:** `[YOU]` — frontend · `[ETH DEV]` — backend / contracts
**Stack:** Scaffold-ETH 2 (monorepo) · Hardhat · Privy (email login → embedded wallet) · Sepolia testnet

> **THE ONE RULE:** This file is the single source of truth. If you change anything under **§4 The Interface** (the seam between frontend and backend), change it **here first**, then send the other person **one line** on Discord. Never change the seam silently. A 20-second "hey, `getSupplyBalance` now returns base units not dollars — updated the doc" saves an hour of "why is everything 100× too big."

---

## Implementation status (reconciled with the repo — Jul 2026)

> **How to read this doc:** Sections **§0–§15 below keep the original weekend plan** (intent, pitch, glossary, seam design). This status block and the `[STATUS]` notes sprinkled through the doc are **additive** — they describe what shipped, what was superseded, and what is still open. Prefer the status notes over unchecked boxes when they disagree.

### Architecture pivot (what we actually built)

The original plan (§5 / §9) was a **custom ~150-line `LendingPool`** + `MockDNZD` + `MockOracle` in this Hardhat package. Mid-build we pivoted to **real Aave V3 on Ethereum Sepolia**:

| Path | What it is | Route / docs |
| :--- | :--- | :--- |
| Official Aave Sepolia | Live Aave V3 Pool + test **EURS** (2 decimals). No custom deploy. | `/aave` · [AAVE_SEPOLIA.md](./AAVE_SEPOLIA.md) · [WEB2_HANDOFF.md](./WEB2_HANDOFF.md) |
| Hackathon mNZD market | Custom Aave V3 market deployed from **aave-v3-origin** (`DeployHackathonMarket`), wired into this frontend. Asset: **mNZD** (Mock NZD Stable, **6 decimals**) — not real NZDD / dNZD / zNZD. | `/mnzd` · [AAVE_HACKATHON_MNZD.md](./AAVE_HACKATHON_MNZD.md) |

**Implication for §4:** the original custom-pool seam (`LendingPool.supply`, `getSupplyAPY`, etc.) was **never implemented in this repo**. The live seam is Aave Pool `approve` → `supply` / `withdraw` (+ owner `mint` on mNZD). Keep §4 below as the *original design record*; treat the tables in **§4.10 (actual Aave seam)** as the interface the frontend uses today.

### Done

- [x] Scaffold-ETH 2 monorepo (`packages/hardhat` + `packages/nextjs`), target network **Sepolia**
- [x] Official Aave V3 Sepolia integration — `useAaveSepolia`, `/aave` page (approve / supply / withdraw EURS)
- [x] Hackathon mNZD market integration — `useAaveHackathonMnzd`, `/mnzd` page (owner mint / approve / supply / withdraw)
- [x] External contracts registered for Debug Contracts: `AaveV3Pool`, `SepoliaEURS`, `AaveSepoliaAToken`, `HackathonPool`, `HackathonMnzd`, `HackathonAToken`
- [x] Config + tests: `aaveSepolia.ts`, `aaveHackathonMnzd.ts`, `hackathon-market.json`, `yarn test:aave`, smoke check
- [x] Web2 handoff docs for the Aave path

### Partial / different from original plan

- [~] **Token faucet / “Add NZD”:** implemented as **owner-only `mint`** on `/mnzd` (not open mint, not a mocked Pay It Now screen). Official path uses the **public Aave EURS faucet** (external link).
- [~] **Balance / supply UI:** wallet + aToken balances on `/aave` and `/mnzd` — technical prototype UI, not yet a “savings account” consumer shell.
- [~] **Approve → supply:** still **two separate wallet confirmations** (by design in current docs). One-button “Earn” that chains them is **not** built.
- [~] Hardhat package still deploys stock `YourContract` only; product path does **not** need `yarn chain` / `yarn deploy`.

### Not started (still open vs original plan)

- [ ] Privy email login → embedded wallet (RainbowKit remains)
- [ ] Gas-drip endpoint for new embedded wallets
- [ ] Mocked Pay It Now “Add NZD” screen
- [ ] One-button **Earn** UX
- [ ] **Borrow** screen (ETH collateral → borrow NZD → health factor) — Aave debt token exists in hackathon JSON; UI/hooks not wired
- [ ] Live dashboard (users onboarded, total supplied, live APY via events)
- [ ] Controllable oracle price-drop / liquidation drama (`MockOracle.setEthPriceInNZD`)
- [ ] Custom Hardhat `LendingPool` / `MockDNZD` / `MockOracle` (superseded by Aave path unless we revive it)

### Deployed addresses (hackathon mNZD market — from `packages/nextjs/config/hackathon-market.json`)

```
NETWORK:                 Sepolia (chain id 11155111)
Market ID:               Web3NZ Hackathon mNZD Market
HackathonPool:           0xB0ce61547bdd38139f7F764E7171Cd048323CC69
mNZD (underlying):       0xDf40C406e03a0fA6D4bE26F96Ca3A7E6fE9baeeC   (6 decimals)
HackathonAToken:         0xA4c4E7eb3Cb6fc54CBa7b0B08549143bB7cF7DB8
PoolAddressesProvider:   0x2950597Bd526eB285b772f06654924bFa0b817f8
AaveOracle:              0x79054dbB96Ca2d091e3B157970D8A2384e1473Ef
Price feed:              0x9956e5C7994bF0d0343Cdab4025985D6B8053F44
ProtocolDataProvider:    0xb5565F196F185c74370FdE81b2422d7D5d2b2bF4
variableDebtToken:       0x0B27c6229F90ed3BA9Af911cd607198924458E6A
```

Official EURS Pool / underlying / aToken: resolved at runtime from `@aave-dao/aave-address-book` (`AaveV3Sepolia`) — see `packages/nextjs/config/aaveSepolia.ts`.

### Suggested next build order (remaining product surface)

1. Consumer shell on top of `/mnzd` (NZD copy, hide crypto jargon) — balances already exist in the hook.
2. Mocked **Add NZD** (Pay It Now) → call owner `mint` or a temporary open-mint helper.
3. Optional one-button **Earn** (still two txs under the hood; UX can sequence approve → supply).
4. **Borrow** path against Aave (collateral + `borrow` / `repay` + health factor from `getUserAccountData`).
5. Privy + gas drip if live email onboarding is still a pitch requirement.
6. Live dashboard (events / aggregates) once supply+borrow traffic exists.

---

## 0. TL;DR — read this before anything else

> **[STATUS]** The “first 90 minutes” stub path below was the original bootstrap. What exists instead: Aave V3 Sepolia UIs at `/aave` (EURS) and `/mnzd` (hackathon mNZD). Privy swap and custom stub pool were **not** done. Hardhat still has stock `YourContract` only.

- We're building a savings app (put NZD in, earn interest) with a borrow side (lock ETH, borrow NZD without selling it).
- Backend builds the smart contracts. Frontend builds the app. They meet at **§4 The Interface**.
- It's a **Scaffold-ETH monorepo**: `packages/hardhat` (contracts) + `packages/nextjs` (app), one git repo. Deploying auto-syncs ABIs/addresses to the frontend.
- **First 90 minutes, before either of us builds a single feature:**
  1. `[ETH DEV]` scaffolds the repo and deploys a **mock dNZD token** + a **stub LendingPool** (hardcoded fake numbers) + **mock oracle** to Sepolia (`yarn deploy --network sepolia`), then commits so the ABIs sync.
  2. `[YOU]` swaps Scaffold-ETH's RainbowKit for **Privy email login → embedded wallet**, and confirms you can read + write the stub via a Scaffold-ETH hook (or the **Debug Contracts** page). No screens yet.
- Then we both go heads-down. Frontend builds against the **stub**; backend swaps the **real** contract in behind the same name + interface at the end. Frontend should never notice the swap.
- Everything runs on a **testnet with fake tokens**. We never touch real money or mainnet dNZD.

---

## 1. What we're building (plain English)

A bank pays you interest because it lends your deposits to borrowers at a higher rate. Aave is the automated, on-chain version of that: people supply money to a pool, others borrow from it and pay interest, and that interest goes to the suppliers — no staff, all visible on-chain.

Almost every one of these pools is denominated in **US dollars**. So a New Zealander who wants the yield has to convert NZD → USD first, and the exchange rate swings ~10–15% a year — three times bigger than the interest. You went looking for a savings account and got a currency bet.

**We run the pool in New Zealand dollars.** NZD in, NZD out, no conversion, no FX bet. We build our own lending pool — a minimal one, modelled on Aave's proven supply-and-borrow design — and denominate it in dNZD (NewMoney's NZD stablecoin).

> **[STATUS]** Product path today uses a **real Aave V3 hackathon market** denominated in **mNZD** (mock NZD stand-in), not a from-scratch `LendingPool` in this repo. Positioning still holds: NZD-denominated savings UX on Ethereum; “Aave-compatible” is now literally Aave V3.

**Positioning line:** *"Aave is the engine. We're the car. Nobody buys an engine."* — the lending mechanics are the proven part; we built the thing people actually touch. For the prototype it's our own **Aave-compatible pool**; the roadmap is graduating to a real Aave listing where the liquidity already lives.

### Our two users

- **The Saver (supplier).** Our beginner audience. **Signs in with email — an embedded wallet is created invisibly, no seed phrase** — turns NZD into dNZD via Pay It Now, and supplies it to our pool to earn interest, the whole flow hidden behind **one button**. A savings-account UX anyone's mum can use.
- **The Borrower.** A Kiwi who owns ETH/BTC and needs cash but doesn't want to sell. **They do NOT swap their ETH.** They lock it as collateral and **borrow** dNZD against it. Because they never sell, there's no disposal — no sale means no tax event, and they keep the upside. **Nobody in New Zealand offers a NZD loan against crypto today.** This is our sharpest use case.

> ⚠️ **Do not build a "swap ETH → dNZD" screen.** Swapping is a disposal and kills the tax angle. The borrower flow is a **loan** (deposit collateral, then borrow).

> **[STATUS]** Saver supply path: **partial** (RainbowKit connect + mint/approve/supply on `/mnzd`). Email / Privy / Pay It Now / one-button Earn: **not started**. Borrower path: **not started** (debt token address exists; no borrow UI).

---

## 2. Glossary (for the pitch and for UI copy)

| Term | What it means |
| :--- | :--- |
| **Supplier / saver / lender** | Puts money into the pool to earn interest. |
| **Borrower** | Takes money out of the pool, pays interest, after locking up collateral. |
| **Collateral** | Something of value you lock up so you can borrow. Here: ETH. |
| **Over-collateralised** | You must lock up *more* than you borrow (e.g. $200 of ETH to borrow $100). That's why no credit check is needed — if you don't repay, the pool sells your ETH. |
| **LTV (loan-to-value)** | The max % of your collateral you can borrow against. We use **70%**. |
| **Liquidation** | If your collateral's value drops too far, the pool sells it to cover your debt. Happens above the **liquidation threshold (80%)**. |
| **Health factor** | A number showing how safe a borrower is. Above 1.0 = safe. Below 1.0 = can be liquidated. |
| **APY** | Annual interest rate. Comes from borrowers paying interest. **No borrowers = ~0% APY.** |
| **Stablecoin** | A crypto token pegged 1:1 to a real currency. |
| **dNZD** | NewMoney's stablecoin. 1 dNZD = 1 NZD. (We use a fake version on testnet.) |
| **mNZD** | **[STATUS — added]** Hackathon Mock NZD Stable (6 decimals) on our custom Aave market. Stand-in only — not NZDD / dNZD / zNZD. |
| **aToken** | **[STATUS — added]** Interest-bearing receipt token from Aave after supply. Balance ≈ supplied principal + accrued interest. |
| **Testnet** | A practice blockchain with worthless tokens, for building/testing safely. |
| **Embedded wallet** | A crypto wallet created behind an email login — no 12-word seed phrase. We use **Privy**. |
| **Oracle** | Feeds the contract the current price of ETH so it knows when to liquidate. We use a **mock** one we control. |
| **ABI** | Machine-readable description of a contract the frontend needs to call it. In Scaffold-ETH it auto-syncs on deploy. |
| **approve** | Before the pool can move your dNZD, you must `approve` it once. This is a required extra step (see §4). |
| **Gas** | Every transaction costs a tiny amount of ETH. A brand-new embedded wallet has none — see §14. |

> **[STATUS]** Embedded wallet / Privy and controllable mock oracle are still **planned**, not implemented. Live market uses Aave’s oracle stack (addresses in hackathon JSON).

---

## 3. Architecture & stack

### The pieces

```
[ Email login (Privy) ] ──creates──► [ Embedded wallet ]
            │
            ▼
[ Frontend (Scaffold-ETH / Next.js) ]
            │  balance in NZD
            │  one-button "Earn"
            │  borrow screen
            │  live dashboard
            │
     (Scaffold-ETH hooks, via wagmi)
            │
            ▼
[ LendingPool ] ◄──reads price── [ MockOracle ]
 supply / withdraw
 borrow / repay / collateral
            │
            ▼
[ MockDNZD (ERC-20) ]

[ "Add NZD" → mocked Pay It Now → mints test dNZD ]
```

> **[STATUS — as built today]** RainbowKit remains (no Privy). Frontend talks to **Aave V3 Pool** via wagmi + `useAave*` hooks:

```
[ RainbowKit / MetaMask (or other wallet) ]
            │
            ▼
[ Frontend (Scaffold-ETH / Next.js) ]
   /aave  → official Aave V3 Sepolia (EURS)
   /mnzd  → hackathon Aave V3 market (mNZD)
            │
     useAaveSepolia / useAaveHackathonMnzd
            │
            ▼
[ Aave V3 Pool ]  ◄── oracle ── [ AaveOracle (+ price feed) ]
 approve → supply / withdraw
 (borrow / repay — available on-chain, UI not wired)
            │
            ▼
[ EURS  |  mNZD (owner mint on /mnzd) ]
```

### Chosen stack (decided — don't re-litigate mid-build)

| Layer | Choice | Notes |
| :--- | :--- | :--- |
| Base kit | **Scaffold-ETH 2** | Monorepo: `packages/hardhat` + `packages/nextjs`. Typed contract hooks, a Debug page, auto ABI/address sync on deploy. |
| Contracts | **Hardhat** | Bundled in Scaffold-ETH. Deploy scripts in `packages/hardhat/deploy`; run `yarn deploy --network sepolia`. |
| Frontend | **Next.js + wagmi + viem** | Bundled in Scaffold-ETH. Use `parseUnits` / `formatUnits` for all number conversion. |
| Wallet | **Privy** (email → embedded wallet) | Replaces Scaffold-ETH's default RainbowKit, but stays **wagmi-based so the hooks keep working**. First-hour swap: `@privy-io/react-auth` + `@privy-io/wagmi`, wrap the app in `PrivyProvider`. Gives email login, no seed phrase. |
| Contract calls | **Scaffold-ETH hooks** | `useScaffoldReadContract` / `useScaffoldWriteContract` / `useScaffoldEventHistory`, keyed by contract **name**. |
| Testnet | **Ethereum Sepolia** (chain id 11155111) | Fire Eyes says "build on Ethereum," so L1 Sepolia. |

> **[STATUS]** Wallet row: still **RainbowKit** (Privy not started). Contract calls for Aave: dedicated hooks in `packages/nextjs/hooks/aave/` (still wagmi under the hood; external contracts also registered for Scaffold-ETH Debug). Hardhat deploy path unused for the product market (market lives in aave-v3-origin; addresses copied into `hackathon-market.json`).

> **Keep contract names stable:** the frontend hooks reference contracts by name (`LendingPool`, `MockDNZD`, `MockOracle`). Rename a contract and the frontend breaks. Change function bodies freely; don't change names or signatures without updating §4.

> **[STATUS — names in use today]** Prefer these stable names for the live path: `HackathonPool`, `HackathonMnzd`, `HackathonAToken` (and official `AaveV3Pool`, `SepoliaEURS`, `AaveSepoliaAToken`). The original `LendingPool` / `MockDNZD` / `MockOracle` names were never registered.

### Deployed addresses (auto-synced on `yarn deploy` → `deployedContracts.ts`; recorded here for reference)

```
NETWORK:            Sepolia (chain id 11155111)
MockDNZD:           0x________________________________________
LendingPool:        0x________________________________________
MockOracle:         0x________________________________________
DEPLOYER / DRIP:    0x________________________________________   (funds new wallets' gas — see §14)
```

> **[STATUS]** Placeholders above remain empty — those contracts were never deployed from this repo. Live hackathon addresses are listed in the **Implementation status** block at the top of this file. `packages/nextjs/contracts/deployedContracts.ts` is currently `{}`.

---

## 4. THE INTERFACE (the seam) — the most important section

This is what lets us work apart. Frontend calls exactly these functions (via Scaffold-ETH hooks). Backend implements exactly these functions. If it's not here, it doesn't exist yet — ask before assuming. TypeScript will catch signature mismatches; it will **not** catch unit/semantic mismatches, so §4.1 still matters.

> **[STATUS]** §§4.1–4.9 below are the **original custom-pool seam** (design record). They were **not implemented**. §4.10 documents the **actual Aave seam** the app uses. If we revive a custom pool, update Discord and reconcile both subsections.

### 4.1 Units & decimals convention (READ FIRST)

- **All token amounts are integer base units with 18 decimals.** So `100 dNZD` = `100000000000000000000`. `1 ETH` = `10^18` wei.
- **The FRONTEND does all human-readable conversion.** The contract only ever speaks base units. Frontend uses `parseUnits(x, 18)` going in and `formatUnits(x, 18)` coming out.
- **APY / rates** are returned as **integer basis points**: `350` = 3.50%, `100` = 1%. Frontend divides by 100 to display a %.
- **Prices** (ETH in NZD) are 18-decimal fixed point: `6000 * 10^18` = NZ$6,000 per ETH.
- **Health factor** is 18-decimal fixed point: `1 * 10^18` = exactly 1.0. Below `10^18` = liquidatable.

> **[STATUS — decimals in the live app]** Do **not** assume 18 for every asset:
>
> | Asset | Decimals | Notes |
> | :--- | :--- | :--- |
> | **mNZD** (hackathon) | **6** | `parseUnits` / `formatUnits` with 6 |
> | **EURS** (official Aave Sepolia) | **2** | Behaves like cents |
> | ETH / wei | 18 | Unchanged |
>
> Helpers live in `packages/nextjs/utils/aave/amount.ts`. Aave health factor / base currency units follow Aave conventions when we wire borrow (not 1:1 with the custom-pool rules above).

### 4.2 The approve → supply gotcha (this bites everyone)

To supply dNZD, the frontend must make **two** calls in order:

```
1. MockDNZD.approve(LendingPool address, amount)   // let the pool move your dNZD (once)
2. LendingPool.supply(amount)                       // now actually supply
```

Same pattern for `repay` (approve, then repay). `borrow`, `withdraw`, and `depositCollateral` (ETH) do **not** need approve. Frontend: show a "1 of 2: approving…" state so users aren't confused by two signature prompts.

> **[STATUS]** Same two-step pattern on Aave — and the current UI **keeps them as two separate confirms** (never auto-chained):
>
> ```
> 1. mNZD.approve(HackathonPool, amount)   // or EURS → AaveV3Pool
> 2. Pool.supply(asset, amount, user, 0)
> ```

### 4.3 MockDNZD token (ERC-20)

Standard ERC-20, plus an open mint so the mocked Pay It Now step can hand out test dNZD.

| Function | Signature | Returns | Notes |
| :--- | :--- | :--- | :--- |
| `mint` | `mint(address to, uint256 amount)` | — | **Open on testnet.** This is our "buy dNZD via PIN" + faucet. |
| `approve` | `approve(address spender, uint256 amount)` | `bool` | Standard. Frontend calls before supply/repay. |
| `balanceOf` | `balanceOf(address user)` | `uint256` | Wallet dNZD balance, base units. |
| `allowance` | `allowance(address owner, address spender)` | `uint256` | Frontend can check if approve is already done. |
| `transfer` | `transfer(address to, uint256 amount)` | `bool` | Standard. |

> **[STATUS]** Closest live equivalent: **`HackathonMnzd`** — ERC-20 + `mint`, but mint is **owner-only** (deployer). `/mnzd` shows an owner faucet when the connected wallet is owner. Not open mint; not Pay It Now UX.

### 4.4 LendingPool — write functions (send a transaction)

| Function | Signature | Notes |
| :--- | :--- | :--- |
| Supply | `supply(uint256 amount)` | Supply dNZD to earn interest. Needs prior `approve`. |
| Withdraw | `withdraw(uint256 amount)` | Take out supplied dNZD + accrued interest. |
| Deposit collateral | `depositCollateral()` **payable** | Send ETH as collateral (attach ETH as msg.value). No approve needed. |
| Withdraw collateral | `withdrawCollateral(uint256 amount)` | Take ETH back, only if health factor stays ≥ 1.0. |
| Borrow | `borrow(uint256 amount)` | Borrow dNZD against deposited collateral, up to LTV. |
| Repay | `repay(uint256 amount)` | Repay dNZD debt. Needs prior `approve`. |

> **[STATUS]** Not implemented as a custom contract. Aave equivalents in use: `Pool.supply` / `Pool.withdraw` (and `withdraw` with `maxUint256` for full exit). Borrow / repay / collateral helpers: **on-chain via Aave, UI not wired**.

### 4.5 LendingPool — view functions (free, instant, no transaction)

| Function | Signature | Returns | Meaning |
| :--- | :--- | :--- | :--- |
| Supply balance | `getSupplyBalance(address user)` | `uint256` | User's supplied dNZD + interest, base units. |
| Borrow balance | `getBorrowBalance(address user)` | `uint256` | User's outstanding debt, base units. |
| Collateral | `getCollateral(address user)` | `uint256` | User's ETH collateral, wei. |
| Supply APY | `getSupplyAPY()` | `uint256` | Current supply rate, **basis points**. |
| Borrow APY | `getBorrowAPY()` | `uint256` | Current borrow rate, basis points. |
| Health factor | `getHealthFactor(address user)` | `uint256` | 18-dec fixed point. `10^18` = 1.0. If debt is 0, return a huge number (fully healthy). |
| Max borrow | `getMaxBorrow(address user)` | `uint256` | How much MORE dNZD the user can safely borrow, base units. Powers the "you can borrow up to NZ$X" UI. |

> **[STATUS]** Live reads: ERC-20 `balanceOf` / `allowance` on underlying + aToken. Aave `getUserAccountData` is in the ABI (`packages/nextjs/contracts/abis/aaveSepolia.ts`) but **unused** by hooks yet. No custom APY getters — would come from Aave protocol data / reserve data when we build the dashboard.

### 4.6 MockOracle (this is a demo superpower — build it early)

| Function | Signature | Returns | Notes |
| :--- | :--- | :--- | :--- |
| Get price | `getEthPriceInNZD()` | `uint256` | ETH price in NZD, 18-dec. **Init: `6000 * 10^18`.** |
| Set price | `setEthPriceInNZD(uint256 newPrice)` | — | **Owner only.** Lets us DROP the ETH price live on stage to trigger a liquidation. Best drama in the demo. |

> **[STATUS]** Not built. Hackathon market uses AaveOracle + a price feed address (see status block). Live “drop the price” drama would need admin access to that oracle/feed — different from a simple owner setter.

### 4.7 Events (so the dashboard updates live + counts real users)

Emit on every action. Frontend listens via `useScaffoldEventHistory` and updates the dashboard in real time, counting unique addresses for the "users onboarded" number.

```
event Supplied(address indexed user, uint256 amount);
event Withdrawn(address indexed user, uint256 amount);
event CollateralDeposited(address indexed user, uint256 amount);
event Borrowed(address indexed user, uint256 amount);
event Repaid(address indexed user, uint256 amount);
```

> **[STATUS]** Custom events above: not emitted (no custom pool). Aave emits its own `Supply` / `Withdraw` / `Borrow` / `Repay` events — usable later via `useScaffoldEventHistory` on `HackathonPool` / `AaveV3Pool`. Live dashboard: **not started**.

### 4.8 Dashboard aggregate views (the projector screen during the pitch)

| Function | Signature | Returns |
| :--- | :--- | :--- |
| Total supplied | `getTotalSupplied()` | `uint256` (base units) |
| Total borrowed | `getTotalBorrowed()` | `uint256` (base units) |
| Unique users | `getUserCount()` | `uint256` (contract tracks first-time suppliers) |

> **[STATUS]** Not implemented. Aggregates would come from Aave data providers / event indexing / off-chain counting when we build the projector dashboard.

### 4.9 Suggested interest & risk math (backend owns exact impl)

Keep it simple. The **key demo behaviour**: when someone borrows, utilisation jumps, so the APY jumps **instantly** on the dashboard. That's the money shot — it doesn't need slow accrual to be visible.

```
utilisation U   = totalBorrowed / totalSupplied            (0 if nothing supplied)
borrowRate(bps) = baseRate + U * slope                     (suggest base=200, slope=2000)
supplyRate(bps) = borrowRate * U * (1 - reserveFactor)     (suggest reserveFactor=10%)

collateralValueNZD = ethCollateral * ethPriceNZD / 1e18
healthFactor       = (collateralValueNZD * LIQ_THRESHOLD) / debtNZD    (scaled to 1e18)
maxBorrowNZD       = collateralValueNZD * LTV - currentDebtNZD
```

**Pool parameters (decided):** LTV = **70%** · Liquidation threshold = **80%** · Reserve factor = **10%** · Initial ETH price = **NZ$6,000**.

> Balances grow slowly in real time. If we want visible balance growth in a 3-min demo, add an **owner-only** `fastForward()` (or an exaggerated rate) purely for the demo. Optional — the APY-jump-on-borrow is the real money shot and needs nothing.

> **[STATUS]** Rate / risk math is owned by the **Aave V3 market configuration** (deployed from aave-v3-origin), not by a custom formula in this repo. Original parameters above remain the *intent* if we ever document / retune the hackathon market.

### 4.10 Actual Aave seam (implemented — use this for frontend work)

> Additive subsection. This is what `/aave` and `/mnzd` call today.

**Hooks:** `useAaveSepolia` · `useAaveHackathonMnzd` (`packages/nextjs/hooks/aave/`)

| Action | On-chain | UI status |
| :--- | :--- | :--- |
| Mint test asset | `HackathonMnzd.mint(to, amount)` (owner only) · EURS via external Aave faucet | `/mnzd` owner faucet · `/aave` link out |
| Approve | `underlying.approve(pool, amount)` — **exact amount**, not unlimited | Done (separate button) |
| Supply | `Pool.supply(asset, amount, onBehalfOf, referralCode=0)` | Done |
| Withdraw | `Pool.withdraw(asset, amount, to)` · full exit with `maxUint256` | Done |
| Borrow / repay | Aave Pool APIs (not in current hook surface) | **Not started** |
| Account health | `Pool.getUserAccountData(user)` (ABI present) | **Not started** |

**Registration:** `packages/nextjs/contracts/externalContracts.ts`  
**Refresh hackathon addresses:** copy `reports/hackathon-market.json` from aave-v3-origin → `packages/nextjs/config/hackathon-market.json`, restart Next, run `yarn test:aave`.

---

## 5. The stub-first plan (the cheat code)

Before the real pool exists, `[ETH DEV]` deploys a **stub** contract **named `LendingPool`** with the exact §4 interface, returning hardcoded values:

- `getSupplyBalance` → a fixed number that goes up slightly each call (fakes interest)
- `getSupplyAPY` → `350` (3.5%) · `getBorrowAPY` → `550`
- `getMaxBorrow` → a fixed number
- `getHealthFactor` → `1500000000000000000` (1.5, healthy)
- `getTotalSupplied` / `getTotalBorrowed` / `getUserCount` → fixed numbers
- write functions → just emit the event and store nothing

`yarn deploy` syncs it to the frontend automatically. `[YOU]` builds the **entire** frontend against this stub using the Scaffold-ETH hooks. You're never blocked. Backend later replaces the stub's body with the real logic and redeploys — **same contract name, same signatures** — and the frontend picks it up with no changes. **This stub is the highest-leverage thing backend does all weekend — do it in hour one.**

> **[STATUS]** Stub path **superseded / not used**. Frontend was unblocked by wiring **live Aave** (official EURS + hackathon mNZD) instead of a Hardhat stub. Do not spend time building `LendingPool` stub unless we explicitly revive the custom-pool track.

---

## 6. Roles & ownership

> It's one monorepo. "Work separately" = separate packages (`packages/hardhat` vs `packages/nextjs`), coordinate via git. Pull often. Keep contract names/signatures stable (§3).

### `[ETH DEV]` — backend (`packages/hardhat`)
- [ ] Scaffold the repo; deploy MockDNZD + **stub LendingPool** + MockOracle to Sepolia; commit *(hour 1)*
- [ ] MockOracle with owner `setEthPriceInNZD` *(early — needed for the demo)*
- [ ] Real pool: supply / withdraw / depositCollateral / borrow / repay
- [ ] View functions + events + aggregate views per §4
- [ ] End-to-end test via the **Debug Contracts** page: supply + borrow with a second wallet
- [ ] Redeploy the real pool under the same name; confirm the frontend still works
- [ ] Stand up the **gas-drip** endpoint for new embedded wallets (§14) — small but demo-critical

> **[STATUS — additive progress for ETH DEV work, elsewhere]**
> - [x] Custom Aave V3 + mNZD market deployed (aave-v3-origin) and addresses committed to this repo
> - [x] Frontend can supply / withdraw against that market; Debug Contracts tabs for hackathon + official Aave names
> - [ ] Gas drip still open
> - [ ] Borrow path + controllable liquidation demo still open
> - [ ] Custom Hardhat LendingPool track: abandoned unless revived

### `[YOU]` — frontend (`packages/nextjs`)
- [ ] **Swap RainbowKit → Privy: email login creates an embedded wallet; read + write the stub** *(hour 1 — do this first)*
- [ ] Balance screen (NZD), showing supplied + wallet balance
- [ ] "Add NZD" → **mocked Pay It Now** → calls `mint` → shows NZ$ balance
- [ ] One-button **"Earn"** (does `approve` + `supply` behind the scenes)
- [ ] **Borrow** screen: deposit ETH collateral → "you can borrow up to NZ$X" (`getMaxBorrow`) → borrow → show health factor
- [ ] **Live dashboard**: users onboarded, total supplied, live APY (via `useScaffoldEventHistory`)
- [ ] Make it look *finished* — a savings app, not a crypto dashboard

> **[STATUS — additive progress]**
> - [x] `/aave` + `/mnzd` supply/withdraw prototype UIs (RainbowKit connect, Sepolia switch, balances)
> - [x] Owner mint UI on `/mnzd`
> - [x] `useAaveSepolia` / `useAaveHackathonMnzd` hooks + amount helpers + tests
> - [ ] Privy, Pay It Now mock, one-button Earn, Borrow, live dashboard, consumer polish — still open

### `[YOU]` — room / pitch (not a coding task; don't get sucked into building)
- [ ] Hit the **NewMoney** table: ask them to seed the pool with dNZD; confirm what qualifies for their track
- [ ] Hit the **Pay It Now** table: understand their real onramp so our mock is honest & the roadmap is credible
- [ ] Saturday: onboard **15–20 real attendees** (email login, no wallet needed); film it (content post + track proof)
- [ ] Sunday: two dry runs, then pitch

---

## 7. Definition of done — the demo click-path

This exact sequence must work. **If a function isn't needed for this path, it's not needed for the demo — cut it.**

1. Open app → **Sign in with email** → embedded wallet created silently (no seed phrase). *(Gas drip fires in the background — §14.)*
2. Dashboard: your NZD balance (0), total in pool, current APY.
3. **Add NZD** → mocked "Pay It Now" screen → enter 100 → confirm → balance shows **NZ$100**.
4. Tap **Earn** (one button) → app does approve + supply → balance now shown as earning.
5. Switch to borrower (second pre-funded account / Borrow tab) → **deposit ETH** as collateral → see **"you can borrow up to NZ$X"** → **borrow** NZ$Y dNZD.
6. Back to dashboard → total borrowed up, utilisation up, **supply APY ticks up live.** ← **MONEY SHOT**
7. *(Optional drama)* Owner drops ETH price via MockOracle → borrower's health factor goes red → show liquidation risk. ← second money shot
8. **Live-user proof:** dashboard shows "**X people in this room went on-chain in the last 24 hours**" — real attendees onboarded Saturday. No other team has this.

> **[STATUS — demo click-path progress]**
>
> | Step | Status | Notes |
> | :--- | :--- | :--- |
> | 1 Email / Privy / gas drip | ○ Not started | RainbowKit + user-funded Sepolia ETH |
> | 2 Dashboard aggregates / APY | ○ Not started | Per-wallet balances only on `/mnzd` |
> | 3 Add NZD / Pay It Now | ~ Partial | Owner mint on `/mnzd`; no PIN mock UX |
> | 4 One-button Earn | ~ Partial | Approve + Supply work as **two** buttons |
> | 5 Borrow flow | ○ Not started | |
> | 6 APY jump money shot | ○ Not started | Needs borrow + dashboard |
> | 7 Oracle price drop | ○ Not started | |
> | 8 Live-user proof | ○ Not started | Needs Privy onboarding + event counting |
>
> **Working technical path today:** connect wallet → Sepolia → (owner) mint mNZD → approve → supply → see aToken → withdraw. See `/mnzd`.

---

## 8. What we are NOT building (say so on a roadmap slide)

- ❌ A real fiat onramp — **mock it**, labelled "powered by Pay It Now." (Real one = AML/custody/bank = not a weekend path.)
- ❌ Any custody of user funds — "**we never touch customer funds.**"
- ❌ Swapping dNZD → USDC — kills the whole FX thesis.
- ❌ A real Aave listing — that's the roadmap, not the weekend.
- ❌ Real mainnet dNZD — testnet mock only.

> **[STATUS]** Still accurate. Clarification: we **did** integrate real Aave V3 *test* markets (official EURS + custom hackathon mNZD). That is not “listing on mainnet Aave” and not real NZDD — keep the slide honest: prototype settlement asset only.

---

## 9. The pool — custom minimal build

We build our own lending pool: one Hardhat/Solidity contract named `LendingPool`, roughly 150 lines, implementing exactly the §4 interface — supply / withdraw / deposit-collateral / borrow / repay, the simple utilisation-based rate model in §4.9, reading price from MockOracle. Keep it minimal and fully under our control — no external protocol to fight under time pressure.

It's not literally Aave, and we don't pretend it is. We pitch it honestly as **"Aave-compatible architecture"**: same proven supply-and-borrow mechanics Aave popularised, denominated in NZD, with the roadmap being a real Aave listing where the liquidity already lives. Building it ourselves and being straight about that reads as *more* competent than bolting on something we didn't finish.

Guardrail: keep the contract to exactly what §7's demo click-path needs. Every function outside that path is scope creep.

> **[STATUS — superseded by pivot]** We did the opposite of “no external protocol”: we wired **real Aave V3** (official Sepolia + a custom market from aave-v3-origin). Pitch line can upgrade from “Aave-compatible architecture” to something closer to **“running on Aave V3 (testnet / hackathon market), NZD-denominated UX”** — still honest, still not a mainnet listing. The ~150-line Hardhat `LendingPool` in this repo was **not built**; do not restart it unless the Aave path is blocked.

---

## 10. Timeline (working back from the hard deadlines)

Hard deadlines from the schedule: **Content submission Sun 10:00am · Project submission Sun 10:30am (hard) · Pitching 11:00am.**

| Phase | `[ETH DEV]` | `[YOU]` |
| :--- | :--- | :--- |
| **0 — first 90 min** | Scaffold repo; deploy MockDNZD + **stub** + MockOracle to Sepolia; commit | **Swap RainbowKit → Privy** (email login → wallet); read/write stub via hook or Debug page |
| **1 — build** | Real pool: writes, views, events; gas-drip endpoint | All screens against the **stub**; nail the look |
| **INTEGRATE `[~Sat 8am]`** | Redeploy real pool (same name); supply + borrow working end-to-end | Pull; run the §7 click-path end to end; fix approve/supply states |
| **2 — Sat afternoon** | Harden; help onboard | **Onboard 15–20 real attendees; film it;** content post |
| **FREEZE `[~Sat 10pm]`** | No new features | **Record a backup demo video** (in case live breaks) |
| **Sun 8:00am** | Support | **Two dry runs** of pitch + demo |
| **Sun 10:00 / 10:15** | — | **Content submitted; project submitted (before 10:30 hard deadline)** |
| **Sun 11:00** | — | **Pitch** |

> **[STATUS]** Original weekend timeline kept for historical context. Relative to that plan: Phase 0 stub + Privy **missed / replaced** by Aave integrations; Phase 1 supply/withdraw against Aave **done** (prototype UI); borrow / dashboard / onboarding polish **still ahead**. Re-plan remaining work from the **Suggested next build order** in the status block at the top.

---

## 11. Pitch essentials

### Spine
1. **Problem** — bank pays crumbs, and all DeFi yield is denominated in USD, so a Kiwi has to take an FX bet just to participate.
2. **Product** — first NZD savings & lending market on Ethereum, with a savings-app UX: sign in with email, no seed phrase.
3. **Demo** — 60-second email onboarding → deposit → borrow.
4. **Proof** — real people in this room onboarded this weekend.
5. **Why** — people don't adopt chains; they adopt their own money working harder.
6. **Next** — Aave-compatible now, roadmap to a real Aave listing; Pay It Now / NewMoney onramp; scale.

> **Correction to the opening:** don't say *"every DeFi yield on earth is USD-denominated"* — it's false (euro lending markets exist on Aave) and an ETH judge will know. Say: *"Europe already did this — euro lending markets exist and the FX argument is settled there. **Nobody has built it for the currencies at the bottom of the world.**"* Stronger, and true.

> **[STATUS]** Demo spine steps 2–4 assume Privy + borrow + live users — **not yet true**. Honest demo today: connect wallet → mint/supply mNZD on Aave V3 hackathon market → withdraw. Update pitch claims to match what you can click live.

### Banned phrases
- "no risk" · "safe" (as a guarantee) · "beats the banks" · "tax-free" (as a guarantee) · any APY the market isn't actually showing · "we built a fiat onramp"

### Required phrases
- "we never touch customer funds" · "Aave-compatible architecture" · "familiar risk profile, transparent on-chain" · "no disposal, so no sale" (for the borrower/tax point) · "sign in with email, no seed phrase"

> **[STATUS]** Drop or soften “sign in with email, no seed phrase” until Privy ships. “Aave-compatible” can be strengthened to “on Aave V3 (Sepolia / hackathon market)” if preferred.

### Judge Q&A (rehearse these — they decide it)
- **Where's the yield from?** → *"Borrowers in our own pool. Here's who they are: Kiwis who want NZD without selling their crypto."* (This question kills most DeFi pitches — nail it.)
- **Why not USDC?** → *"Because a New Zealander saving in USD isn't saving — they're taking an FX bet they didn't ask for."*
- **Is this real Aave?** → *"It's our own Aave-compatible pool — same supply/borrow mechanics, denominated in NZD. The roadmap is listing dNZD on real Aave. The protocol was never the hard part — onboarding is."*
- **What if ETH crashes?** → *"We're over-collateralised; liquidations protect the pool. Here's the health factor — and watch, I'll drop the price live."*
- **Day-one yield is thin, no?** → *"Correct, and we're not pretending otherwise. We're proving the demand side exists so this can graduate to a real Aave listing."*

> **[STATUS — suggested answer updates]**
> - **Is this real Aave?** → Can now say: *"Yes — Aave V3 on Sepolia. Official EURS path for plumbing; our hackathon market is mNZD so the UX is NZD-denominated. Roadmap is real NZD stable + mainnet listing."*
> - **What if ETH crashes?** → Only claim the live price-drop demo once oracle admin path exists; otherwise explain Aave liquidations without the stage stunt.

---

## 12. Prize targets (ceiling ~$3,500)

| Track | Prize | Our angle |
| :--- | :--- | :--- |
| **Fire Eyes — Build on Ethereum** | $1,000 | Aave-compatible pool on Ethereum; working prototype; real-world usefulness |
| **Main — 1st place** | $1,300 | The whole package + live users |
| **CNZ — What NZ Needs Most** | $500 | A NZD credit market nobody offers here |
| **NewMoney — New Money Builder** | $500 | Built on dNZD |
| **Content** | $200 | Live-onboarding footage (tag @web3nz.xyz + @uccryptosociety, submit by Sun 10am) |

> **[STATUS]** NewMoney angle: currently **mNZD stand-in**, not real NewMoney dNZD — confirm track eligibility. Live-users / Content tracks still need Privy onboarding + footage.

---

## 13. Sponsor tables to hit (`[YOU]`)

- **NewMoney** — seed our pool with dNZD? What qualifies for their track?
- **Pay It Now** — the onramp partner. Understand their real flow so the mock is honest and the roadmap slide is credible.

---

## 14. Setup notes

- **Privy:** create a Privy app (dashboard) for the app ID/key; install `@privy-io/react-auth` + `@privy-io/wagmi`; wrap the app in `PrivyProvider` and use Privy's wagmi connector so the Scaffold-ETH hooks still see the wallet. Enable email login + embedded wallets on Sepolia.
- **⚠️ Gas for embedded wallets (demo-critical):** a brand-new embedded wallet has **zero Sepolia ETH**, so `mint`, `supply`, and `borrow` will all revert for lack of gas. **Fix:** on first login, drip a little Sepolia ETH (~0.01) to the new wallet from a funded deployer/hot wallet — one small backend call. Build this early; without it, Saturday's live onboarding fails on the first tap. (Alternative: Privy smart wallets + a paymaster to sponsor gas, but the drip is faster.)
- **Faucet:** fund the deployer/drip wallet with plenty of Sepolia ETH (it pays gas for everyone you onboard). Alchemy/QuickNode faucets are reliable; some need a small mainnet balance.
- **Borrower demo account:** keep a second pre-funded account (second email login in another browser/incognito, with ETH collateral + gas) ready so step 5 of §7 is one click on stage.
- **Deploy (Hardhat via Scaffold-ETH):** deploy scripts in `packages/hardhat/deploy` (MockDNZD → MockOracle → LendingPool, whose constructor takes the dNZD + oracle addresses). `yarn deploy --network sepolia`. Addresses + ABIs auto-export to the frontend; commit so `[YOU]` gets them on pull.
- **Local first:** `yarn chain` + `yarn deploy` + `yarn start` to iterate locally before Sepolia.

> **[STATUS — additive setup for the path that exists]**
> - **Env:** `packages/nextjs/.env.local` needs `ALCHEMY_API_KEY` and `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` (see `.env.example`).
> - **Run Aave demo (no local chain):** `yarn install` → `yarn start` → open `/aave` or `/mnzd`.
> - **Sepolia ETH:** still required for gas (user faucet — no drip service yet).
> - **EURS:** [Aave Sepolia faucet](https://bridge-testnet.aave.com/faucet/?marketName=proto_sepolia_v3) — do not use Circle USDC (supply-capped / wrong asset).
> - **mNZD:** mint via owner wallet on `/mnzd` (or Debug Contracts → `HackathonMnzd.mint`).
> - **Checks:** `yarn test:aave` · `yarn next:check-types` · `yarn aave:smoke`.
> - Privy / gas-drip / Hardhat LendingPool deploy notes above remain valid **if/when** those tracks are revived.

---

## 15. Fill-in-the-blanks checklist

- [ ] MockDNZD, LendingPool, MockOracle deployed to Sepolia + committed (addresses in §3)
- [ ] Contract names locked: `LendingPool`, `MockDNZD`, `MockOracle`
- [ ] Privy app created; RainbowKit → Privy swap done; email login → wallet works
- [ ] **Gas-drip working** for new embedded wallets (deployer wallet funded)
- [ ] Feature-freeze time set → §10
- [ ] Second (borrower) account funded with Sepolia ETH + collateral
- [ ] Backup demo video recorded before freeze

> **[STATUS — additive checklist for the Aave path]**
> - [x] Official Aave Sepolia EURS UI (`/aave`) + docs
> - [x] Hackathon mNZD market addresses in repo + `/mnzd` UI + Debug registration
> - [x] Contract names locked for live path: `HackathonPool`, `HackathonMnzd`, `HackathonAToken` (+ official Aave names)
> - [ ] Consumer savings UX (NZD copy, Add NZD / Earn)
> - [ ] Borrow + health factor UI
> - [ ] Privy + gas drip (if still required for pitch)
> - [ ] Live dashboard / onboarding proof
> - [ ] Backup demo video of the **working** mint → supply → withdraw path

---

## 16. Key file map (implemented)

| Concern | Path |
| :--- | :--- |
| Official Aave page | `packages/nextjs/app/aave/page.tsx` |
| Hackathon mNZD page | `packages/nextjs/app/mnzd/page.tsx` |
| EURS hook | `packages/nextjs/hooks/aave/useAaveSepolia.ts` |
| mNZD hook | `packages/nextjs/hooks/aave/useAaveHackathonMnzd.ts` |
| Official config | `packages/nextjs/config/aaveSepolia.ts` |
| Hackathon config | `packages/nextjs/config/aaveHackathonMnzd.ts` + `hackathon-market.json` |
| External contracts | `packages/nextjs/contracts/externalContracts.ts` |
| Amount parsing | `packages/nextjs/utils/aave/amount.ts` |
| Target network | `packages/nextjs/scaffold.config.ts` (Sepolia) |
| Docs | `docs/AAVE_SEPOLIA.md`, `docs/AAVE_HACKATHON_MNZD.md`, `docs/WEB2_HANDOFF.md` |

---

*Keep this file open in a tab. When reality forces a change to the seam, change it here and drop one line in Discord. That's the whole discipline.*

*Last reconciled with the repository: Jul 2026 — original plan retained; status notes and §4.10 / §16 describe what is actually implemented.*
