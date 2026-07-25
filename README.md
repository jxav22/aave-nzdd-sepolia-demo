# Aave NZD Sepolia Demo

Scaffold-ETH 2 monorepo that demos a **private Aave V3 market on Ethereum Sepolia** with **wETH**, **wBTC**, and **dNZD** (demo NZD stable, 6 decimals) — plus a Binance-powered borrow risk API.

> **New here?** Start with [docs/HANDOVER.md](docs/HANDOVER.md) — verified live state, day-one blockers, and the path from prototype to product.

Built on [Scaffold-ETH 2](https://scaffoldeth.io) (Next.js, RainbowKit, Hardhat, Wagmi, Viem, TypeScript).

## What ships

| Surface | Route / entry | Notes |
| :--- | :--- | :--- |
| **Hackathon market UI** | [`/mnzd`](packages/nextjs/app/mnzd/page.tsx) | Primary: wrap/mint → approve → supply → borrow/repay dNZD |
| **Borrow Risk Assistant** | Panel on `/mnzd` (dNZD tab) | Stress-tests a proposed borrow; never submits a tx |
| **Public REST API** | `/api/v1/*` | OpenAPI at `/api/v1/openapi.json` — see [docs/API.md](docs/API.md) |
| **Developer playground** | `/developer-api` | Interactive forms over the v1 API |
| **API Agent** | `/binance-chat` | LLM over the same routes (`OPENAI_API_KEY`) |
| Official Aave EURS | `/aave` | Reference only — **hidden from nav** |

The custom market is deployed from the sibling repo `aave-v3-origin`, not from this monorepo. Addresses live in [`packages/nextjs/config/hackathon-market.json`](packages/nextjs/config/hackathon-market.json). `packages/hardhat` is stock Scaffold-ETH boilerplate — you do **not** need `yarn chain` / `yarn deploy` for product work.

**dNZD** is a mock stand-in. It is not production NewMoney / NZDD.

## Quickstart (Sepolia demo)

### Requirements

- [Node.js >= 22.10.0](https://nodejs.org/en/download/)
- [Yarn 4](https://yarnpkg.com/getting-started/install) (this repo uses `packageManager: yarn@4.13.0`)
- [Git](https://git-scm.com/downloads)
- A browser wallet on **Ethereum Sepolia** (`11155111`)

### Run

```bash
yarn install

# Optional but recommended — packages/nextjs/.env.local
#   ALCHEMY_API_KEY=...
#   NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=...
#   OPENAI_API_KEY=...          # only for /binance-chat
#   OPENAI_MODEL=gpt-4o-mini    # optional

yarn start
```

Open **http://localhost:3000/mnzd**.

Defaults for Alchemy and WalletConnect exist in `scaffold.config.ts` for prototyping; use your own keys for anything shared or public.

### Useful checks

```bash
yarn test:aave                          # Vitest (config, amounts, API, risk)
yarn next:check-types
yarn next:lint
cd packages/nextjs && yarn risk:smoke   # live position + Binance + stress engine
yarn aave:smoke                         # read-only official EURS market
```

Opt-in write e2e (needs a funded key that can mint dNZD):

```bash
AAVE_E2E=1 E2E_PRIVATE_KEY=0x… yarn aave:e2e
```

## Day-one reality check

As of the last live reconciliation ([HANDOVER §2](docs/HANDOVER.md#2-verified-live-state)):

- **wETH / wBTC** use live Chainlink Sepolia feeds; **dNZD** is a constant $1 mock (USD-referenced — see HANDOVER §4.2).
- Crypto collateral has been supplied by the admin; **dNZD pool liquidity was 0**, so borrows revert until someone supplies dNZD.
- Minting dNZD / wBTC is **owner-only**.

## Documentation

| Doc | Use it for |
| :--- | :--- |
| [docs/HANDOVER.md](docs/HANDOVER.md) | **Canonical** live market state, blockers, repo map, product gaps |
| [docs/AAVE_HACKATHON_MNZD.md](docs/AAVE_HACKATHON_MNZD.md) | `/mnzd` runbook, assets, e2e |
| [docs/BORROW_RISK_ASSISTANT.md](docs/BORROW_RISK_ASSISTANT.md) | Risk methodology, seeding, demo script |
| [docs/API.md](docs/API.md) | Public API v1 |
| [docs/AAVE_SEPOLIA.md](docs/AAVE_SEPOLIA.md) | Official EURS reference path (`/aave`) |
| [docs/WEB2_HANDOFF.md](docs/WEB2_HANDOFF.md) | Web2 → web3 onboarding for `/mnzd` |
| [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | Product framing / pitch honesty — **addresses superseded by HANDOVER** |
| [Scaffold-ETH 2 docs](https://docs.scaffoldeth.io) | SE-2 hooks, components, local Hardhat workflow |

## Local Hardhat playground (optional)

Unrelated to the Sepolia Aave demo:

```bash
yarn chain      # local chain
yarn deploy     # stock YourContract only
yarn start
```

See [Scaffold-ETH 2](https://docs.scaffoldeth.io) for the full starter-kit workflow.

## Deploy frontend

```bash
yarn vercel:yolo --prod
```

Do not expose `OPENAI_API_KEY` on a public deploy without gating `POST /api/v1/binance/chat` — CORS is open on the v1 API.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). For agent / AI guidance, see [AGENTS.md](AGENTS.md).
