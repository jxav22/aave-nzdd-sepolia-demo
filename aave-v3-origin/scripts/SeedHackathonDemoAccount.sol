// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {Script} from 'forge-std/Script.sol';
import {console} from 'forge-std/console.sol';

import {TestnetERC20} from '../src/contracts/mocks/testnet-helpers/TestnetERC20.sol';
import {IPool} from '../src/contracts/interfaces/IPool.sol';
import {IPoolDataProvider} from '../src/contracts/interfaces/IPoolDataProvider.sol';
import {IWrappedTokenGatewayV3} from '../src/contracts/helpers/interfaces/IWrappedTokenGatewayV3.sol';

/**
 * @title SeedHackathonDemoAccount
 * @notice Minimum Sepolia funding for a ~3 min /mnzd hackathon demo.
 *
 * Assumes the dNZD reserve is already at marketing scale (~NZ$2,000,000 deposited,
 * ~45% utilisation via SeedHackathonYieldSnapshot). This script does NOT top up pool
 * liquidity (that would dilute util); it only funds the presenter wallet.
 *
 * Demo story: supply crypto collateral → borrow dNZD → (optional) risk UI → repay.
 * This script (run as dNZD owner) prepares:
 *   1. Demo wallet Sepolia ETH (gas for borrow / repay / UI txs)
 *   2. Small dNZD on the demo wallet (repay interest dust)
 *   3. Pre-supplied wETH collateral on behalf of the demo wallet (skip to Borrow Risk UI)
 *
 * Env:
 *   PRIVATE_KEY   — dNZD token owner / market deployer (CLI flag)
 *   RPC_SEPOLIA   — used via foundry.toml `sepolia` endpoint
 *
 * Broadcast (bash) — pass the demo wallet as the first script arg:
 *   export RPC_SEPOLIA="https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
 *   export PRIVATE_KEY="0x..."
 *   forge script scripts/SeedHackathonDemoAccount.sol:SeedHackathonDemoAccount \
 *     --sig "run(address)" \
 *     0xYOUR_DEMO_WALLET \
 *     --rpc-url sepolia \
 *     --broadcast \
 *     --private-key "$PRIVATE_KEY"
 *
 * Dry-run (no txs):
 *   forge script scripts/SeedHackathonDemoAccount.sol:SeedHackathonDemoAccount \
 *     --sig "run(address)" \
 *     0xYOUR_DEMO_WALLET \
 *     --rpc-url sepolia
 */
contract SeedHackathonDemoAccount is Script {
  // Live Sepolia hackathon market (reports/hackathon-market.json).
  address internal constant POOL = 0xe1556e1f65Aa99682e96Ad3de866f446D2A1275e;
  address internal constant PROTOCOL_DATA_PROVIDER = 0x59d373bfc3E4c7c0813eE81566Fcf91C37f55D35;
  address internal constant WRAPPED_TOKEN_GATEWAY = 0x2Ac0b0B36CD831d71D315AF868429C312d1C5B52;
  address internal constant DNZD = 0x9c6ed608C36D8a483377867b61452765A669416F;

  // Live marketing TVL (must already be seeded; see SeedHackathonYieldSnapshot).
  uint256 internal constant EXPECTED_CIRCULATION_DNZD = 2_000_000e6;

  // Demo wallet: gas buffer after collateral is already supplied for them.
  uint256 internal constant DEMO_ETH_GAS = 0.05 ether;

  // Demo wallet: repay buffer (interest dust after a small borrow).
  uint256 internal constant DEMO_DNZD_REPAY_BUFFER = 100e6;

  // Collateral pre-supplied via gateway onBehalfOf demo (~0.08 ETH → room to borrow ~tens–low hundreds dNZD).
  // Tiny vs ~2M TVL so a demo borrow barely moves utilisation.
  uint256 internal constant DEMO_COLLATERAL_ETH = 0.08 ether;

  function run(address demo) external {
    require(demo != address(0), 'demo account required');

    uint256 totalEthOut = DEMO_ETH_GAS + DEMO_COLLATERAL_ETH;
    require(msg.sender.balance >= totalEthOut + 0.01 ether, 'owner needs ~0.14+ ETH');

    (, , uint256 totalAToken, , uint256 totalVariableDebt, , , , , , , ) = IPoolDataProvider(
      PROTOCOL_DATA_PROVIDER
    ).getReserveData(DNZD);
    uint256 availableLiquidity = totalAToken > totalVariableDebt
      ? totalAToken - totalVariableDebt
      : 0;
    require(
      totalAToken >= EXPECTED_CIRCULATION_DNZD / 2,
      'pool under-seeded; run SeedHackathonYieldSnapshot first'
    );
    require(availableLiquidity >= 1_000e6, 'insufficient dNZD liquidity for demo borrow');

    console.log('Seed hackathon demo account');
    console.log('owner', msg.sender);
    console.log('demo', demo);
    console.log('pool', POOL);
    console.log('circulationDnzd', totalAToken);
    console.log('variableDebtDnzd', totalVariableDebt);
    console.log('availableLiquidityDnzd', availableLiquidity);

    vm.startBroadcast();

    // 1) Gas for live txs on the presenter wallet.
    (bool sent, ) = demo.call{value: DEMO_ETH_GAS}('');
    require(sent, 'ETH transfer failed');

    // 2) Repay buffer (borrow itself needs no prior dNZD balance).
    TestnetERC20(DNZD).mint(demo, DEMO_DNZD_REPAY_BUFFER);

    // 3) Pre-supply market WETH as collateral so the risk UI has a position immediately.
    //    Uses this market's WrappedTokenGateway (not canonical Sepolia WETH).
    IWrappedTokenGatewayV3(WRAPPED_TOKEN_GATEWAY).depositETH{value: DEMO_COLLATERAL_ETH}(
      POOL,
      demo,
      0
    );

    vm.stopBroadcast();

    console.log('--- seeded ---');
    console.log('demoEthGas', DEMO_ETH_GAS);
    console.log('demoDnzdRepayBuffer', DEMO_DNZD_REPAY_BUFFER);
    console.log('demoCollateralEth', DEMO_COLLATERAL_ETH);
    console.log('Next: open /mnzd, connect DEMO_ACCOUNT, go to dNZD tab (Borrow Risk Assistant).');
  }
}
