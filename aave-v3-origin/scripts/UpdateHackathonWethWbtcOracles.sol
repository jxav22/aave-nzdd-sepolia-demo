// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {Script} from 'forge-std/Script.sol';
import {console} from 'forge-std/console.sol';

import {HackathonFixedNzddPrices} from '../src/deployments/hackathon/HackathonFixedNzddPrices.sol';
import {SettableAggregator} from '../src/contracts/mocks/oracle/CLAggregators/SettableAggregator.sol';
import {IAaveOracle} from '../src/contracts/interfaces/IAaveOracle.sol';
import {IPool} from '../src/contracts/interfaces/IPool.sol';

/**
 * @title UpdateHackathonWethWbtcOracles
 * @notice Replaces live Chainlink USD feeds on the listed hackathon market with
 *         fixed NZD SettableAggregators (wETH NZ$3,090, wBTC NZ$106,526).
 *         Leaves the dNZD NZ$1 mock untouched. Requires pool admin (or asset listing admin).
 * @dev Constants match the multi-asset market in the client handoff
 *      (`packages/nextjs/config/hackathon-market.json`). Update if you redeploy.
 */
contract UpdateHackathonWethWbtcOracles is Script {
  address internal constant POOL = 0xe1556e1f65Aa99682e96Ad3de866f446D2A1275e;
  address internal constant AAVE_ORACLE = 0x809779d09cB0B9F85D191761Ef4a0a0076eED429;
  address internal constant WETH = 0xA9e6db07425b1Abba96F43C7923988f100d2B508;
  address internal constant WBTC = 0x82Ae40412Cc3C46309413155b4dc903d06494a12;

  function run() external {
    console.log('Update hackathon wETH/wBTC oracles to fixed NZD mocks');
    console.log('sender', msg.sender);
    console.log('aaveOracle', AAVE_ORACLE);
    console.log('wETH', WETH);
    console.log('wBTC', WBTC);
    console.log('wETH NZD (8dp)', uint256(HackathonFixedNzddPrices.WETH));
    console.log('wBTC NZD (8dp)', uint256(HackathonFixedNzddPrices.WBTC));

    require(IPool(POOL).getReserveData(WETH).aTokenAddress != address(0), 'WETH_NOT_LISTED');
    require(IPool(POOL).getReserveData(WBTC).aTokenAddress != address(0), 'WBTC_NOT_LISTED');

    vm.startBroadcast();
    SettableAggregator wethFeed = new SettableAggregator(HackathonFixedNzddPrices.WETH, msg.sender);
    SettableAggregator wbtcFeed = new SettableAggregator(HackathonFixedNzddPrices.WBTC, msg.sender);

    address[] memory assets = new address[](2);
    address[] memory sources = new address[](2);
    assets[0] = WETH;
    assets[1] = WBTC;
    sources[0] = address(wethFeed);
    sources[1] = address(wbtcFeed);

    IAaveOracle(AAVE_ORACLE).setAssetSources(assets, sources);
    vm.stopBroadcast();

    uint256 wethPrice = IAaveOracle(AAVE_ORACLE).getAssetPrice(WETH);
    uint256 wbtcPrice = IAaveOracle(AAVE_ORACLE).getAssetPrice(WBTC);
    require(wethPrice == uint256(HackathonFixedNzddPrices.WETH), 'WETH_ORACLE');
    require(wbtcPrice == uint256(HackathonFixedNzddPrices.WBTC), 'WBTC_ORACLE');
    require(IAaveOracle(AAVE_ORACLE).getSourceOfAsset(WETH) == address(wethFeed), 'WETH_SOURCE');
    require(IAaveOracle(AAVE_ORACLE).getSourceOfAsset(WBTC) == address(wbtcFeed), 'WBTC_SOURCE');

    console.log('wETH feed', address(wethFeed));
    console.log('wBTC feed', address(wbtcFeed));
    console.log('wETH price (8 decimals)', wethPrice);
    console.log('wBTC price (8 decimals)', wbtcPrice);
    console.log('Oracle sources updated to fixed NZD');
  }
}
