// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import './MarketInput.sol';

/// @notice Market input for the Web3NZ hackathon dNZD stand-in deployment.
contract HackathonMarketInput is MarketInput {
  function _getMarketInput(
    address deployer
  )
    internal
    pure
    override
    returns (
      Roles memory roles,
      MarketConfig memory config,
      DeployFlags memory flags,
      MarketReport memory deployedContracts
    )
  {
    roles.marketOwner = deployer;
    roles.emergencyAdmin = deployer;
    roles.poolAdmin = deployer;

    config.marketId = 'Web3NZ Hackathon dNZD Market';
    config.providerId = 9090;
    config.oracleDecimals = 8;
    config.flashLoanPremium = 0.0005e4;

    return (roles, config, flags, deployedContracts);
  }
}
