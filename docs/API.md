# Borrow Risk Assistant — Public API v1

Stress-tests Aave V3 borrowing positions against recent ETH market behaviour sourced from
public Binance endpoints.

Open and unauthenticated. **No API key, no Binance account, no wallet signature.** Every
endpoint is read-only — nothing here can move funds, hold funds or sign anything.

Base URL in local development: `http://localhost:3000`

Machine-readable spec: [`GET /api/v1/openapi.json`](#get-apiv1openapijson) (OpenAPI 3.1).

## Contents

- [Interactive demo](#interactive-demo)
- [Conventions](#conventions)
- [`GET /api/v1/borrow-risk`](#get-apiv1borrow-risk)
- [`POST /api/v1/borrow-risk/simulate`](#post-apiv1borrow-risksimulate)
- [`GET /api/v1/position/{address}`](#get-apiv1positionaddress)
- [`GET /api/v1/market/eth`](#get-apiv1marketeth)
- [`GET /api/v1/binance/token/search`](#get-apiv1binancetokensearch)
- [`GET /api/v1/binance/token/dynamic`](#get-apiv1binancetokendynamic)
- [`GET /api/v1/binance/token/meta`](#get-apiv1binancetokenmeta)
- [`GET|POST /api/v1/binance/chat`](#using-the-api-as-agent-tools) — LLM agent; needs `OPENAI_API_KEY`
- [`GET /api/v1/openapi.json`](#get-apiv1openapijson)
- [Using the API as agent tools](#using-the-api-as-agent-tools)
- [Requirements for clients](#requirements-for-clients)

## Interactive demo

In the Scaffold-ETH app, open the **Developer API** tab (`/developer-api`). It exercises the
main v1 routes with live forms, summary cards, and the raw response envelope (status,
rate-limit headers, JSON body). The **API Agent** tab (`/binance-chat`) drives the same
routes from natural language — see [using the API as agent tools](#using-the-api-as-agent-tools).

## Conventions

### Envelope

Every response, success or failure, uses one shape. Branch on `ok`:

```jsonc
{ "ok": true,  "schemaVersion": "1.0.0", "data": { /* … */ } }
{ "ok": false, "schemaVersion": "1.0.0",
  "error": { "code": "INVALID_ADDRESS", "message": "…", "field": "address" } }
```

### Error codes

`error.code` is stable and safe to branch on. `error.message` is for humans and may change.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `INVALID_ADDRESS` | 400 | Missing or malformed Ethereum address. |
| `INVALID_AMOUNT` | 400 | Amount is not a non-negative decimal, or has too many decimal places. |
| `INVALID_TARGET_HEALTH_FACTOR` | 400 | Not a decimal, below 1.0, or above 100. |
| `INVALID_SHOCK` | 400 | Shock outside 0–100%. |
| `INVALID_BODY` | 400 | Malformed JSON, or a field failed validation. |
| `RATE_LIMITED` | 429 | Per-IP limit exceeded. See `Retry-After`. |
| `UPSTREAM_RPC_ERROR` | 502 | The Sepolia RPC could not be reached. |
| `INTERNAL_ERROR` | 500 | Unexpected failure. |

Failure to reach Binance is deliberately **not** an error. The response degrades to fixed
scenarios with `degraded: true`, so an integrator's tool keeps working.

### Numbers

Chain-derived quantities are **decimal strings** with an explicit `decimals` sibling,
never JSON numbers. Health factors are WAD-scaled (`1e18` = 1.0). Parse them with `BigInt`
or a decimal library — as IEEE doubles they lose precision, which is the one thing this
API exists to get right.

```jsonc
"protocolMaximum": { "raw": "1485000000", "decimals": 6, "formatted": "1485", "symbol": "dNZD" }
```

`formatted` is a display convenience. `raw` + `decimals` is the contract.

Market statistics from Binance *are* plain numbers — they are approximate by nature and
carry no on-chain precision.

### Rate limits

Per-IP token bucket, 60 req/min on chain-reading routes and 120 req/min on `simulate` and
`market/eth`. Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
`X-RateLimit-Reset`; a 429 adds `Retry-After`.

Best-effort: buckets live in instance memory, so on a serverless deployment the effective
limit scales with instance count. Do not rely on it as a quota.

### CORS and caching

`Access-Control-Allow-Origin: *` on every response including errors, with no credentials.
Appropriate because the API is read-only and non-custodial.

`market/eth` sends `public, max-age=30, stale-while-revalidate=60` and is backed by a
60-second server cache, so public traffic cannot fan out to Binance. Chain-reading routes
send `no-store`.

---

## `GET /api/v1/borrow-risk`

The full assistant against the hackathon Aave market on Sepolia. This is the endpoint the
app's own UI calls.

| Parameter | Required | Default | Description |
| --- | --- | --- | --- |
| `address` | yes | — | Wallet to assess. |
| `borrowAmount` | no | `0` | Proposed borrow in dNZD, as a decimal string. |
| `targetHealthFactor` | no | `1.2` | Health factor to hold after the shock. Minimum 1.0. |
| `shockPercent` | no | `20` | ETH decline, as a positive percentage. |

```bash
curl "http://localhost:3000/api/v1/borrow-risk?address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&borrowAmount=400&targetHealthFactor=1.2&shockPercent=20"
```

### `data`

| Field | Description |
| --- | --- |
| `market` | Chain ID, market ID, pool, oracle, block number, asset symbols. |
| `position` | Collateral, debt, borrowing capacity, liquidation threshold, current health factor. |
| `proposal.protocolMaximum` | **Aave's own limit.** Not a recommendation. |
| `proposal.projectedHealthFactor` | Health factor if the proposed borrow were taken. |
| `proposal.liquidationAtEthChangePercent` | ETH decline at which the projected position reaches 1.0. `null` if unreachable. |
| `stressTest.stressTestedMaximum` | Borrow that holds `targetHealthFactor` through `shockPercent`, clamped to Aave's limit. |
| `stressTest.cappedByProtocolMaximum` | True when Aave's limit binds before the stress test does. |
| `scenarios[]` | The stress table: label, `ethPriceChangePercent`, `derivedFrom`, projected health factor, `liquidatable`, `interpretation`. |
| `marketContext` | Binance data, the endpoints called, `authenticationRequired: false`, `degraded`. |
| `oracleDivergence` | Aave's oracle prices next to Binance's, with a note on the gap. |
| `selfCheck` | Recomputed vs Aave-reported health factor, and whether they agree. |
| `warnings[]` | Liquidity, mixed-collateral and reconciliation warnings. |
| `explanation` | Plain-language summary. |
| `steps[]` | The agent's tool trace. |
| `sources[]`, `disclaimer`, `methodology` | Provenance and caveats. |

`derivedFrom` is one of `current`, `volatility`, `drawdown`, `reference`, `user`,
`fallback` — so a client can tell a measured scenario from a fixed one.

### Response (abridged)

```jsonc
{
  "ok": true,
  "schemaVersion": "1.0.0",
  "data": {
    "proposal": {
      "protocolMaximum": { "raw": "1485000000", "decimals": 6, "formatted": "1485", "symbol": "dNZD" },
      "proposedBorrow":  { "raw": "1200000000", "decimals": 6, "formatted": "1200", "symbol": "dNZD" },
      "projectedHealthFactor": { "raw": "1290000000000000000", "formatted": "1.29" },
      "liquidationAtEthChangePercent": -22.48
    },
    "stressTest": {
      "targetHealthFactor": { "raw": "1200000000000000000", "formatted": "1.2" },
      "shockEthPriceChangePercent": -20,
      "stressTestedMaximum": { "raw": "1032000000", "decimals": 6, "formatted": "1032", "symbol": "dNZD" },
      "cappedByProtocolMaximum": false
    },
    "scenarios": [
      { "label": "Current price", "ethPriceChangePercent": 0, "derivedFrom": "current",
        "projectedHealthFactor": { "raw": "1290000000000000000", "formatted": "1.29" },
        "liquidatable": false, "interpretation": "Moderate liquidation buffer" },
      { "label": "1-day 1 sigma move (-2.2%)", "ethPriceChangePercent": -2.17, "derivedFrom": "volatility",
        "projectedHealthFactor": { "raw": "1262013000000000000", "formatted": "1.26" },
        "liquidatable": false, "interpretation": "Moderate liquidation buffer" },
      { "label": "Severe reference (-25%)", "ethPriceChangePercent": -25, "derivedFrom": "reference",
        "projectedHealthFactor": { "raw": "967500000000000000", "formatted": "0.96" },
        "liquidatable": true, "interpretation": "Liquidatable" }
    ],
    "marketContext": {
      "source": "Binance Skill query-token-info (dynamic + kline), public endpoints",
      "ethPriceUsd": 1856.73, "change24hPercent": -1.83,
      "dailyVolatilityPercent": 2.167, "maxDrawdown30dPercent": -9.6164,
      "candleCount": 31, "degraded": false, "authenticationRequired": false
    },
    "selfCheck": { "aaveReportedHealthFactor": { "formatted": "1.29" },
                   "recomputedHealthFactor": { "formatted": "1.29" }, "matches": true },
    "disclaimer": "Illustrative scenarios based on recent public market data, not a prediction and not financial advice. …"
  }
}
```

---

## `POST /api/v1/borrow-risk/simulate`

**Bring your own position.** No wallet, no chain read, no dependency on our market — the
caller supplies collateral legs, debt and liquidation thresholds in a shared base
currency, so any Aave-compatible position can be assessed. This is the endpoint to build
on if you have your own market.

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| `collateral[]` | yes | — | 1–10 legs. See below. |
| `debtBase` | no | `"0"` | Existing debt, integer string in base units. |
| `proposedBorrowBase` | no | `"0"` | Proposed additional debt, integer string in base units. |
| `targetHealthFactor` | no | `"1.2"` | Minimum 1.0. |
| `shockPercent` | no | `20` | ETH decline for the stress-tested amount. |
| `shocksBps[]` | no | derived | Explicit scenarios, signed basis points, −10000 to 0. |
| `baseDecimals` | no | `8` | Decimals of your base currency. |

Each collateral leg: `symbol` (optional), `valueBase` (integer string), 
`liquidationThresholdBps` (0–10000), `shockable` (default `true` — set `false` for stable
collateral that should hold its value in a scenario).

**Supplying `shocksBps` skips the Binance call entirely**, making the response fully
deterministic and independent of any external service. Omit it to have scenarios derived
from live market data.

```bash
curl -X POST "http://localhost:3000/api/v1/borrow-risk/simulate" \
  -H "Content-Type: application/json" \
  -d '{
    "collateral": [
      { "symbol": "WETH", "valueBase": "180000000000", "liquidationThresholdBps": 8600, "shockable": true }
    ],
    "debtBase": "0",
    "proposedBorrowBase": "120000000000",
    "targetHealthFactor": "1.2",
    "shockPercent": 20,
    "baseDecimals": 8
  }'
```

Returns `projectedHealthFactor`, `liquidationAtEthChangePercent`, `stressTest`,
`scenarios[]`, `scenarioSource` (`caller-supplied` / `binance-market-data` /
`fixed-fallback`), `marketContext` (`null` when scenarios were supplied), `methodology`,
`sources[]` and `disclaimer`.

---

## `GET /api/v1/position/{address}`

The raw Aave read, including the `currentLiquidationThreshold` the dApp's own hooks
discard. Useful if you want the position but intend to do your own risk maths.

```bash
curl "http://localhost:3000/api/v1/position/0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
```

Returns `market` (addresses, block, base-currency decimals), `account` (totals,
thresholds, health factor, and whether the per-asset legs reconcile against Aave's
reported total), `reserves[]` (per-asset oracle price, LTV, liquidation threshold, supplied
balance, flags) and `borrowAsset` (user debt and **pool liquidity** — check this before
assuming a borrow will succeed).

---

## `GET /api/v1/market/eth`

The Binance-derived ETH market context on its own, plus the scenarios derived from it. No
RPC involved, so this endpoint works even if the chain is unreachable.

```bash
curl "http://localhost:3000/api/v1/market/eth"
```

```jsonc
{
  "ok": true,
  "schemaVersion": "1.0.0",
  "data": {
    "symbol": "WETH",
    "price": { "usd": 1856.73, "change24hPercent": -1.83, "high24hUsd": 1958.09, "low24hUsd": 1845.93 },
    "volatility": { "dailySigmaPercent": 2.167, "maxDrawdown30dPercent": -9.6164, "candleCount": 31,
                    "windowStart": "2026-06-25T00:00:00.000Z", "windowEnd": "2026-07-25T00:00:00.000Z" },
    "derivedScenarios": [
      { "label": "Current price", "ethPriceChangePercent": 0, "derivedFrom": "current" },
      { "label": "1-day 1 sigma move (-2.2%)", "ethPriceChangePercent": -2.17, "derivedFrom": "volatility" }
    ],
    "provenance": {
      "source": "Binance Skill query-token-info (dynamic + kline), public endpoints",
      "endpoints": ["https://web3.binance.com/…", "https://dquery.sintral.io/…"],
      "authenticationRequired": false,
      "asOf": "2026-07-25T07:07:08.869Z",
      "degraded": false,
      "degradedReason": null
    }
  }
}
```

`dailySigmaPercent` is the sample standard deviation of daily log returns.
`maxDrawdown30dPercent` is the deepest intraday-high to intraday-low fall in the window.

---

## `GET /api/v1/binance/token/search`

Proxies the public Binance Web3 `query-token-info` search skill. No authentication.

| Parameter | Required | Description |
| --- | --- | --- |
| `q` | yes | Token symbol, name, or contract address (max 64 chars). |
| `chainIds` | no | Comma-separated allowlisted ids: `1`, `56`, `8453`, `CT_501`. |

```bash
curl "http://localhost:3000/api/v1/binance/token/search?q=WETH&chainIds=1"
```

Returns `results[]` (chain, contract, symbol, price, volume, liquidity) plus `provenance`
naming the skill and upstream endpoint.

---

## `GET /api/v1/binance/token/dynamic`

Live market data for one token from the same skill: price, 24h change and range, volume,
liquidity, market cap, holder count. Address the token by chain and contract — search first
if you only have a symbol.

| Parameter | Required | Description |
| --- | --- | --- |
| `chainId` | yes | `1`, `56`, `8453` or `CT_501`. |
| `contractAddress` | yes | Token contract, as returned by search. |

```bash
curl "http://localhost:3000/api/v1/binance/token/dynamic?chainId=1&contractAddress=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
```

---

## `GET /api/v1/binance/token/meta`

Static metadata for one token: name, symbol, decimals, icon, website and socials. Same
parameters as the dynamic endpoint.

```bash
curl "http://localhost:3000/api/v1/binance/token/meta?chainId=1&contractAddress=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
```

---

## `GET /api/v1/openapi.json`

OpenAPI 3.1 description of the whole surface, with `servers[0].url` set from the incoming
request. Importable into Postman, Insomnia or a codegen client.

```bash
curl "http://localhost:3000/api/v1/openapi.json" > borrow-risk.openapi.json
```

Two vendor extensions describe how the app's own chat agent consumes this document:
`x-agent-tool: false` marks an operation the agent must not call (the chat endpoint, which
would recurse), and `x-agent-example` carries a natural-language prompt that exercises the
operation. Both are safe to ignore.

---

## Using the API as agent tools

The chat agent at `/binance-chat` has no private capabilities: its toolset is generated
from this document at request time, and each tool call is an ordinary HTTP request to the
endpoints above. Anything it answers, you can reproduce with curl.

```bash
curl -X POST "http://localhost:3000/api/v1/binance/chat" \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"What is WETH trading at on Ethereum?"}]}'
```

The response carries the answer plus the calls behind it and follow-up prompts generated
from the conversation:

```jsonc
{
  "ok": true,
  "data": {
    "reply": "…",
    "toolCalls": [
      { "name": "searchBinanceTokens", "method": "GET",
        "path": "/api/v1/binance/token/search?q=WETH&chainIds=1", "status": 200, "ok": true }
    ],
    "suggestions": ["How deep is WETH liquidity on Base?"],
    "provenance": { "api": "v1", "toolSource": "GET /api/v1/openapi.json", "tools": ["…"] }
  }
}
```

`POST /api/v1/binance/chat` is the one endpoint that needs configuration — `OPENAI_API_KEY`
in `packages/nextjs/.env.local` — because it spends an LLM key. `GET` on the same path
reports whether it is configured and lists the operations the agent may call. Tool calls
carry the original caller's address, so they are rate-limited against the user rather than
the server.

---

## Requirements for clients

These are conditions of use, not suggestions. The API returns risk figures that a user
could act on financially.

1. **Render the `disclaimer`.** Every risk response carries one. Display it alongside the
   numbers. Do not present the output as advice or as a prediction.
2. **Do not relabel `stressTestedMaximum` as a safe amount.** It is the borrow that holds
   a chosen health factor through one chosen scenario. Other scenarios exist.
3. **Attribute the market data.** `marketContext.source` names the Binance endpoints. Do
   not present the figures as your own, and do not imply Binance forecasts anything.
4. **Keep Aave authoritative.** `proposal.protocolMaximum` is Aave's limit;
   `stressTest.stressTestedMaximum` is ours and is always the more conservative of the
   two. Never present ours as raising a limit.
5. **Handle `degraded: true`.** When Binance is unreachable the scenarios are fixed
   reference declines, not measured behaviour. Say so.
6. **Check `selfCheck.matches`.** When false, our collateral model disagrees with Aave and
   the scenarios may not reflect how the protocol values the position.
7. **Check `borrowAsset.poolLiquidity`.** Borrowing capacity is not the same as available
   liquidity. A borrow above the reserve's liquidity reverts.

## Support

Methodology, assumptions and known limitations:
[`BORROW_RISK_ASSISTANT.md`](./BORROW_RISK_ASSISTANT.md).
