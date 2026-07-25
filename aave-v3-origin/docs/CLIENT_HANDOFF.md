# Client Engineer Handoff (Hackathon dNZD Market)

This guide is for engineers building the **frontend / SDK repo** that talks to the custom Aave V3 market deployed from **this** repository.

This repo is **deploy-only**. The UI lives elsewhere.

For Foundry deploy details, see [HACKATHON_MARKET.md](./HACKATHON_MARKET.md).

---

## 1. What you’re integrating

A **custom** Aave V3 market on Ethereum Sepolia (or whatever `chainId` is in the report) with a stand-in stable `dNZD`.


| This is                            | This is not                                          |
| ---------------------------------- | ---------------------------------------------------- |
| Your team’s deployed Pool + `dNZD` | Official Aave Sepolia (`AaveV3Sepolia` address book) |
| Mock NZD stand-in (6 decimals)     | Production NewMoney / NZDD issuance                  |
| Demo / hackathon market            | Production lending                                   |


Do **not** point the client at the official Aave Sepolia Pool or EURS/USDC reserves from the address book.

---



## 2. Day-1: wire addresses from the report

1. Get a fresh `[reports/hackathon-market.json](../reports/hackathon-market.json)` from whoever ran the deploy script.
2. Map fields into your client config:


| JSON field             | Client use                                       |
| ---------------------- | ------------------------------------------------ |
| `chainId`              | Wallet / RPC network check                       |
| `pool`                 | `approve` spender + `supply` / `withdraw` target |
| `underlying.address`   | ERC-20 `dNZD`                                    |
| `underlying.decimals`  | Amount parsing (expect `6`)                      |
| `aToken`               | Supplied balance (`balanceOf`)                   |
| `aaveOracle`           | Optional price reads                             |
| `protocolDataProvider` | Optional reserve metadata                        |


1. Confirm the wallet is on the same `chainId` (Sepolia = `11155111` when deployed there).

---



## 3. User flow

1. **Mint** `dNZD` — token owner (deployer) calls `mint(address,uint256)` on the underlying (demo faucet). Users cannot mint unless you add a faucet UI that the owner operates.
2. **Approve** — `dNZD.approve(pool, amount)` (exact amount preferred).
3. **Supply** — `pool.supply(dNZD, amount, user, 0)`.
4. **Read position** — `aToken.balanceOf(user)`.
5. **Withdraw** — `pool.withdraw(dNZD, amount, user)` or `type(uint256).max` for full exit.

Keep approve and supply as **two separate** user-confirmed transactions.

---



## 4. Minimal ABI surface

You only need:

- ERC-20: `balanceOf`, `allowance`, `approve`, `decimals`, `symbol` (+ `mint` for owner faucet)
- Pool: `supply`, `withdraw`, `getReserveData` (optional)
- aToken: `balanceOf`

Full protocol ABIs are unnecessary for a supply/withdraw demo.

---



## 5. Common failures


| Symptom                      | Likely cause                               | Fix                                                |
| ---------------------------- | ------------------------------------------ | -------------------------------------------------- |
| Wrong network / empty reads  | Wallet not on report `chainId`             | Switch to Sepolia (or the deployed chain)          |
| Tx fails: insufficient funds | No gas token                               | Fund wallet with Sepolia ETH                       |
| Balance 0 for `dNZD`         | Not minted / wrong token address           | Mint via owner; use `underlying.address` from JSON |
| Supply reverts               | Wrong Pool (official Aave) or no allowance | Use `pool` from JSON; approve first                |
| Oracle / HF surprises        | Mock `$1` feed                             | Expected for hackathon; not real NZD FX            |
| Withdraw reverts             | Low liquidity or health factor             | Try smaller amount; check borrows                  |


---



## 6. Next reading


| Doc                                          | When                                  |
| -------------------------------------------- | ------------------------------------- |
| [HACKATHON_MARKET.md](./HACKATHON_MARKET.md) | Redeploy, listing params, limitations |
| `reports/hackathon-market.json`              | Live addresses after deploy           |


**Reminder:** `dNZD` is a prototype stand-in only. It is **not** NewMoney issuance and **not** production.