// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {Script} from 'forge-std/Script.sol';
import {console} from 'forge-std/console.sol';

import '../src/deployments/interfaces/IMarketReportTypes.sol';
import {AaveV3BatchOrchestration} from '../src/deployments/projects/aave-v3-batched/AaveV3BatchOrchestration.sol';
import {HackathonMarketInput} from '../src/deployments/inputs/HackathonMarketInput.sol';
import {AaveV3HackathonMultiAssetListing} from '../src/deployments/hackathon/AaveV3HackathonMultiAssetListing.sol';
import {HackathonFixedNzddPrices} from '../src/deployments/hackathon/HackathonFixedNzddPrices.sol';
import {TestnetERC20} from '../src/contracts/mocks/testnet-helpers/TestnetERC20.sol';
import {MockAggregator} from '../src/contracts/mocks/oracle/CLAggregators/MockAggregator.sol';
import {SettableAggregator} from '../src/contracts/mocks/oracle/CLAggregators/SettableAggregator.sol';
import {WETH9} from '../src/contracts/dependencies/weth/WETH9.sol';
import {ACLManager} from '../src/contracts/protocol/configuration/ACLManager.sol';
import {IPool} from '../src/contracts/interfaces/IPool.sol';
import {IAaveOracle} from '../src/contracts/interfaces/IAaveOracle.sol';
import {IAaveV3ConfigEngine} from '../src/contracts/extensions/v3-config-engine/IAaveV3ConfigEngine.sol';
import {DataTypes} from '../src/contracts/protocol/libraries/types/DataTypes.sol';

/**
 * @title DeployHackathonMarket
 * @notice Deploys a custom Aave V3 market with dNZD, wETH, wBTC (+ WrappedTokenGateway) and writes
 *         `reports/hackathon-market.json` for the client repo.
 */
contract DeployHackathonMarket is HackathonMarketInput, Script {
  uint8 internal constant MNZD_DECIMALS = 6;
  uint8 internal constant WBTC_DECIMALS = 8;
  uint256 internal constant DEMO_MINT_AMOUNT = 1_000_000e6;
  uint256 internal constant DEMO_WBTC_MINT = 100e8;

  // Storage avoids "stack too deep" across deploy + JSON handoff locals.
  MarketReport internal _report;
  address internal _mNZD;
  address internal _weth;
  address internal _wbtc;
  address internal _mNZDFeed;
  address internal _wethFeed;
  address internal _wbtcFeed;

  function run() external {
    console.log('Web3NZ Hackathon Aave V3 multi-asset deployment');
    console.log('sender', msg.sender);

    (
      Roles memory roles,
      MarketConfig memory config,
      DeployFlags memory flags,
      MarketReport memory report
    ) = _getMarketInput(msg.sender);

    vm.startBroadcast();
    _deployAndList(roles, config, flags, report);
    vm.stopBroadcast();

    _assertListed();
    _writeClientHandoff();

    console.log('pool', _report.poolProxy);
    console.log('dNZD', _mNZD);
    console.log('wETH', _weth);
    console.log('wBTC', _wbtc);
    console.log('wrappedTokenGateway', _report.wrappedTokenGateway);
    console.log('Wrote reports/hackathon-market.json');
  }

  function _deployAndList(
    Roles memory roles,
    MarketConfig memory config,
    DeployFlags memory flags,
    MarketReport memory report
  ) internal {
    WETH9 weth = new WETH9();
    config.wrappedNativeToken = address(weth);
    _weth = address(weth);

    _report = AaveV3BatchOrchestration.deployAaveV3(msg.sender, roles, config, flags, report);

    _mNZD = address(new TestnetERC20('Demo NZD Stable', 'dNZD', MNZD_DECIMALS, msg.sender));
    _wbtc = address(new TestnetERC20('Wrapped Bitcoin', 'wBTC', WBTC_DECIMALS, msg.sender));
    _mNZDFeed = address(new MockAggregator(HackathonFixedNzddPrices.DNZD));
    _wethFeed = address(new SettableAggregator(HackathonFixedNzddPrices.WETH, msg.sender));
    _wbtcFeed = address(new SettableAggregator(HackathonFixedNzddPrices.WBTC, msg.sender));

    _list();

    TestnetERC20(_mNZD).mint(msg.sender, DEMO_MINT_AMOUNT);
    TestnetERC20(_wbtc).mint(msg.sender, DEMO_WBTC_MINT);
  }

  function _list() internal {
    AaveV3HackathonMultiAssetListing listing = new AaveV3HackathonMultiAssetListing(
      IAaveV3ConfigEngine(_report.configEngine),
      _mNZD,
      _mNZDFeed,
      _weth,
      _wethFeed,
      _wbtc,
      _wbtcFeed,
      _report
    );

    ACLManager(_report.aclManager).addPoolAdmin(address(listing));
    listing.execute();
  }

  function _assertListed() internal view {
    IPool pool = IPool(_report.poolProxy);
    IAaveOracle oracle = IAaveOracle(_report.aaveOracle);

    require(pool.getReserveData(_mNZD).aTokenAddress != address(0), 'MNZD_LISTING_FAILED');
    require(pool.getReserveData(_weth).aTokenAddress != address(0), 'WETH_LISTING_FAILED');
    require(pool.getReserveData(_wbtc).aTokenAddress != address(0), 'WBTC_LISTING_FAILED');
    require(_report.wrappedTokenGateway != address(0), 'GATEWAY_MISSING');

    require(oracle.getAssetPrice(_mNZD) == uint256(HackathonFixedNzddPrices.DNZD), 'MNZD_ORACLE');
    require(oracle.getAssetPrice(_weth) == uint256(HackathonFixedNzddPrices.WETH), 'WETH_ORACLE');
    require(oracle.getAssetPrice(_wbtc) == uint256(HackathonFixedNzddPrices.WBTC), 'WBTC_ORACLE');
  }

  function _writeClientHandoff() internal {
    string memory output = string.concat(_marketHead(), _assetsJson(), _marketTail());
    vm.writeFile('./reports/hackathon-market.json', output);
  }

  function _assetsJson() internal view returns (string memory) {
    return string.concat('[', _mNZDAssetObject(), ',', _wethAssetObject(), ',', _wbtcAssetObject(), ']');
  }

  function _mNZDAssetObject() internal view returns (string memory) {
    DataTypes.ReserveDataLegacy memory reserve = IPool(_report.poolProxy).getReserveData(_mNZD);
    return _assetObject(
      'dNZD',
      6,
      _mNZD,
      reserve.aTokenAddress,
      reserve.variableDebtTokenAddress,
      _mNZDFeed,
      true,
      'ownerMint'
    );
  }

  function _wethAssetObject() internal view returns (string memory) {
    DataTypes.ReserveDataLegacy memory reserve = IPool(_report.poolProxy).getReserveData(_weth);
    return _assetObject(
      'wETH',
      18,
      _weth,
      reserve.aTokenAddress,
      reserve.variableDebtTokenAddress,
      _wethFeed,
      false,
      'wrapNative'
    );
  }

  function _wbtcAssetObject() internal view returns (string memory) {
    DataTypes.ReserveDataLegacy memory reserve = IPool(_report.poolProxy).getReserveData(_wbtc);
    return _assetObject(
      'wBTC',
      8,
      _wbtc,
      reserve.aTokenAddress,
      reserve.variableDebtTokenAddress,
      _wbtcFeed,
      true,
      'ownerMint'
    );
  }

  function _marketHead() internal view returns (string memory) {
    string memory out = string.concat(
      '{\n',
      '  "chainId": ',
      vm.toString(block.chainid),
      ',\n',
      '  "marketId": "Web3NZ Hackathon dNZD Market",\n'
    );
    out = string.concat(out, '  "pool": "', vm.toString(_report.poolProxy), '",\n');
    out = string.concat(
      out,
      '  "poolAddressesProvider": "',
      vm.toString(_report.poolAddressesProvider),
      '",\n'
    );
    out = string.concat(out, '  "aaveOracle": "', vm.toString(_report.aaveOracle), '",\n');
    out = string.concat(
      out,
      '  "protocolDataProvider": "',
      vm.toString(_report.protocolDataProvider),
      '",\n'
    );
    out = string.concat(out, '  "aclManager": "', vm.toString(_report.aclManager), '",\n');
    out = string.concat(out, '  "configEngine": "', vm.toString(_report.configEngine), '",\n');
    out = string.concat(
      out,
      '  "wrappedTokenGateway": "',
      vm.toString(_report.wrappedTokenGateway),
      '",\n',
      '  "assets": '
    );
    return out;
  }

  function _marketTail() internal view returns (string memory) {
    DataTypes.ReserveDataLegacy memory mNZDReserve = IPool(_report.poolProxy).getReserveData(_mNZD);
    string memory out = string.concat(
      ',\n',
      '  "underlying": {\n',
      '    "symbol": "dNZD",\n',
      '    "decimals": 6,\n',
      '    "address": "',
      vm.toString(_mNZD),
      '"\n',
      '  },\n'
    );
    out = string.concat(out, '  "aToken": "', vm.toString(mNZDReserve.aTokenAddress), '",\n');
    out = string.concat(
      out,
      '  "variableDebtToken": "',
      vm.toString(mNZDReserve.variableDebtTokenAddress),
      '",\n'
    );
    out = string.concat(
      out,
      '  "priceFeed": "',
      vm.toString(_mNZDFeed),
      '",\n',
      '  "notes": "Hackathon multi-asset market: dNZD (demo NZD stable, NZ$1 mock), wETH/wBTC fixed NZD SettableAggregators (NZ$3,090 / NZ$106,526). Not production."\n',
      '}\n'
    );
    return out;
  }

  function _assetObject(
    string memory symbol,
    uint8 decimals,
    address underlying,
    address aToken,
    address variableDebt,
    address priceFeed,
    bool mintable,
    string memory acquisition
  ) internal view returns (string memory) {
    string memory out = string.concat('{"symbol":"', symbol, '","decimals":', vm.toString(uint256(decimals)));
    out = string.concat(out, ',"underlying":"', vm.toString(underlying), '"');
    out = string.concat(out, ',"aToken":"', vm.toString(aToken), '"');
    out = string.concat(out, ',"variableDebtToken":"', vm.toString(variableDebt), '"');
    out = string.concat(out, ',"priceFeed":"', vm.toString(priceFeed), '"');
    out = string.concat(out, ',"mintable":', mintable ? 'true' : 'false');
    out = string.concat(out, ',"acquisition":"', acquisition, '"}');
    return out;
  }
}
