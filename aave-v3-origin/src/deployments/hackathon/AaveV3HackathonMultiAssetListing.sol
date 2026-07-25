// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {AaveV3Payload} from '../../contracts/extensions/v3-config-engine/AaveV3Payload.sol';
import {EngineFlags} from '../../contracts/extensions/v3-config-engine/EngineFlags.sol';
import {IAaveV3ConfigEngine as IEngine} from '../../contracts/extensions/v3-config-engine/IAaveV3ConfigEngine.sol';
import {ACLManager} from '../../contracts/protocol/configuration/ACLManager.sol';
import {MarketReport} from '../interfaces/IMarketReportTypes.sol';

/**
 * @title AaveV3HackathonMultiAssetListing
 * @notice Lists dNZD, wETH, and wBTC on a custom hackathon Aave V3 market.
 * @dev Hackathon / demo only — not for production. Parameters are illustrative.
 */
contract AaveV3HackathonMultiAssetListing is AaveV3Payload {
  bytes32 public constant POOL_ADMIN_ROLE_ID =
    0x12ad05bde78c5ab75238ce885307f96ecd482bb402ef831f99e7018a0f169b7b;

  address public immutable MNZD_ADDRESS;
  address public immutable MNZD_PRICE_FEED;
  address public immutable WETH_ADDRESS;
  address public immutable WETH_PRICE_FEED;
  address public immutable WBTC_ADDRESS;
  address public immutable WBTC_PRICE_FEED;

  address immutable ATOKEN_IMPLEMENTATION;
  address immutable VARIABLE_DEBT_TOKEN_IMPLEMENTATION;

  ACLManager immutable ACL_MANAGER;

  constructor(
    IEngine customEngine,
    address mNZD,
    address mNZDPriceFeed,
    address weth,
    address wethPriceFeed,
    address wbtc,
    address wbtcPriceFeed,
    MarketReport memory report
  ) AaveV3Payload(customEngine) {
    require(mNZD != address(0) && mNZDPriceFeed != address(0), 'INVALID_MNZD');
    require(weth != address(0) && wethPriceFeed != address(0), 'INVALID_WETH');
    require(wbtc != address(0) && wbtcPriceFeed != address(0), 'INVALID_WBTC');

    MNZD_ADDRESS = mNZD;
    MNZD_PRICE_FEED = mNZDPriceFeed;
    WETH_ADDRESS = weth;
    WETH_PRICE_FEED = wethPriceFeed;
    WBTC_ADDRESS = wbtc;
    WBTC_PRICE_FEED = wbtcPriceFeed;

    ATOKEN_IMPLEMENTATION = report.aToken;
    VARIABLE_DEBT_TOKEN_IMPLEMENTATION = report.variableDebtToken;

    ACL_MANAGER = ACLManager(report.aclManager);
  }

  function newListingsCustom()
    public
    view
    override
    returns (IEngine.ListingWithCustomImpl[] memory)
  {
    IEngine.ListingWithCustomImpl[] memory listingsCustom = new IEngine.ListingWithCustomImpl[](3);

    IEngine.InterestRateInputData memory rateParams = IEngine.InterestRateInputData({
      optimalUsageRatio: 45_00,
      baseVariableBorrowRate: 0,
      variableRateSlope1: 4_00,
      variableRateSlope2: 60_00
    });

    IEngine.TokenImplementations memory impls = IEngine.TokenImplementations({
      aToken: ATOKEN_IMPLEMENTATION,
      vToken: VARIABLE_DEBT_TOKEN_IMPLEMENTATION
    });

    listingsCustom[0] = IEngine.ListingWithCustomImpl(
      IEngine.Listing({
        asset: MNZD_ADDRESS,
        assetSymbol: 'dNZD',
        priceFeed: MNZD_PRICE_FEED,
        rateStrategyParams: rateParams,
        enabledToBorrow: EngineFlags.ENABLED,
        flashloanable: EngineFlags.ENABLED,
        ltv: 82_50,
        liqThreshold: 86_00,
        liqBonus: 5_00,
        reserveFactor: 10_00,
        supplyCap: 0,
        borrowCap: 0,
        liqProtocolFee: 10_00
      }),
      impls
    );

    listingsCustom[1] = IEngine.ListingWithCustomImpl(
      IEngine.Listing({
        asset: WETH_ADDRESS,
        assetSymbol: 'wETH',
        priceFeed: WETH_PRICE_FEED,
        rateStrategyParams: rateParams,
        enabledToBorrow: EngineFlags.ENABLED,
        flashloanable: EngineFlags.ENABLED,
        ltv: 82_50,
        liqThreshold: 86_00,
        liqBonus: 5_00,
        reserveFactor: 10_00,
        supplyCap: 0,
        borrowCap: 0,
        liqProtocolFee: 10_00
      }),
      impls
    );

    listingsCustom[2] = IEngine.ListingWithCustomImpl(
      IEngine.Listing({
        asset: WBTC_ADDRESS,
        assetSymbol: 'wBTC',
        priceFeed: WBTC_PRICE_FEED,
        rateStrategyParams: rateParams,
        enabledToBorrow: EngineFlags.ENABLED,
        flashloanable: EngineFlags.ENABLED,
        ltv: 82_50,
        liqThreshold: 86_00,
        liqBonus: 5_00,
        reserveFactor: 10_00,
        supplyCap: 0,
        borrowCap: 0,
        liqProtocolFee: 10_00
      }),
      impls
    );

    return listingsCustom;
  }

  function getPoolContext() public pure override returns (IEngine.PoolContext memory) {
    return IEngine.PoolContext({networkName: 'Hackathon', networkAbbreviation: 'Hk'});
  }

  function _postExecute() internal override {
    ACL_MANAGER.renounceRole(POOL_ADMIN_ROLE_ID, address(this));
  }
}
