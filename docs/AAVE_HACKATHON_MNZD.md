# Hackathon Multi-Asset Market Integration

## What this is

Sepolia lending UI for the **custom** Aave V3 market deployed from [aave-v3-origin](https://github.com/) (`DeployHackathonMarket` / `ListHackathonWethWbtc`).

| Item | Value |
|------|--------|
| Route | [`/mnzd`](../packages/nextjs/app/mnzd/page.tsx) (nav: **Hackathon Market**) |
| Hook | `useAaveHackathonMnzd(selectedAsset)` |
| Assets | **wETH**, **wBTC**, **dNZD** |
| Config | [`packages/nextjs/config/hackathon-market.json`](../packages/nextjs/config/hackathon-market.json) |
| Typed config | [`packages/nextjs/config/aaveHackathonMnzd.ts`](../packages/nextjs/config/aaveHackathonMnzd.ts) |

**dNZD** is a demo NZD stable stand-in (6 decimals). **Not** production NewMoney issuance.

The official Aave Sepolia EURS UI at `/aave` is **hidden from nav** for this demo (route kept for reference).

## Assets and how to get them

| Asset | Decimals | Acquisition |
|-------|----------|-------------|
| wETH | 18 | Wrap Sepolia ETH via `WETH9.deposit`, or `WrappedTokenGateway.depositETH` (wrap + supply) |
| wBTC | 8 | Owner-only `mint` (TestnetERC20) |
| dNZD | 6 | Owner-only `mint` (TestnetERC20) |

Oracles: **dNZD** uses a `$1` mock; **wETH** / **wBTC** use Chainlink Sepolia ETH/USD and BTC/USD. Testnet feeds — not production NZD FX.

## User flow

1. Connect wallet on Ethereum Sepolia (`11155111`)
2. **wETH tab:** wrap ETH → approve → supply (or one-click Supply ETH via gateway)
3. Optionally mint/supply **wBTC**
4. **dNZD tab:** mint (owner) / supply liquidity; **borrow dNZD** against wETH/wBTC collateral
5. Repay / withdraw as needed

Approve and supply/repay stay as two separate wallet confirmations (except gateway `depositETH`). Shared UI: `AaveMarketPanel`.

## Debug Contracts

Registered under Sepolia as:

- `HackathonPool`
- `HackathonMnzd` / `HackathonWeth` / `HackathonWbtc`
- `HackathonATokenMnzd` / `HackathonATokenWeth` / `HackathonATokenWbtc`
- `HackathonDebtMnzd` / `HackathonDebtWeth` / `HackathonDebtWbtc`
- `HackathonWrappedTokenGateway`

## On-chain e2e (viem / Sepolia)

Gated write tests that exercise the same Pool calls as `useAaveHackathonMnzd` (no UI):

1. **Same-asset dNZD** — mint → approve → supply → borrow → repayAll → withdrawAll  
2. **Cross-asset** — seed dNZD liquidity → `supplyEth` → borrow dNZD → repayAll → withdraw wETH  

```bash
# From repo root (requires the dNZD token owner key + Sepolia ETH for gas/wrap)
# PowerShell:
$env:AAVE_E2E="1"
$env:E2E_PRIVATE_KEY="0x..."
# optional: $env:ALCHEMY_API_KEY="..."  or  $env:SEPOLIA_RPC_URL="..."
yarn aave:e2e
```

Fails fast if `AAVE_E2E` / `E2E_PRIVATE_KEY` are missing. Excluded from `yarn test:aave`. Suites live under `packages/nextjs/e2e/`.

## Refreshing addresses after redeploy

Copy a fresh `reports/hackathon-market.json` from aave-v3-origin into `packages/nextjs/config/hackathon-market.json`, then restart the Next app.
