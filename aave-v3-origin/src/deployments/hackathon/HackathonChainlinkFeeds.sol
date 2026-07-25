// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

/**
 * @title HackathonChainlinkFeeds
 * @notice Official Chainlink Sepolia USD feeds — retained for reference only.
 * @dev The live hackathon market now uses fixed NZD SettableAggregators
 *      (`HackathonFixedNzddPrices` + `UpdateHackathonWethWbtcOracles`). Prefer those.
 */
library HackathonChainlinkFeeds {
  // https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1#sepolia-testnet
  address internal constant ETH_USD = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
  address internal constant BTC_USD = 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43;
}
