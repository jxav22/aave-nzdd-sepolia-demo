// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {Script} from 'forge-std/Script.sol';
import {console} from 'forge-std/console.sol';

import '../src/deployments/interfaces/IMarketReportTypes.sol';
import {AaveV3HackathonWethWbtcListing} from '../src/deployments/hackathon/AaveV3HackathonWethWbtcListing.sol';
import {HackathonFixedNzddPrices} from '../src/deployments/hackathon/HackathonFixedNzddPrices.sol';
import {TestnetERC20} from '../src/contracts/mocks/testnet-helpers/TestnetERC20.sol';
import {SettableAggregator} from '../src/contracts/mocks/oracle/CLAggregators/SettableAggregator.sol';
import {WETH9} from '../src/contracts/dependencies/weth/WETH9.sol';
import {WrappedTokenGatewayV3} from '../src/contracts/helpers/WrappedTokenGatewayV3.sol';
import {ACLManager} from '../src/contracts/protocol/configuration/ACLManager.sol';
import {IPool} from '../src/contracts/interfaces/IPool.sol';
import {IAaveOracle} from '../src/contracts/interfaces/IAaveOracle.sol';
import {IAaveV3ConfigEngine} from '../src/contracts/extensions/v3-config-engine/IAaveV3ConfigEngine.sol';
import {DataTypes} from '../src/contracts/protocol/libraries/types/DataTypes.sol';

/**
 * @title ListHackathonWethWbtc
 * @notice Adds wETH + wBTC reserves (and a WrappedTokenGateway) to the existing Sepolia hackathon market.
 */
contract ListHackathonWethWbtc is Script {
  address internal constant POOL = 0xB0ce61547bdd38139f7F764E7171Cd048323CC69;
  address internal constant POOL_ADDRESSES_PROVIDER = 0x2950597Bd526eB285b772f06654924bFa0b817f8;
  address internal constant AAVE_ORACLE = 0x79054dbB96Ca2d091e3B157970D8A2384e1473Ef;
  address internal constant PROTOCOL_DATA_PROVIDER = 0xb5565F196F185c74370FdE81b2422d7D5d2b2bF4;
  address internal constant ACL_MANAGER = 0x481230241FE711c54D3DB2172E95B66a08234098;
  address internal constant CONFIG_ENGINE = 0x6aFCfDf407acAE43100D2786f0383cFaB47eA1aE;
  address internal constant MNZD = 0xDf40C406e03a0fA6D4bE26F96Ca3A7E6fE9baeeC;
  address internal constant MNZD_ATOKEN = 0xA4c4E7eb3Cb6fc54CBa7b0B08549143bB7cF7DB8;
  address internal constant MNZD_VARIABLE_DEBT = 0x0B27c6229F90ed3BA9Af911cd607198924458E6A;
  address internal constant MNZD_PRICE_FEED = 0x9956e5C7994bF0d0343Cdab4025985D6B8053F44;

  bytes32 internal constant EIP1967_IMPLEMENTATION_SLOT =
    0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

  // Storage avoids "stack too deep" in JSON handoff.
  address internal _weth;
  address internal _wbtc;
  address internal _wethFeed;
  address internal _wbtcFeed;
  address internal _gateway;

  function run() external {
    console.log('List wETH + wBTC on existing hackathon market');
    console.log('sender', msg.sender);

    MarketReport memory report = _marketReport();

    vm.startBroadcast();
    _deployAndList(report);
    vm.stopBroadcast();

    _assertListed();
    _writeClientHandoff();

    console.log('wETH', _weth);
    console.log('wBTC', _wbtc);
    console.log('wrappedTokenGateway', _gateway);
    console.log('Wrote reports/hackathon-market.json');
  }

  function _marketReport() internal view returns (MarketReport memory report) {
    report.poolProxy = POOL;
    report.poolAddressesProvider = POOL_ADDRESSES_PROVIDER;
    report.aaveOracle = AAVE_ORACLE;
    report.protocolDataProvider = PROTOCOL_DATA_PROVIDER;
    report.aclManager = ACL_MANAGER;
    report.configEngine = CONFIG_ENGINE;
    report.aToken = _implementationOf(MNZD_ATOKEN);
    report.variableDebtToken = _implementationOf(MNZD_VARIABLE_DEBT);
    require(report.aToken != address(0) && report.variableDebtToken != address(0), 'IMPL_MISSING');
  }

  function _deployAndList(MarketReport memory report) internal {
    _weth = address(new WETH9());
    _wbtc = address(new TestnetERC20('Wrapped Bitcoin', 'wBTC', 8, msg.sender));
    _wethFeed = address(new SettableAggregator(HackathonFixedNzddPrices.WETH, msg.sender));
    _wbtcFeed = address(new SettableAggregator(HackathonFixedNzddPrices.WBTC, msg.sender));
    _gateway = address(new WrappedTokenGatewayV3(_weth, msg.sender, IPool(POOL)));

    _list(report);

    TestnetERC20(_wbtc).mint(msg.sender, 100e8);
  }

  function _list(MarketReport memory report) internal {
    AaveV3HackathonWethWbtcListing listing = new AaveV3HackathonWethWbtcListing(
      IAaveV3ConfigEngine(CONFIG_ENGINE),
      _weth,
      _wethFeed,
      _wbtc,
      _wbtcFeed,
      report
    );

    ACLManager(ACL_MANAGER).addPoolAdmin(address(listing));
    listing.execute();
  }

  function _assertListed() internal view {
    require(IPool(POOL).getReserveData(_weth).aTokenAddress != address(0), 'WETH_LISTING_FAILED');
    require(IPool(POOL).getReserveData(_wbtc).aTokenAddress != address(0), 'WBTC_LISTING_FAILED');
    require(
      IAaveOracle(AAVE_ORACLE).getAssetPrice(_weth) == uint256(HackathonFixedNzddPrices.WETH),
      'WETH_ORACLE'
    );
    require(
      IAaveOracle(AAVE_ORACLE).getAssetPrice(_wbtc) == uint256(HackathonFixedNzddPrices.WBTC),
      'WBTC_ORACLE'
    );
  }

  function _implementationOf(address proxy) internal view returns (address) {
    return address(uint160(uint256(vm.load(proxy, EIP1967_IMPLEMENTATION_SLOT))));
  }

  function _writeClientHandoff() internal {
    string memory output = string.concat(_marketHead(), _assetsJson(), _marketTail());
    vm.writeFile('./reports/hackathon-market.json', output);
  }

  function _assetsJson() internal view returns (string memory) {
    return string.concat(
      '[',
      _assetObject('dNZD', 6, MNZD, MNZD_ATOKEN, MNZD_VARIABLE_DEBT, MNZD_PRICE_FEED, true, 'ownerMint'),
      ',',
      _wethAssetObject(),
      ',',
      _wbtcAssetObject(),
      ']'
    );
  }

  function _wethAssetObject() internal view returns (string memory) {
    DataTypes.ReserveDataLegacy memory reserve = IPool(POOL).getReserveData(_weth);
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
    DataTypes.ReserveDataLegacy memory reserve = IPool(POOL).getReserveData(_wbtc);
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
      '  "chainId": 11155111,\n',
      '  "marketId": "Web3NZ Hackathon dNZD Market",\n'
    );
    out = string.concat(out, '  "pool": "', vm.toString(POOL), '",\n');
    out = string.concat(
      out,
      '  "poolAddressesProvider": "',
      vm.toString(POOL_ADDRESSES_PROVIDER),
      '",\n'
    );
    out = string.concat(out, '  "aaveOracle": "', vm.toString(AAVE_ORACLE), '",\n');
    out = string.concat(
      out,
      '  "protocolDataProvider": "',
      vm.toString(PROTOCOL_DATA_PROVIDER),
      '",\n'
    );
    out = string.concat(out, '  "aclManager": "', vm.toString(ACL_MANAGER), '",\n');
    out = string.concat(out, '  "configEngine": "', vm.toString(CONFIG_ENGINE), '",\n');
    out = string.concat(
      out,
      '  "wrappedTokenGateway": "',
      vm.toString(_gateway),
      '",\n',
      '  "assets": '
    );
    return out;
  }

  function _marketTail() internal view returns (string memory) {
    string memory out = string.concat(
      ',\n',
      '  "underlying": {\n',
      '    "symbol": "dNZD",\n',
      '    "decimals": 6,\n',
      '    "address": "',
      vm.toString(MNZD),
      '"\n',
      '  },\n'
    );
    out = string.concat(out, '  "aToken": "', vm.toString(MNZD_ATOKEN), '",\n');
    out = string.concat(
      out,
      '  "variableDebtToken": "',
      vm.toString(MNZD_VARIABLE_DEBT),
      '",\n'
    );
    out = string.concat(
      out,
      '  "priceFeed": "',
      vm.toString(MNZD_PRICE_FEED),
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
    string memory out = string.concat(
      '{"symbol":"',
      symbol,
      '","decimals":',
      vm.toString(uint256(decimals))
    );
    out = string.concat(out, ',"underlying":"', vm.toString(underlying), '"');
    out = string.concat(out, ',"aToken":"', vm.toString(aToken), '"');
    out = string.concat(out, ',"variableDebtToken":"', vm.toString(variableDebt), '"');
    out = string.concat(out, ',"priceFeed":"', vm.toString(priceFeed), '"');
    out = string.concat(out, ',"mintable":', mintable ? 'true' : 'false');
    out = string.concat(out, ',"acquisition":"', acquisition, '"}');
    return out;
  }
}
