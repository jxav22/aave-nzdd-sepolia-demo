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

Oracles are **mocks** (fixed demo prices). Do not treat them as live FX feeds.

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

## Refreshing addresses after redeploy

Copy a fresh `reports/hackathon-market.json` from aave-v3-origin into `packages/nextjs/config/hackathon-market.json`, then restart the Next app.
