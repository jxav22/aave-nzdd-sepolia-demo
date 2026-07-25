# Hackathon Multi-Asset Market (Deploy Path)

## 1. What this deploy path does

This Foundry path deploys a **custom Aave V3 market** (not the official Aave Sepolia market) and lists:

| Asset | Token | Oracle | How demo users get it |
|-------|-------|--------|------------------------|
| **dNZD** | `TestnetERC20` (6 decimals, owner-mintable) | Fixed **NZ$1.00** mock | Owner `mint` |
| **wETH** | `WETH9` | Fixed **NZ$3,090** `SettableAggregator` | Wrap Sepolia ETH via `deposit()` |
| **wBTC** | `TestnetERC20` (8 decimals, owner-mintable) | Fixed **NZ$106,526** `SettableAggregator` | Owner `mint` |

Prices are NZD unit-of-account figures (USD snapshot ÷ NZD/USD ≈ 0.60, rounded). The owner of each `SettableAggregator` can call `setLatestAnswer` to shock collateral for liquidation demos.

It also deploys **WrappedTokenGateway** (when `wrappedNativeToken` is set) so clients can `depositETH`.

Client handoff: [`reports/hackathon-market.json`](../reports/hackathon-market.json).

Pitch context: Web3NZ hackathon — supply crypto collateral (wETH/wBTC) and borrow dNZD (demo NZD stable).

## 2. What it does not do

- Does **not** ship a frontend (see the separate client repo)
- Does **not** use official Aave Sepolia / `@aave-dao/aave-address-book`
- Does **not** mint real NewMoney / production NZD stablecoins (this `dNZD` is a demo `TestnetERC20`)
- Does **not** change core Pool math — listing + config only
- Does **not** use live Chainlink feeds on the listed market (those addresses remain in [`HackathonChainlinkFeeds.sol`](../src/deployments/hackathon/HackathonChainlinkFeeds.sol) for reference only)

## 3. Fresh deploy vs add assets to existing market

### Fresh multi-asset deploy

```bash
forge script scripts/DeployHackathonMarket.sol:DeployHackathonMarket \
  --rpc-url sepolia \
  --broadcast \
  --private-key 0xYOUR_KEY
```

Deploys fixed NZD `SettableAggregator`s for wETH/wBTC and a constant NZ$1 mock for dNZD ([`HackathonFixedNzddPrices.sol`](../src/deployments/hackathon/HackathonFixedNzddPrices.sol)).

### Add wETH + wBTC to the existing Sepolia dNZD market

Prefer this when the pool/dNZD addresses must stay stable:

```bash
forge script scripts/ListHackathonWethWbtc.sol:ListHackathonWethWbtc \
  --rpc-url sepolia \
  --broadcast \
  --private-key 0xYOUR_KEY
```

Requires the deployer to still be ACL pool admin on the existing market.

### Point an already-listed market at fixed NZD oracles

If wETH/wBTC were listed with Chainlink USD sources, swap them to fixed NZD mocks (does **not** touch dNZD):

```bash
forge script scripts/UpdateHackathonWethWbtcOracles.sol:UpdateHackathonWethWbtcOracles \
  --rpc-url sepolia \
  --broadcast \
  --private-key 0xYOUR_KEY
```

Requires pool admin (or asset listing admin). Copy the logged feed addresses into the client `hackathon-market.json`. Update the script constants if your market addresses differ from the client handoff.

To demo a health-factor drop afterwards, call `setLatestAnswer` on the wETH `SettableAggregator` as its owner.

## 4. Required environment

| Variable | Purpose |
|----------|---------|
| `RPC_SEPOLIA` | Sepolia RPC URL (`foundry.toml` → `sepolia`) |
| Deployer key | Foundry `--private-key`, keystore, or env via your usual Foundry flow |

See prior docs for `.env` / PowerShell setup of `RPC_SEPOLIA`.

## 5. Install / test / deploy

```bash
# Local smoke (no broadcast)
forge test --match-path tests/hackathon/HackathonMarket.t.sol -vv

# Fresh deploy (Sepolia — fixed NZD oracles)
forge script scripts/DeployHackathonMarket.sol:DeployHackathonMarket \
  --rpc-url sepolia \
  --broadcast \
  --private-key 0xYOUR_KEY
```

After broadcast, copy `reports/hackathon-market.json` into the client repo.

## 6. Client handoff schema

```json
{
  "chainId": 11155111,
  "marketId": "Web3NZ Hackathon dNZD Market",
  "pool": "0x...",
  "poolAddressesProvider": "0x...",
  "aaveOracle": "0x...",
  "protocolDataProvider": "0x...",
  "aclManager": "0x...",
  "configEngine": "0x...",
  "wrappedTokenGateway": "0x...",
  "assets": [
    {
      "symbol": "dNZD",
      "decimals": 6,
      "underlying": "0x...",
      "aToken": "0x...",
      "variableDebtToken": "0x...",
      "priceFeed": "0x...",
      "mintable": true,
      "acquisition": "ownerMint"
    },
    {
      "symbol": "wETH",
      "decimals": 18,
      "underlying": "0x...",
      "aToken": "0x...",
      "variableDebtToken": "0x...",
      "priceFeed": "0x...",
      "mintable": false,
      "acquisition": "wrapNative"
    },
    {
      "symbol": "wBTC",
      "decimals": 8,
      "underlying": "0x...",
      "aToken": "0x...",
      "variableDebtToken": "0x...",
      "priceFeed": "0x...",
      "mintable": true,
      "acquisition": "ownerMint"
    }
  ],
  "underlying": { "symbol": "dNZD", "decimals": 6, "address": "0x..." },
  "aToken": "0x...",
  "variableDebtToken": "0x...",
  "priceFeed": "0x...",
  "notes": "..."
}
```

## 7. Related

- Fixed prices: [`HackathonFixedNzddPrices.sol`](../src/deployments/hackathon/HackathonFixedNzddPrices.sol)
- Settable feed: [`SettableAggregator.sol`](../src/contracts/mocks/oracle/CLAggregators/SettableAggregator.sol)
- Oracle swap for already-listed Chainlink sources: [`UpdateHackathonWethWbtcOracles.sol`](../scripts/UpdateHackathonWethWbtcOracles.sol)
