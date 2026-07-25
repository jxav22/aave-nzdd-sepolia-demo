// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import 'forge-std/Test.sol';

import {HackathonMarketInput} from '../../src/deployments/inputs/HackathonMarketInput.sol';
import {AaveV3BatchOrchestration} from '../../src/deployments/projects/aave-v3-batched/AaveV3BatchOrchestration.sol';
import {AaveV3HackathonMultiAssetListing} from '../../src/deployments/hackathon/AaveV3HackathonMultiAssetListing.sol';
import {HackathonFixedNzddPrices} from '../../src/deployments/hackathon/HackathonFixedNzddPrices.sol';
import {TestnetERC20} from '../../src/contracts/mocks/testnet-helpers/TestnetERC20.sol';
import {MockAggregator} from '../../src/contracts/mocks/oracle/CLAggregators/MockAggregator.sol';
import {SettableAggregator} from '../../src/contracts/mocks/oracle/CLAggregators/SettableAggregator.sol';
import {WETH9} from '../../src/contracts/dependencies/weth/WETH9.sol';
import {ACLManager} from '../../src/contracts/protocol/configuration/ACLManager.sol';
import {IPool} from '../../src/contracts/interfaces/IPool.sol';
import {IAaveOracle} from '../../src/contracts/interfaces/IAaveOracle.sol';
import {IAToken} from '../../src/contracts/interfaces/IAToken.sol';
import {IAaveV3ConfigEngine} from '../../src/contracts/extensions/v3-config-engine/IAaveV3ConfigEngine.sol';
import {AaveProtocolDataProvider} from '../../src/contracts/helpers/AaveProtocolDataProvider.sol';
import {DataTypes} from '../../src/contracts/protocol/libraries/types/DataTypes.sol';
import '../../src/deployments/interfaces/IMarketReportTypes.sol';

/**
 * @notice Local smoke test for the hackathon multi-asset market (dNZD + wETH + wBTC).
 */
contract HackathonMarketTest is Test, HackathonMarketInput {
  uint8 internal constant MNZD_DECIMALS = 6;
  uint8 internal constant WBTC_DECIMALS = 8;

  address internal deployer;
  address internal user;

  MarketReport internal report;
  TestnetERC20 internal mNZD;
  WETH9 internal weth;
  TestnetERC20 internal wbtc;
  address internal mNZDAToken;

  function setUp() public {
    deployer = makeAddr('DEPLOYER');
    user = makeAddr('USER');

    // Deterministic CREATE2 factory used by Aave batch deployments (same etch as TestnetProcedures).
    vm.etch(
      0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7,
      hex'7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3'
    );

    (
      Roles memory roles,
      MarketConfig memory config,
      DeployFlags memory flags,
      MarketReport memory deployedContracts
    ) = _getMarketInput(deployer);

    vm.startPrank(deployer);

    weth = new WETH9();
    config.wrappedNativeToken = address(weth);

    report = AaveV3BatchOrchestration.deployAaveV3(
      deployer,
      roles,
      config,
      flags,
      deployedContracts
    );

    mNZD = new TestnetERC20('Demo NZD Stable', 'dNZD', MNZD_DECIMALS, deployer);
    wbtc = new TestnetERC20('Wrapped Bitcoin', 'wBTC', WBTC_DECIMALS, deployer);

    AaveV3HackathonMultiAssetListing listing = new AaveV3HackathonMultiAssetListing(
      IAaveV3ConfigEngine(report.configEngine),
      address(mNZD),
      address(new MockAggregator(HackathonFixedNzddPrices.DNZD)),
      address(weth),
      address(new SettableAggregator(HackathonFixedNzddPrices.WETH, deployer)),
      address(wbtc),
      address(new SettableAggregator(HackathonFixedNzddPrices.WBTC, deployer)),
      report
    );

    ACLManager(report.aclManager).addPoolAdmin(address(listing));
    listing.execute();
    vm.stopPrank();

    DataTypes.ReserveDataLegacy memory reserveData = IPool(report.poolProxy).getReserveData(
      address(mNZD)
    );
    mNZDAToken = reserveData.aTokenAddress;
  }

  function test_threeReservesListedWithOraclePrices() public view {
    address[] memory reserves = IPool(report.poolProxy).getReservesList();
    assertEq(reserves.length, 3, 'expected dNZD + wETH + wBTC');

    assertEq(IAaveOracle(report.aaveOracle).getAssetPrice(address(mNZD)), uint256(HackathonFixedNzddPrices.DNZD));
    assertEq(IAaveOracle(report.aaveOracle).getAssetPrice(address(weth)), uint256(HackathonFixedNzddPrices.WETH));
    assertEq(IAaveOracle(report.aaveOracle).getAssetPrice(address(wbtc)), uint256(HackathonFixedNzddPrices.WBTC));

    assertTrue(report.wrappedTokenGateway != address(0), 'gateway missing');

    (, , , , , , , , bool mNZDActive, ) = AaveProtocolDataProvider(report.protocolDataProvider)
      .getReserveConfigurationData(address(mNZD));
    (, , , , , , , , bool wethActive, ) = AaveProtocolDataProvider(report.protocolDataProvider)
      .getReserveConfigurationData(address(weth));
    (, , , , , , , , bool wbtcActive, ) = AaveProtocolDataProvider(report.protocolDataProvider)
      .getReserveConfigurationData(address(wbtc));

    assertTrue(mNZDActive && wethActive && wbtcActive, 'reserves not active');
  }

  function test_supplyWethBorrowMnzd() public {
    uint256 wethAmount = 1 ether;
    uint256 borrowAmount = 100e6;

    vm.deal(user, wethAmount);

    // Seed dNZD liquidity from deployer so the user can borrow.
    vm.startPrank(deployer);
    mNZD.mint(deployer, 1_000_000e6);
    mNZD.approve(report.poolProxy, 1_000_000e6);
    IPool(report.poolProxy).supply(address(mNZD), 1_000_000e6, deployer, 0);
    vm.stopPrank();

    vm.startPrank(user);
    weth.deposit{value: wethAmount}();
    weth.approve(report.poolProxy, wethAmount);
    IPool(report.poolProxy).supply(address(weth), wethAmount, user, 0);

    IPool(report.poolProxy).borrow(address(mNZD), borrowAmount, 2, 0, user);
    vm.stopPrank();

    assertEq(mNZD.balanceOf(user), borrowAmount, 'borrowed dNZD');

    (, , , , , uint256 healthFactor) = IPool(report.poolProxy).getUserAccountData(user);
    assertGt(healthFactor, 1e18, 'HF should be healthy');
  }

  function test_supplyAndWithdrawMnzd() public {
    uint256 amount = 1_000e6;

    vm.startPrank(deployer);
    mNZD.mint(user, amount);
    vm.stopPrank();

    vm.startPrank(user);
    mNZD.approve(report.poolProxy, amount);
    IPool(report.poolProxy).supply(address(mNZD), amount, user, 0);

    uint256 supplied = IAToken(mNZDAToken).balanceOf(user);
    assertGe(supplied, amount - 1, 'aToken balance after supply');

    uint256 walletBefore = mNZD.balanceOf(user);
    uint256 withdrawn = IPool(report.poolProxy).withdraw(address(mNZD), amount, user);
    vm.stopPrank();

    assertEq(withdrawn, amount, 'withdraw amount');
    assertEq(mNZD.balanceOf(user), walletBefore + amount, 'wallet after withdraw');
  }
}
