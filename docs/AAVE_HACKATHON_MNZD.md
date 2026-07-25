# Hackathon Multi-Asset Market Integration

## What this is

Sepolia lending UI for the **custom** Aave V3 market deployed from sibling repo `aave-v3-origin` (`DeployHackathonMarket` / `ListHackathonWethWbtc`).

| Item | Value |
|------|--------|
| Route | [`/mnzd`](../packages/nextjs/app/mnzd/page.tsx) (nav: **Hackathon Market**) |
| Hook | `useAaveHackathonMnzd(selectedAsset)` |
| Assets | **wETH**, **wBTC**, **dNZD** |
| Address SoT | [`packages/nextjs/config/hackathon-market.json`](../packages/nextjs/config/hackathon-market.json) |
| Typed config | [`packages/nextjs/config/aaveHackathonMnzd.ts`](../packages/nextjs/config/aaveHackathonMnzd.ts) |
| Live state / blockers | [HANDOVER.md](./HANDOVER.md) |

**dNZD** is a demo NZD stable stand-in (6 decimals). **Not** production NewMoney issuance.

The official Aave Sepolia EURS UI at `/aave` is **hidden from nav** (route kept for reference). See [AAVE_SEPOLIA.md](./AAVE_SEPOLIA.md).

## Deployed addresses (committed config)

| Role | Address |
|------|---------|
| Market ID | `Web3NZ Hackathon dNZD Market` |
| Pool | `0xe1556e1f65Aa99682e96Ad3de866f446D2A1275e` |
| PoolAddressesProvider | `0x4e8a83e4061a9A3EC26f575f918C1CDb8775291b` |
| AaveOracle | `0x809779d09cB0B9F85D191761Ef4a0a0076eED429` |
| ProtocolDataProvider | `0x59d373bfc3E4c7c0813eE81566Fcf91C37f55D35` |
| WrappedTokenGateway | `0x2Ac0b0B36CD831d71D315AF868429C312d1C5B52` |
| Owner / token minter | `0x1bE00A54aF36eDF41f169258eCF27574EB61F10f` |

| Asset | Decimals | Underlying | Acquisition | Oracle |
|-------|----------|------------|-------------|--------|
| dNZD | 6 | `0x9c6ed608…9416F` | Owner `mint` | Mock $1 |
| wETH | 18 | `0xA9e6db07…2B508` | Wrap Sepolia ETH / gateway | Chainlink ETH/USD |
| wBTC | 8 | `0x82Ae4041…94a12` | Owner `mint` | Chainlink BTC/USD |

Full aToken / debt / feed addresses: `hackathon-market.json`. Reserve params (all three): LTV 82.5%, LT 86%, liq. bonus 5%, RF 10%, uncapped.

**This market’s WETH9 is not canonical Sepolia WETH.** Wrap only through the UI / gateway.

## Assets and how to get them

| Asset | Decimals | Acquisition |
|-------|----------|-------------|
| wETH | 18 | `WETH9.deposit`, or `WrappedTokenGateway.depositETH` (wrap + supply) |
| wBTC | 8 | Owner-only `mint` (TestnetERC20) |
| dNZD | 6 | Owner-only `mint` (TestnetERC20) |

Oracles: **dNZD** = constant `$1` mock (USD-referenced — see HANDOVER §4.2); **wETH / wBTC** = live Chainlink Sepolia feeds. Not production NZD FX.

## User flow

1. Connect wallet on Ethereum Sepolia (`11155111`)
2. **wETH tab:** wrap ETH → approve → supply (or one-click Supply ETH via gateway)
3. Optionally mint/supply **wBTC**
4. **dNZD tab:** mint (owner) / **supply liquidity** (required before anyone can borrow); **borrow dNZD** against wETH/wBTC collateral
5. Use **Borrow Risk Assistant** before borrowing (optional, read-only)
6. Repay / withdraw as needed

Approve and supply/repay stay as two separate wallet confirmations (except gateway `depositETH`). Shared UI: `AaveMarketPanel`.

### Blocker: empty dNZD reserve

If `Pool.borrow(dNZD, …)` reverts, the reserve likely has **zero liquidity**. Confirm with:

```bash
cd packages/nextjs && yarn risk:smoke
```

Admin path: connect owner wallet → dNZD tab → mint → approve → supply. Details: [HANDOVER §4.1](./HANDOVER.md#41-the-dnzd-reserve-has-zero-liquidity--nothing-can-be-borrowed).

## Debug Contracts

Registered under Sepolia as:

- `HackathonPool`
- `HackathonMnzd` / `HackathonWeth` / `HackathonWbtc`
- `HackathonATokenMnzd` / `HackathonATokenWeth` / `HackathonATokenWbtc`
- `HackathonDebtMnzd` / `HackathonDebtWeth` / `HackathonDebtWbtc`
- `HackathonWrappedTokenGateway`

Deprecated aliases `HackathonAToken` / `HackathonVariableDebt` still point at the dNZD tokens — prefer the per-asset names.

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

1. Copy `reports/hackathon-market.json` from `aave-v3-origin` → `packages/nextjs/config/hackathon-market.json`
2. Restart the Next app (config validates at import)
3. `yarn test:aave` and `cd packages/nextjs && yarn risk:smoke`
4. Update [HANDOVER.md](./HANDOVER.md) §2
