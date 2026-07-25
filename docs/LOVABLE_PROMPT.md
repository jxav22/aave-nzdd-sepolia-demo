# Lovable Prompt — NZD Lending Frontend

Self-contained. Paste everything below the line into a new Lovable project.

---

# Build the frontend for an NZD crypto-lending app

I need the **frontend only**. All blockchain and API wiring is done afterwards by another engineer, so
every screen must render from typed mock data behind clean seams. Do not attempt any real wallet
connection, RPC call, or outbound network request.

Four pages total. Keep it simple, clean, and quiet — the most common failure here would be adding
sections nobody asked for.

## The product in one paragraph

People in New Zealand hold crypto and want New Zealand dollars without selling it. They deposit wETH
or wBTC as collateral and borrow **dNZD**, a token designed to hold a value of one NZD. Other people
deposit dNZD and earn the interest those borrowers pay. It runs on an Aave V3 lending market on the
Ethereum Sepolia test network. There is also a **borrow risk stress-tester** that projects what
happens to a position if ETH falls, and a public REST API that exposes it.

## Who this is for

Every screen serves one of two people. If a piece of copy doesn't speak to one of them, don't write
it.

**Ana — new to crypto, wants NZD yield.**
She has NZD and wants it to earn more than a bank account. She does not know what a stablecoin is,
has never used a wallet, and does not want to learn protocol mechanics. She needs: the rate she
earns, where the yield comes from, what could go wrong, and three steps to start. She must never see
protocol jargon — no aToken, allowance, variable debt, LTV, utilisation, basis points, oracle, health
factor, liquidation, or collateral anywhere on her path.

**Rangi — holds ETH and BTC, doesn't want to sell.**
He needs NZD for something real, but selling means giving up his position. Instead he deposits ETH or
BTC as collateral and borrows NZD against it, keeping the asset. He needs: how much he can borrow,
what it costs, and — stated plainly, never buried — that if his collateral falls far enough in value,
some of it is sold automatically to repay the loan and he does not get it back.

---

## 1. Technical constraints (important — this is a handover)

- **React + TypeScript + Tailwind.** Keep components presentational.
- **Single mock-data module.** Every piece of fake data lives in `src/lib/mockData.ts`, typed against
  the interfaces in §3. No inline literals scattered through components.
- **All data access goes through hooks** in `src/hooks/` (§4). Each returns mock data today with
  realistic `isLoading` / `error` handling. A later engineer swaps the body of each hook for a real
  implementation without touching a single component. **This seam is the most important thing in this
  build.**
- **Wallet is a stub.** `useWallet()` returns fake state with a dev-only toggle so I can preview the
  connected and disconnected version of every screen. A real wallet library replaces it later.
- **Page components must be route-agnostic.** This gets ported into a Next.js App Router project, so
  keep one exported page component per route and avoid router-specific logic beyond navigation links.
- **Never do arithmetic on token amounts in the UI.** All chain quantities arrive as decimal
  *strings* with an explicit `decimals` field — parsing them as JavaScript numbers loses precision.
  Render the pre-formatted `formatted` string. Never `Number()` a `raw` value, never sum amounts,
  never compute a percentage from two amounts. If a derived figure is needed it is a field on the
  data contract, not a calculation in a component.
- **Never hardcode a currency symbol for value totals.** The market's reference currency is still an
  open decision (it may report in USD or in NZD). Always render `market.baseCurrencySymbol` from the
  data. Token amounts use the token's own `symbol` field.
- **Product name lives in one constant** — `APP_NAME` in `src/lib/constants.ts`, default it to
  `"NZD Lend"` so I can rename it in one place.

---

## 2. Global shell

**Header** — product name/logo linking home, two nav links, and a Connect Wallet control on the
right. When connected it shows a truncated address with a dropdown (copy address, view on block
explorer, disconnect).

**Nav is exactly two links:** *Your account* (`/app`) · *Rates & risk* (`/market`). Nothing else ever
goes in the header.

**On the landing page the header carries only the product name and Connect Wallet — no nav links at
all.** The two path cards are the navigation.

**Network banner** — a dismissible bar shown only when the connected wallet is on the wrong network:
"You're on the wrong network. This app runs on Ethereum Sepolia." with a Switch Network button.

**Testnet notice** — a persistent, understated marker in the shell making clear this is a Sepolia
test deployment using test tokens with no real value.

**Transaction feedback** — one shared component that renders a `TxFlow` (§3): an ordered list of
steps with per-step status (idle / awaiting wallet signature / pending on-chain / confirmed /
failed), a block-explorer link per confirmed step, and a plain-language error with a suggested next
action on failure. Used by every write action in the app. Modal or docked panel, your call, but one
implementation reused everywhere.

**Footer** — the quiet links (*API for developers* → `/developers`, *Advanced* → `/advanced`, docs,
GitHub), the market's chain and contract addresses collapsed, and the disclaimer text from §7.

---

## 3. Data contract

Define these in `src/types.ts` and mock them in `src/lib/mockData.ts`. Field names and shapes matter
— they mirror the real backend, so keep them exactly as written.

```ts
/** Every chain quantity. `raw` is an integer string in the token's smallest unit. */
export type Amount = {
  raw: string;
  decimals: number;
  formatted: string; // display-ready, e.g. "1,485.00"
  symbol: string;    // "dNZD" | "wETH" | "wBTC" | base-currency symbol
};

/** Health factor. 1.0 = at liquidation. `formatted` is "∞" when there is no debt. */
export type HealthFactor = { raw: string; formatted: string };

export type AssetSymbol = "wETH" | "wBTC" | "dNZD";

export type Reserve = {
  symbol: AssetSymbol;
  name: string;                  // "Wrapped Ether", "Wrapped Bitcoin", "Demo NZD"
  decimals: number;              // wETH 18, wBTC 8, dNZD 6 — all three differ, never assume 18
  underlyingAddress: string;
  aTokenAddress: string;
  variableDebtAddress: string;
  priceFeedAddress: string;
  priceFeedKind: "chainlink" | "mock";
  priceFeedDescription: string;  // "ETH / USD"
  oraclePrice: Amount;           // in base currency
  totalSupplied: Amount;
  totalBorrowed: Amount;
  poolLiquidity: Amount;         // what is actually borrowable right now
  utilisationPercent: number;
  supplyApyPercent: number;
  borrowApyPercent: number;
  ltvBps: number;                // 8250 = 82.50%
  liquidationThresholdBps: number;
  liquidationBonusBps: number;
  reserveFactorBps: number;
  supplyCap: string | null;      // null = uncapped
  borrowCap: string | null;
  isActive: boolean;
  isFrozen: boolean;
  collateralEnabled: boolean;
  borrowingEnabled: boolean;
};

export type MarketInfo = {
  chainId: number;               // 11155111
  chainName: string;             // "Ethereum Sepolia"
  marketId: string;
  blockNumber: string;           // amounts are a snapshot; show which block
  baseCurrencySymbol: string;    // never hardcode this
  baseCurrencyDecimals: number;  // 8
  explorerBaseUrl: string;
  addresses: {
    pool: string;
    poolAddressesProvider: string;
    aaveOracle: string;
    protocolDataProvider: string;
    aclManager: string;
    wrappedTokenGateway: string;
  };
  totalSuppliedBase: Amount;
  totalBorrowedBase: Amount;
};

export type UserAssetPosition = {
  symbol: AssetSymbol;
  walletBalance: Amount;
  allowance: Amount;       // how much the pool may move on the user's behalf
  supplied: Amount;
  borrowed: Amount;
  usedAsCollateral: boolean;
};

export type UserPosition = {
  address: string;
  totalCollateralBase: Amount;
  totalDebtBase: Amount;
  availableBorrowsBase: Amount;   // borrowing *capacity*, NOT available liquidity
  currentLtvBps: number;
  liquidationThresholdBps: number;
  healthFactor: HealthFactor;
  netApyPercent: number | null;
  assets: UserAssetPosition[];
  warnings: string[];             // render each verbatim
};

export type Scenario = {
  label: string;                  // "1-day 1 sigma move (-2.2%)"
  ethPriceChangePercent: number;
  derivedFrom: "current" | "volatility" | "drawdown" | "reference" | "user" | "fallback";
  projectedHealthFactor: HealthFactor;
  liquidatable: boolean;
  interpretation: string;         // render verbatim, do not rewrite
};

export type RiskReport = {
  market: {
    chainId: number; marketId: string; pool: string; oracle: string;
    blockNumber: string; collateralSymbol: string; borrowSymbol: string;
  };
  position: {
    address: string;
    collateralSupplied: Amount;
    totalCollateralBase: Amount;
    totalDebtBase: Amount;
    availableBorrowsBase: Amount;
    liquidationThresholdBps: number;
    healthFactor: HealthFactor;
  };
  proposal: {
    protocolMaximum: Amount;                      // the protocol's own limit
    proposedBorrow: Amount;
    projectedHealthFactor: HealthFactor;
    liquidationAtEthChangePercent: number | null;  // null = not reachable
  };
  stressTest: {
    targetHealthFactor: HealthFactor;
    shockEthPriceChangePercent: number;
    stressTestedMaximum: Amount;
    cappedByProtocolMaximum: boolean;
  };
  scenarios: Scenario[];
  marketContext: {
    source: string;                 // attribute this visibly
    endpoints: string[];
    ethPriceUsd: number | null;
    change24hPercent: number | null;
    dailyVolatilityPercent: number | null;
    maxDrawdown30dPercent: number | null;
    candleCount: number | null;
    asOf: string;                   // ISO timestamp
    degraded: boolean;              // true = live data unavailable, fixed scenarios used
    authenticationRequired: false;
  };
  oracleDivergence: {
    aaveCollateralPrice: Amount;
    aaveBorrowAssetPrice: Amount;
    externalEthPriceUsd: number | null;
    divergencePercent: number | null;
    note: string;
  };
  selfCheck: {
    reportedHealthFactor: HealthFactor;
    recomputedHealthFactor: HealthFactor;
    matches: boolean;               // false = the risk model disagrees with the protocol
  };
  warnings: string[];
  explanation: string;              // plain-language summary, render verbatim
  methodology: string;
  sources: string[];
  steps: { step: number; tool: string; detail: string; durationMs: number }[];
  disclaimer: string;               // MUST always be rendered alongside the numbers
};

export type TxStepStatus = "idle" | "awaiting-signature" | "pending" | "confirmed" | "failed";

export type TxStep = {
  id: string;
  label: string;                    // "Approve NZD", "Deposit NZD"
  status: TxStepStatus;
  txHash?: string;
  error?: string;
  recoveryHint?: string;
};

export type TxFlow = { title: string; steps: TxStep[]; isActive: boolean };

export type ApiEnvelope<T> =
  | { ok: true; schemaVersion: string; data: T }
  | { ok: false; schemaVersion: string; error: { code: string; message: string; field?: string } };
```

Realistic mock values to seed with: ETH around 1,853, BTC around 63,900, dNZD at 1.00, LTV 8250,
liquidation threshold 8600, liquidation bonus 500, reserve factor 1000, both caps `null`, chain ID
11155111. Plausible 42-character hex strings for addresses. Include at least one mock where the dNZD
reserve has **zero** `poolLiquidity` so I can preview that state (§6).

---

## 4. Hooks (the wiring seam)

Create each of these in `src/hooks/`, returning mock data with realistic loading and error states,
and a top-of-file comment noting it will be replaced with a real implementation.

| Hook | Returns |
| :--- | :--- |
| `useWallet()` | `{ address, isConnected, isConnecting, chainId, isCorrectNetwork, connect, disconnect, switchNetwork }` plus a dev toggle |
| `useMarket()` | `{ market, reserves, isLoading, error, refetch }` |
| `usePosition(address)` | `{ position, isLoading, error, refetch }` — `null` position when not connected |
| `useRiskReport(params)` | `{ report, isLoading, error, refetch }` — params: `address, borrowAmount, targetHealthFactor, shockPercent` |
| `useSimulateRisk()` | mutation-style: `{ simulate(input), report, isLoading, error, reset }` |
| `useTxFlow()` | `{ flow, run(steps), reset }` — drives the shared transaction component |
| `useFaucetRequest()` | `{ request({ address, amount }), status, error }` |
| `useApiPlayground()` | `{ send(route, params), response, status, headers, isLoading, error }` |
| `useAgentChat()` | `{ messages, send(text), toolCalls, suggestions, isLoading, isConfigured, error }` |

Make `useTxFlow()` actually simulate step progression on a timer in mock mode, so the transaction UI
is genuinely previewable end to end, including a failure path.

---

## 5. Pages

Four routes, plus two reachable only from the footer.

| Route | Purpose |
| :--- | :--- |
| `/` | Landing — two paths, nothing else |
| `/app` | Your account — position, earning and borrowing all on one page |
| `/market` | Rates and the stress-tester, stacked |
| `/developers` | API reference and playground. **Footer link only** |
| `/advanced` | Raw technical panel. **Footer link only** |

### `/` — Landing page

The whole page is: a headline, two paths, one honesty block, a footer. Nothing more.

- **Hero** — one headline, one supporting sentence. No stat strip, no badges, no scroll indicator.
- **Two path cards, equal weight**, side by side on desktop and stacked on mobile. Each is
  self-contained: a title, one sentence, one live number, three short steps, one button.

  **Card A — Earn on NZD** (Ana)
  - One sentence: put NZD in, earn interest paid by the people borrowing it.
  - Live number: the current dNZD deposit rate from `useMarket()`.
  - Three steps: connect a wallet → deposit NZD → your balance grows.
  - Button → `/app?intent=earn`

  **Card B — Borrow NZD against your crypto** (Rangi)
  - One sentence: keep your ETH or BTC and borrow NZD against it, instead of selling it.
  - Live number: the maximum you can borrow against your collateral, as a percentage.
  - Three steps: connect a wallet → deposit ETH or BTC → borrow NZD.
  - Button → `/app?intent=borrow`

- **One honesty block** — a single short, unshowy section covering: this runs on the Ethereum Sepolia
  test network; dNZD is a demo token made for this project, not a production NZD stablecoin from any
  third party, and has no monetary value; rates vary and are not guaranteed; borrowing carries
  liquidation risk; nothing here is financial or tax advice.
- **Footer.**

Do **not** put on this page: any tab bar or segmented control, a market statistics strip, a
standalone risk-tool section, a standalone developer or API section, testimonials, partner logos, a
pricing table, or a newsletter signup.

### `/app` — Your account

One page for everything the user does. Ordered: where you stand, then what you can do.

**Entry intent.** Read `?intent=earn` or `?intent=borrow` and remember the last choice. It decides
which action section is expanded on arrival; the other collapses to a single summary line with a
button that expands it. Nobody is locked out of either path.

**States before anything else:**
- *Not connected* — the two path cards from the landing page, plus Connect Wallet. Not an error.
- *Connected, nothing deposited* — a short "you haven't started yet" panel and the same two paths.

**Position summary** — top of the page once there is something to show, and **adaptive**:
- If the user has only deposited NZD to earn: show what they've deposited and the rate it earns.
  **No health factor, no liquidation language, no collateral terminology.** Ana never sees it.
- If the user has borrowed: additionally show total collateral deposited, amount borrowed, how much
  more they could borrow, and the health factor — `∞` when there is no debt, with a plain-language
  status and a visual indicator of distance to the 1.0 liquidation point.
- Show `netApyPercent` when present; omit the tile entirely when `null`.
- A quiet line noting the figures were read at block `market.blockNumber`, with a refresh control.
- Every string in `position.warnings`, rendered verbatim as its own alert.

**Earn section**
- The current rate as the headline figure, with one sentence on where it comes from: interest paid by
  people borrowing NZD, accruing continuously into the deposited balance. Note the rate varies.
- Deposited balance and wallet NZD balance.
- Amount input with Max, and one **Deposit** button that runs the approve-then-deposit sequence
  through the shared transaction-flow component. Never two buttons the user has to reason about.
- **Withdraw** with an amount input and a Withdraw All action. Note withdrawal can fail when the pool
  lacks liquidity or the position is constrained by outstanding debt.
- **Get test NZD** — a request form (address, amount) with pending / submitted / failed states and a
  note that requests are fulfilled manually on the test network.
- A clearly-labelled empty state for earnings-over-time: "Historical data isn't available yet." Leave
  the slot; do not fabricate a chart.

**Borrow section**
- **Step 1, deposit collateral:** choose ETH or BTC, each showing wallet balance and what depositing
  adds to borrowing power. Amount input with Max and inline validation. One **Deposit** button
  running the full approve-then-deposit sequence. For ETH, an inline sub-panel to wrap ETH or deposit
  ETH in one transaction, with the note that ETH must be wrapped through this app's own contract —
  wETH from anywhere else will not work here.
- **Step 2, borrow NZD:** amount input with a Max bounded by the *lower* of the protocol maximum and
  the pool's available liquidity. Show those two as separate labelled figures — borrowing power and
  available liquidity are different constraints and must never be conflated anywhere in the UI. Show
  the projected health factor for the entered amount.
- **A plain-English liquidation explainer directly above the borrow button, always visible, never
  collapsed:** if your ETH or BTC falls far enough in value, some of it is sold automatically to
  repay what you owe, and you do not get it back. State the price at which that would begin.
- A **compact risk summary**: projected health factor, one sentence on how far ETH would need to fall
  before liquidation (`liquidationAtEthChangePercent` when it isn't `null`), and the two or three
  most severe scenarios with their `interpretation` rendered verbatim. A plain text link to the full
  stress-tester on `/market` for the rest. Do **not** put the full controls, provenance disclosure,
  methodology or step trace here.
- The `disclaimer` rendered wherever a risk figure appears.
- Prominent warnings when `selfCheck.matches` is false (the risk model disagrees with the protocol's
  own figures, so the scenarios should not be relied on) or `marketContext.degraded` is true (live
  market data unavailable, scenarios are fixed reference declines rather than measured behaviour).
- **Repay:** amount input, Repay and Repay All, sequenced through the transaction-flow component.
- When the NZD pool's liquidity is zero, the borrow action is disabled with an explicit explanation
  that there is nothing available to borrow right now regardless of collateral.

### `/market` — Rates & risk

Two stacked sections on one page. No tabs.

**Section 1 — Rates**
- Table, one row per asset: asset and name, price, total deposited, total borrowed, available
  liquidity, utilisation, deposit rate, borrow rate, maximum borrow percentage, liquidation
  threshold. Status badges when a reserve is inactive, frozen, unusable as collateral, or has
  borrowing disabled.
- Row expansion shows the full configuration (LTV, liquidation threshold, liquidation bonus, reserve
  factor, decimals, supply and borrow caps with "Uncapped" for `null`) and all addresses (underlying,
  aToken, variable debt token, price feed), each with a copy control and block-explorer link. Label
  the price feed with its `priceFeedDescription` and a badge distinguishing a real Chainlink feed from
  a mock constant feed — that distinction is meaningful and must be visible.
- Protocol contract addresses in a collapsed card: chain, market ID, and every address in
  `market.addresses`, copyable and linked.
- Two clearly-labelled empty slots for future charts — rate history, and total deposited over time.
  No placeholder chart data.

**Section 2 — Stress-test a position**
One form, one primary path, no tabs:
- Defaults to the connected wallet's position, or an address field when nothing is connected.
- Inputs: proposed borrow amount, target health factor (1.1 / 1.2 / 1.5), and ETH decline
  (10% / 20% / 30%).
- A single disclosure — *or describe a position manually* — swaps the address field for
  bring-your-own-position inputs: collateral legs (1–10, add and remove, each with an optional label,
  a value in base units, a liquidation threshold in basis points 0–10000, and a *shockable* toggle
  defaulting to on — turn it off for stable collateral that should hold its value in a scenario),
  existing debt, proposed borrow, target health factor (minimum 1.0), decline percentage,
  base-currency decimals (default 8), and an optional explicit scenario list of signed basis-point
  moves from −10000 to 0, with a note that supplying these makes the result fully deterministic with
  no external market call.
- Client-side validation with field-level messages for: malformed address, negative or over-precise
  amounts, target health factor below 1.0 or above 100, decline outside 0–100%, basis points outside
  range, more than 10 collateral legs.
- **Results** use one shared risk-report renderer (also used by `/app` in its compact form and by the
  developer playground). It shows: protocol maximum, proposed borrow, projected health factor;
  the `liquidationAtEthChangePercent` sentence when not `null`; the stress-tested amount with a note
  when `cappedByProtocolMaximum` is true that the protocol's own lower limit is what's shown; the
  scenarios table (ETH price movement, projected health factor, interpretation) with liquidatable
  rows marked distinctly and a small `derivedFrom` badge so a measured scenario is distinguishable
  from a fixed one; a market-context sentence built from `marketContext` with `source` attributed
  visibly, replaced by the degraded notice when `degraded` is true; `explanation` verbatim; each
  `warnings` entry as an alert; a collapsed **How was this calculated?** section containing position
  data used, oracle prices with `oracleDivergence.note`, the external data source, endpoints and
  retrieval time, `methodology`, the `selfCheck` comparison, the `steps` trace and `sources`; and the
  `disclaimer` always visible, never inside the collapsed section.
- When scenarios were supplied by the user the market-context block is absent — handle that cleanly
  rather than rendering an empty card.
- One plain text line at the very bottom: this assessment is also available as an API, linking to
  `/developers`. No card, no banner, no call-to-action styling.

### `/developers` — API reference and playground

Complete and useful, but **not a selling point**. Reachable only from the footer link and the one
plain text line at the bottom of `/market`. No mention of it on `/` or `/app`.

- **Overview** — base URL, no authentication required, everything read-only and non-custodial.
  Explain the response envelope (`ok`, `schemaVersion`, `data` or `error`), that clients branch on
  `ok`, and that chain quantities are decimal strings with a `decimals` sibling rather than JSON
  numbers, precisely so precision is not lost.
- **Error codes table**: `INVALID_ADDRESS` 400 · `INVALID_AMOUNT` 400 ·
  `INVALID_TARGET_HEALTH_FACTOR` 400 · `INVALID_SHOCK` 400 · `INVALID_BODY` 400 · `RATE_LIMITED` 429
  · `UPSTREAM_RPC_ERROR` 502 · `INTERNAL_ERROR` 500. Note `error.code` is stable and safe to branch
  on while `error.message` is for humans.
- **Rate limits and CORS** — per-IP limits, the `X-RateLimit-Limit` / `X-RateLimit-Remaining` /
  `X-RateLimit-Reset` headers and `Retry-After` on a 429, open CORS with no credentials.
- **Endpoint list**, each an expandable card with method, path, one-line purpose, a parameter table,
  a copyable curl example, and a **Try it** form. The response viewer shows HTTP status, rate-limit
  headers, and the pretty-printed JSON body with a copy control:

  | Method | Path | Purpose |
  | :--- | :--- | :--- |
  | `GET` | `/api/v1/borrow-risk` | Full risk report for an address against this market |
  | `POST` | `/api/v1/borrow-risk/simulate` | Stateless, bring-your-own-position. No wallet, no chain read |
  | `GET` | `/api/v1/position/{address}` | Raw position read, including liquidation threshold and pool liquidity |
  | `GET` | `/api/v1/market/eth` | External ETH market context and the scenarios derived from it |
  | `GET` | `/api/v1/binance/token/search` | Token search by symbol, name, or contract address |
  | `GET` | `/api/v1/binance/token/dynamic` | Live price, volume, liquidity and holders for one token |
  | `GET` | `/api/v1/binance/token/meta` | Name, decimals, website and socials for one token |
  | `GET` `POST` | `/api/v1/binance/chat` | Natural-language agent over the routes above |
  | `GET` | `/api/v1/openapi.json` | OpenAPI 3.1 spec |

- **OpenAPI** — a card linking to the spec with copy and download actions, noting it is importable
  into Postman, Insomnia or a codegen client.
- **Requirements for clients** — present as conditions of use, not tips:
  1. Render the `disclaimer` that accompanies every risk response.
  2. Do not relabel `stressTestedMaximum` as a safe amount.
  3. Attribute the external market data; do not present it as your own or imply anyone forecasts
     anything.
  4. Keep the protocol authoritative — `protocolMaximum` is the protocol's limit; the stress-tested
     figure is always the more conservative of the two and never raises a limit.
  5. Handle `degraded: true` by telling the user the scenarios are fixed reference declines.
  6. Check `selfCheck.matches` and warn when it is false.
  7. Check available pool liquidity — borrowing capacity is not available liquidity.
- **Agent panel**, collapsible, at the bottom: a message list, a text input, suggested starter
  prompts, and per-reply a small list of the API calls the agent made (tool name, method, path,
  status) plus generated follow-up suggestions. It needs a clean **not configured** state for when
  the server has no API key, with the input disabled.

### `/advanced` — Technical panel

Footer link only. For developers and for me debugging. Everything the consumer pages deliberately
hide, in raw protocol terms.

- Asset tabs: wETH · wBTC · dNZD.
- Raw values for the selected asset: wallet balance, allowance, supplied balance (aToken), borrowed
  balance (variable debt token), available to borrow in base units, raw health factor.
- **Unsequenced individual actions**, deliberately separate: Approve · Supply · Withdraw · Withdraw
  All · Borrow · Repay · Repay All. Each notes when it can revert (borrowing disabled, insufficient
  collateral, health factor would fall below 1, insufficient pool liquidity).
- Wrap ETH, and deposit ETH via the gateway.
- **Owner faucet** — rendered only when the connected wallet is the token owner: mint amount, an
  optional recipient defaulting to the connected wallet, and a Mint action. When the connected wallet
  is not the owner, show an informational panel naming the owner address and explaining minting is
  owner-only.
- Every relevant contract address, copyable and linked to the explorer. A manual Refresh control.

---

## 6. States and edge cases

Every screen needs loading, empty, error and disconnected states. These specific ones matter:

- **Health factor is `∞`, not zero, when there is no debt.** Render `∞`. Never show `0`, never show a
  scary status for a position with no debt.
- **Zero pool liquidity.** When a reserve's `poolLiquidity` is zero the borrow action must be disabled
  with an explicit explanation that the reserve currently has nothing to lend, so a borrow would fail
  regardless of collateral. This is a real, current condition — build it as a first-class state.
- **Borrowing capacity vs available liquidity** must never be conflated anywhere.
- **Wrong network** — write actions disabled, banner visible, read-only pages still readable.
- **`degraded: true`** — the market-context block is replaced with the fixed-scenarios notice.
- **`selfCheck.matches === false`** — prominent warning wherever the report is rendered.
- **Transaction failure** — plain-language message plus a suggested next action, with the raw error
  behind a disclosure. Never a bare hex revert string.
- **Amount inputs** — decimal input mode, per-asset decimal limits (dNZD 6, wETH 18, wBTC 8), Max
  controls, inline validation, and a disabled submit with a stated reason while invalid.
- **Long values** — addresses and hashes truncate with a copy control; tables scroll horizontally on
  narrow screens rather than forcing the page to scroll sideways.
- **Fully responsive**, mobile included. Tables become readable stacked layouts on small screens.
- **Accessible** — keyboard-navigable, labelled form controls, status conveyed by text and not colour
  alone, live regions for transaction status changes.

---

## 7. Copy rules

Plain New Zealand English. Protocol jargon is confined to `/market` row expansions and `/advanced`.

**On Ana's path** (landing card A, the earn section, her position summary):
- Never show: aToken, allowance, variable debt, LTV, utilisation, basis points, oracle, health
  factor, liquidation, collateral.
- Explain in one sentence what dNZD is: a token designed to hold a value of one New Zealand dollar.
- Say where the yield comes from, and that the rate varies and is not guaranteed.

**On Rangi's path** (landing card B, the borrow section):
- The frame is: **keep your crypto, borrow against it instead of selling it.** You keep the asset and
  you keep your exposure to its price, up and down.
- **Never assert a tax outcome.** Do not write "tax-free", "avoid tax", "no tax", "don't pay tax",
  "tax-efficient", "tax loophole", "0% tax", "beat the taxman", or any equivalent — not in a
  headline, not in a tooltip, not in fine print.
- What may be said is the mechanical fact: borrowing against your crypto is not a sale of it, so you
  still hold the asset.
- Anywhere that framing appears, carry alongside it: tax treatment depends on your own circumstances,
  this is not tax advice, and you should speak to a tax professional.
- Liquidation is explained in plain words at the point of borrowing, always visible, never softened
  and never collapsed.

**Everywhere, without exception:**
- Never write "safe amount", "safe to borrow", "recommended borrow", or anything presenting the
  stress-tested figure as safe or advised.
- Never write "guaranteed", "risk-free", "will not be liquidated", or "cannot be liquidated".
- Never state or imply a price prediction or forecast.
- Always render the `disclaimer` field alongside any risk figure, outside collapsed sections.
- Describe scenarios as illustrative projections based on recent public market data, not predictions.
- Attribute external market data to its named source.
- Keep the protocol's own figure labelled as the protocol's limit, and the stress-tested figure
  clearly labelled as this tool's more conservative figure.
- State clearly on the landing page and in the footer that this is a Sepolia test deployment, that
  dNZD is a demo token created for this project and not a production NZD stablecoin issued by any
  third party, and that nothing here is financial or tax advice.

---

## 8. Out of scope — do not build

- Any real wallet connection, wallet library, RPC call or outbound network request
- Any page beyond the five in §5
- More than two links in the header nav
- Email or password authentication, user accounts, profiles or settings pages
- Charts containing invented historical data — use the labelled empty states described above
- Any API or developer call-to-action outside the footer and the one line at the bottom of `/market`
- Duplicated risk controls — the full stress-tester exists once, on `/market`
- Fiat on-ramp, card payments, KYC flows, referral or rewards programmes
- Multiple chains or networks beyond the single Sepolia market
- Admin or governance dashboards beyond the owner faucet in `/advanced`
- Marketing filler: testimonials, partner logos, pricing tables, blog, newsletter signup
- A separate onboarding wizard — the guided flow inside `/app` is the onboarding
