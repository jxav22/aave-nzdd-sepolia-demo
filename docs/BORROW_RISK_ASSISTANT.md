# Binance-powered Borrow Risk Assistant

Stress-tests a proposed dNZD borrow against recent public ETH market behaviour, so a
borrower can see how their position would hold up before they submit the transaction.

Exposed two ways, both hitting the same code path:

- **UI** — a panel on `/mnzd` when the dNZD tab is selected.
- **Public API** — `GET /api/v1/borrow-risk`, documented in [`API.md`](./API.md).

## What it does

Aave decides what you may borrow. The assistant does not change that. It answers a
different question: *at that borrow amount, how far can ETH fall before you are in
trouble, and what would a more conservative amount look like?*

For a given wallet and proposed borrow it reports:

- the projected health factor at the proposed amount;
- a table of projected health factors under several ETH declines;
- the exact ETH decline at which the position would reach a health factor of 1.0;
- a stress-tested amount that holds a chosen health factor through a chosen decline;
- the recent ETH market conditions the scenarios were derived from.

## Data sources, and which is authoritative

| Source | Used for | Authoritative for |
| --- | --- | --- |
| Aave `Pool.getUserAccountData` | Collateral, debt, borrowing capacity, liquidation threshold, health factor | **Everything about the protocol position** |
| Aave `AaveOracle.getAssetPrice` | Per-asset prices in base currency | **Collateral valuation and liquidation** |
| Aave `ProtocolDataProvider` | Per-reserve LTV and liquidation threshold | Reserve configuration |
| Binance Skill `query-token-info` | ETH spot price, 24h change, daily volatility, 30-day drawdown | **Nothing about the position** — scenario selection only |

The Binance data never determines borrowing capacity or liquidation. It only decides
*which* price declines are worth showing. If it is unavailable the assistant falls back
to fixed −10% / −20% / −30% scenarios and labels the response `degraded`.

### Binance Skill details

`query-token-info` against mainnet WETH (`0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`,
chainId 1), using two documented endpoints:

- `dynamic` — spot price, 24h change, high/low, volume, liquidity;
- `kline` — 31 daily candles, giving 30 daily returns.

Both are **fully public**: no API key, no Binance account, no signature, nothing
user-specific. Verified live. Responses are cached for 60 seconds server-side, and
concurrent callers share one in-flight request.

> The skill ships a CLI at `.agents/skills/query-token-info/scripts/cli.mjs`, but its
> entrypoint guard compares `import.meta.url` against a raw `process.argv[1]`, which never
> matches a `C:\...` path. On Windows it exits silently. We call the documented URLs
> directly with `fetch` instead, which also avoids a subprocess per request.

## Methodology

### Health factor

Aave liquidates when the health factor falls below 1:

```
HF = Σ (collateral_i × liquidationThreshold_i) / totalDebt
```

Applying a price shock `x` to the ETH-correlated legs:

```
HF(x) = Σ (collateral_i × (1 + x·shockable_i) × liquidationThreshold_i) / totalDebt
```

All of it is integer arithmetic over base-currency units. The sum is accumulated scaled
by `BPS²` and divided exactly once, so per-leg truncation cannot compound.

### Why the mock oracle is not a problem

This demo market prices wETH at a fixed 1800 and treats NZ$1 as one base-currency unit.
Neither matches reality. It does not matter for the stress table, because with wETH the
only collateral the price level cancels out:

```
HF(x) = C·(1+x)·LT / D = HF₀ × (1 + x)
```

A 20% ETH decline moves the projected health factor by exactly 20% whether ETH is booked
at 1800 or 3200. The table is **scale-invariant**, which `stress.test.ts` asserts
directly. What *is* understated is absolute borrowing capacity — and that figure is
reported as Aave's own limit, not as our recommendation.

### Scenario selection

Scenarios are derived from the candles, not hard-coded:

| Scenario | Derivation |
| --- | --- |
| Current price | 0% |
| 1-day 1σ move | −σ |
| 1-day 2σ move | −2σ |
| 7-day 2σ move | −2σ√7 |
| Observed 30-day drawdown | Deepest peak-to-trough in the window |
| Severe reference | Fixed −25% |

σ is the sample standard deviation of daily **log** returns, so a fall and the rise that
undoes it are symmetric. The drawdown walks intraday highs and lows rather than closes,
because a position is liquidated on the low, not on the close. Duplicates are collapsed,
so a calm month produces a shorter table rather than repeated rows.

At the time of writing: σ = 2.17%/day, deepest 30-day fall −9.62%, giving −2.17%, −4.33%,
−9.62%, −11.47% and −25%.

### Stress-tested amount

Solved in closed form and then clamped to Aave's own limit:

```
newDebt ≤ Σ (collateral_i × (1 + x) × LT_i) / targetHF − existingDebt
newDebt = min(newDebt, availableBorrowsBase)
```

The clamp matters: at a target of 1.0 with no shock, the unconstrained solution exceeds
`availableBorrowsBase`, and recommending it would produce a transaction that reverts.

### Self-check

The engine recomputes the *current* health factor from its own per-asset decomposition
and compares it against the one Aave reports. Aave derives that number from the same
inputs, so a mismatch beyond rounding means our collateral model is wrong and the whole
table should be distrusted. This runs on every request and is surfaced in the response
(`selfCheck`) and in the UI's "How was this calculated?" panel, not just in tests.

## Architecture

```
UI (BorrowRiskAssistant.tsx) ─┐
third-party client / curl  ───┴─→ GET /api/v1/borrow-risk
                                        │
                                        ├─→ services/aave/readPosition.ts   (viem multicall)
                                        ├─→ services/binance/ethMarket.ts   (public endpoints, 60s cache)
                                        └─→ utils/risk/stress.ts            (pure integer math)
```

`app/api/v1/borrow-risk/route.ts` *is* the agent: a fixed tool sequence that emits a
visible `steps[]` trace — interpret request → read position → identify collateral → call
the Binance Skill → select scenarios → compute → reconcile → explain.

**There is no LLM in the request path.** Every number comes from the chain or from
`stress.ts`, so none can be hallucinated, and the same inputs always give the same
output. The trade-off is that phrasing is templated rather than conversational, which is
the right side of that trade for a screen showing liquidation risk.

The UI calls the **same public endpoint** third parties do. One code path, so the
documented API is dogfooded by the demo and cannot silently drift from it.

### Files

| File | Role |
| --- | --- |
| `utils/risk/stress.ts` | Pure integer math. No I/O. |
| `utils/risk/wording.ts` | Every user-facing phrase, plus `FORBIDDEN_PHRASES`. |
| `services/binance/ethMarket.ts` | Public Binance endpoints, statistics, cache, degraded fallback. |
| `services/aave/readPosition.ts` | viem multicall over pool, oracle, data provider and aTokens. |
| `services/risk/assistant.ts` | The agent: tool sequence, trace, report assembly. |
| `services/risk/simulate.ts` | Stateless engine for a caller-supplied position. |
| `services/api/*` | Envelope, CORS, rate limiting, validation, OpenAPI. |
| `components/aave/BorrowRiskAssistant.tsx` | UI panel. Renders only what the server computed. |
| `scripts/borrowRiskSmokeCheck.ts` | Live end-to-end check (`yarn risk:smoke`). |

## Safety and wording

Every user-facing phrase lives in `utils/risk/wording.ts` so the language can be audited
in one read. `FORBIDDEN_PHRASES` is asserted against generated output across every
response variant in `assistant.test.ts` and `routes.test.ts`, so the constraint is
enforced rather than merely intended:

> `is safe`, `safe amount`, `cannot be liquidated`, `will not be liquidated`, `guarantee`,
> `guaranteed`, `financial advice` (outside the disclaimer's negation), `binance predicts`,
> `we predict`, `risk-free`

The assistant uses "stress-tested amount" rather than "safe amount", and "larger/smaller
liquidation buffer" rather than "safe/unsafe". Every response carries a `disclaimer` and
a `sources` array, so a third-party tool rendering the JSON inherits the caveats instead
of presenting bare numbers as advice.

The assistant **never submits a transaction**. "Use stress-tested amount" fills in the
amount field; the user still reviews and confirms the borrow themselves.

## Prerequisite: seeding the market

The Generation 2 hackathon market is deployed but **unseeded** — the dNZD reserve holds
no liquidity and no wETH has been supplied. The assistant reads this correctly and warns
about it, but a real borrow will revert until the pool is funded.

Verify the current state:

```bash
cd packages/nextjs
yarn risk:smoke
```

Look for `dNZD pool liquidity 0`. To seed, from the `/mnzd` page with the dNZD token
owner wallet connected:

1. **Supply dNZD liquidity.** dNZD tab → *Owner faucet* → mint e.g. `100000` → *Approve*
   → *Supply*. This gives the reserve something to lend.
2. **Supply wETH collateral.** wETH tab → enter e.g. `1` → *Supply ETH* (the gateway wraps
   and supplies in one transaction).
3. **Confirm.** Re-run `yarn risk:smoke`; `dNZD pool liquidity` and `collateral (base)`
   should both be non-zero, and `collateral legs` should be 1.

Step 1 requires the dNZD owner key. If you do not hold it, ask the owner to mint to your
address first; the rest of the flow needs no special permissions.

## Demo script

1. `yarn start`, open `http://localhost:3000/mnzd`, connect a Sepolia wallet.
2. Supply wETH collateral (wETH tab → *Supply ETH*).
3. Switch to the **dNZD** tab. The Borrow Risk Assistant appears above the market panel.
4. Point out **Aave protocol maximum** — the protocol's own answer, unchanged.
5. Type a borrow amount close to that maximum. The projected health factor updates.
6. Read the **market condition** line: live ETH price, daily volatility and deepest
   30-day fall, all from public Binance endpoints with no account.
7. Walk the stress table. Note the scenarios are *derived from that data* — the −2.17%
   row is today's measured 1σ, not a round number someone picked.
8. Point out the row that turns red, and the "ETH would need to fall about X%" line.
9. Change **stress tolerance** to 1.5 / 30%. The stress-tested amount drops.
10. Press **Use stress-tested amount** — it fills the borrow field and nothing more. The
    user still confirms.
11. Open **How was this calculated?** to show every input, both Binance URLs, the
    oracle-divergence note, the self-check against Aave, and the full agent trace.
12. Show the same result over the public API:

    ```bash
    curl "http://localhost:3000/api/v1/borrow-risk?address=0xYOUR_ADDRESS&borrowAmount=400"
    ```

## Known limitations

- **Oracle divergence.** Binance reports ETH in USD; the demo oracle treats NZ$1 as US$1
  and fixes ETH at 1800. The assistant discloses the gap rather than reconciling it —
  reconciling would require changing the oracle and destabilising a working demo. The
  stress table is unaffected (see *scale invariance* above); only absolute capacity is
  understated, by roughly 44%.
- **Mainnet ETH as the proxy for Sepolia wETH.** Sepolia test tokens have no meaningful
  market, so mainnet ETH behaviour is the only realistic input.
- **Rate limiting is per-instance.** Module-scope token buckets do not span serverless
  instances. Enough to protect the upstream RPC and Binance; not a real quota.
- **Interest accrual is ignored.** Scenarios shock price only. A position also drifts as
  variable borrow interest accrues, which the table does not project.
- **No correlation modelling.** wBTC collateral is not shocked alongside wETH, even though
  the two are highly correlated. Only wETH is marked shockable, so a mixed position is
  assessed more optimistically than reality would suggest. Flagged in the response as
  `hasOtherCollateral` with a warning.

## Testing

```bash
cd packages/nextjs
yarn vitest run     # unit + handler tests, no network
yarn risk:smoke     # live end-to-end against Sepolia and Binance
yarn check-types
yarn lint
```

`yarn risk:smoke` is the honest check: it hits the real chain and the real Binance
endpoints, prints both, and fails if the recomputed health factor disagrees with Aave's.
