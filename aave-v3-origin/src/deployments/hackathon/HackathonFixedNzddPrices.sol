// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

/**
 * @title HackathonFixedNzddPrices
 * @notice Fixed NZD unit prices (8 decimals) for the Web3NZ hackathon market.
 * @dev Derived from a Sepolia Chainlink USD snapshot divided by NZD/USD ≈ 0.60,
 *      then rounded to tidy figures so the whole market is NZD-denominated:
 *      ETH ≈ US$1,853.80 → NZ$3,090; BTC ≈ US$63,915.57 → NZ$106,526.
 *      dNZD stays at NZ$1.00. Owners of SettableAggregator can still move
 *      wETH/wBTC for liquidation demos.
 */
library HackathonFixedNzddPrices {
  int256 internal constant DNZD = 1e8;
  int256 internal constant WETH = 3_090e8;
  int256 internal constant WBTC = 106_526e8;
}
