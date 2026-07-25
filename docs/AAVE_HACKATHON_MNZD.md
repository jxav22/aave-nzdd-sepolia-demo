# Hackathon mNZD Market Integration

## What this is

A second Sepolia lending UI for the **custom** Aave V3 market deployed from [aave-v3-origin](https://github.com/) (`DeployHackathonMarket`). It is separate from the official Aave Sepolia EURS flow at `/aave`.

| Item | Value |
|------|--------|
| Route | [`/mnzd`](../packages/nextjs/app/mnzd/page.tsx) |
| Hook | `useAaveHackathonMnzd` |
| Asset | `mNZD` (Mock NZD Stable, **6 decimals**) |
| Config | [`packages/nextjs/config/hackathon-market.json`](../packages/nextjs/config/hackathon-market.json) |
| Typed config | [`packages/nextjs/config/aaveHackathonMnzd.ts`](../packages/nextjs/config/aaveHackathonMnzd.ts) |

**Not real NZDD / dNZD / zNZD.** Demo / hackathon only.

## User flow

1. Connect wallet on Ethereum Sepolia (`11155111`)
2. **Mint** `mNZD` — only the token owner (deployer) can call `mint(address,uint256)`. The `/mnzd` page shows an owner faucet when the connected wallet is owner.
3. **Approve** the hackathon Pool for an exact amount
4. **Supply** → read aToken balance
5. **Withdraw** partial or full (`maxUint256`)
6. **Borrow** mNZD against supplied mNZD (variable rate) → read variable debt + health factor
7. **Repay** partial or full (`maxUint256`) — approve first when allowance is insufficient

Approve and supply/repay stay as two separate wallet confirmations. Shared UI: `AaveMarketPanel` (same layout as `/aave`).

## Debug Contracts

Registered under Sepolia as:

- `HackathonPool`
- `HackathonMnzd`
- `HackathonAToken`
- `HackathonVariableDebt`

Official EURS contracts (`AaveV3Pool`, `SepoliaEURS`, `AaveSepoliaAToken`, `AaveSepoliaVariableDebt`) remain available as separate Debug tabs.

## Refreshing addresses after redeploy

1. Copy the latest `reports/hackathon-market.json` from the aave-v3-origin deploy repo into `packages/nextjs/config/hackathon-market.json`
2. Restart the Next.js app
3. Run `yarn test:aave` to confirm config still resolves

## Checks

```bash
yarn test:aave
yarn next:check-types
```
