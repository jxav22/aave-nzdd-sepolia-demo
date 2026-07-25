// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {Ownable} from 'openzeppelin-contracts/contracts/access/Ownable.sol';
import {MockAggregator} from './MockAggregator.sol';

/**
 * @title SettableAggregator
 * @notice Chainlink-shaped 8-decimal aggregator whose answer the owner can move.
 *         Used by the hackathon market so demos can shock collateral prices
 *         (health-factor drops / liquidations) without redeploying feeds.
 */
contract SettableAggregator is MockAggregator, Ownable {
  constructor(int256 initialAnswer, address initialOwner) MockAggregator(initialAnswer) Ownable(initialOwner) {}

  function setLatestAnswer(int256 answer) external onlyOwner {
    require(answer > 0, 'NON_POSITIVE_PRICE');
    _latestAnswer = answer;
    emit AnswerUpdated(answer, 0, block.timestamp);
  }
}
