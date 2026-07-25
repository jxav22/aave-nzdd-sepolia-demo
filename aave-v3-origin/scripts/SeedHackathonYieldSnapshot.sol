// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

import {Script} from 'forge-std/Script.sol';
import {console} from 'forge-std/console.sol';

import {TestnetERC20} from '../src/contracts/mocks/testnet-helpers/TestnetERC20.sol';
import {IPool} from '../src/contracts/interfaces/IPool.sol';
import {IPoolDataProvider} from '../src/contracts/interfaces/IPoolDataProvider.sol';
import {DataTypes} from '../src/contracts/protocol/libraries/types/DataTypes.sol';

/**
 * @title SeedHackathonYieldSnapshot
 * @notice Unwind any prior seed position, then set the live Sepolia dNZD reserve to ~2M TVL
 *         at ~45% utilisation, and write a point-in-time yield snapshot.
 *
 * Handles an existing large seed (repay + withdraw the broadcaster's position first), then
 * tops the reserve up so demos barely move utilisation.
 *
 * Requirements:
 * - `msg.sender` must be the dNZD token owner (market deployer) and have Sepolia ETH for gas.
 * - Uses the current multi-asset pool (not the superseded `0xB0ce…` market).
 *
 * Broadcast (bash):
 *   forge script scripts/SeedHackathonYieldSnapshot.sol:SeedHackathonYieldSnapshot \
 *     --rpc-url sepolia \
 *     --broadcast \
 *     --private-key "$PRIVATE_KEY"
 *
 * Dry-run (no broadcast):
 *   forge script scripts/SeedHackathonYieldSnapshot.sol:SeedHackathonYieldSnapshot \
 *     --rpc-url sepolia
 */
contract SeedHackathonYieldSnapshot is Script {
  // Live Sepolia hackathon market (client handoff hackathon-market.json).
  address internal constant POOL = 0xe1556e1f65Aa99682e96Ad3de866f446D2A1275e;
  address internal constant PROTOCOL_DATA_PROVIDER = 0x59d373bfc3E4c7c0813eE81566Fcf91C37f55D35;
  address internal constant DNZD = 0x9c6ed608C36D8a483377867b61452765A669416F;

  uint256 internal constant TARGET_SUPPLY = 2_000_000e6;
  uint256 internal constant TARGET_UTIL_BPS = 4_500; // 45% (optimal usage ratio)

  uint256 internal constant VARIABLE = uint256(DataTypes.InterestRateMode.VARIABLE);

  // Storage avoids "stack too deep" when building the JSON snapshot.
  uint256 internal _totalAToken;
  uint256 internal _totalVariableDebt;
  uint256 internal _liquidityRate;
  uint256 internal _variableBorrowRate;
  uint256 internal _liquidityIndex;
  uint256 internal _variableBorrowIndex;
  uint256 internal _utilisationBps;
  uint40 internal _lastUpdateTimestamp;
  uint256 internal _supplyAdded;
  uint256 internal _borrowAdded;

  function run() external {
    console.log('Seed hackathon dNZD yield snapshot');
    console.log('sender', msg.sender);
    console.log('pool', POOL);
    console.log('dNZD', DNZD);
    console.log('targetSupply', TARGET_SUPPLY);
    console.log('targetUtilBps', TARGET_UTIL_BPS);

    vm.startBroadcast();
    _unwindSenderPosition();
    _seedToTarget();
    vm.stopBroadcast();

    _loadReserveData();
    _logSnapshot();
    vm.writeFile('./reports/yield-snapshot.json', _buildSnapshotJson());
    console.log('Wrote reports/yield-snapshot.json');
  }

  /// @dev Clear the broadcaster's prior dNZD supply/debt so re-seeds are idempotent.
  function _unwindSenderPosition() internal {
    IPoolDataProvider dataProvider = IPoolDataProvider(PROTOCOL_DATA_PROVIDER);
    (uint256 aBal, , uint256 varDebt, , , , , , ) = dataProvider.getUserReserveData(DNZD, msg.sender);

    console.log('unwind aTokenBefore', aBal);
    console.log('unwind variableDebtBefore', varDebt);

    if (varDebt > 0) {
      if (aBal >= varDebt) {
        IPool(POOL).repayWithATokens(DNZD, type(uint256).max, VARIABLE);
      } else {
        // Same-asset shortfall or interest dust: mint a buffer and repay from wallet.
        uint256 need = varDebt - aBal + varDebt / 100 + 1e6;
        TestnetERC20(DNZD).mint(msg.sender, need);
        TestnetERC20(DNZD).approve(POOL, type(uint256).max);
        IPool(POOL).repay(DNZD, type(uint256).max, VARIABLE, msg.sender);
      }
    }

    (aBal, , , , , , , , ) = dataProvider.getUserReserveData(DNZD, msg.sender);
    if (aBal > 0) {
      IPool(POOL).withdraw(DNZD, type(uint256).max, msg.sender);
    }

    (aBal, , varDebt, , , , , , ) = dataProvider.getUserReserveData(DNZD, msg.sender);
    console.log('unwind aTokenAfter', aBal);
    console.log('unwind variableDebtAfter', varDebt);
  }

  /// @dev After unwind, top up so reserve supply >= 2M and util ≈ 45% (accounting for others).
  function _seedToTarget() internal {
    (, , uint256 supplyOthers, , uint256 debtOthers, , , , , , , ) = IPoolDataProvider(
      PROTOCOL_DATA_PROVIDER
    ).getReserveData(DNZD);

    console.log('others totalAToken', supplyOthers);
    console.log('others totalVariableDebt', debtOthers);

    // Final supply must be at least TARGET_SUPPLY, existing others, and enough that debtOthers/S <= 45%.
    uint256 minSupplyForUtil = debtOthers == 0 ? 0 : (debtOthers * 10_000 + (TARGET_UTIL_BPS - 1)) / TARGET_UTIL_BPS;
    uint256 finalSupply = TARGET_SUPPLY;
    if (supplyOthers > finalSupply) finalSupply = supplyOthers;
    if (minSupplyForUtil > finalSupply) finalSupply = minSupplyForUtil;

    uint256 finalDebt = (finalSupply * TARGET_UTIL_BPS) / 10_000;
    _supplyAdded = finalSupply > supplyOthers ? finalSupply - supplyOthers : 0;
    _borrowAdded = finalDebt > debtOthers ? finalDebt - debtOthers : 0;

    console.log('finalSupplyTarget', finalSupply);
    console.log('finalDebtTarget', finalDebt);
    console.log('supplyAdded', _supplyAdded);
    console.log('borrowAdded', _borrowAdded);

    if (_supplyAdded > 0) {
      TestnetERC20(DNZD).mint(msg.sender, _supplyAdded);
      TestnetERC20(DNZD).approve(POOL, _supplyAdded);
      IPool(POOL).supply(DNZD, _supplyAdded, msg.sender, 0);
    }

    if (_borrowAdded > 0) {
      // Same-asset: need collateral; LTV 82.5% > 45% target so this is safe when we supplied the TVL.
      IPool(POOL).borrow(DNZD, _borrowAdded, VARIABLE, 0, msg.sender);
    }
  }

  function _loadReserveData() internal {
    (
      ,
      ,
      uint256 totalAToken,
      ,
      uint256 totalVariableDebt,
      uint256 liquidityRate,
      uint256 variableBorrowRate,
      ,
      ,
      uint256 liquidityIndex,
      uint256 variableBorrowIndex,
      uint40 lastUpdateTimestamp
    ) = IPoolDataProvider(PROTOCOL_DATA_PROVIDER).getReserveData(DNZD);

    _totalAToken = totalAToken;
    _totalVariableDebt = totalVariableDebt;
    _liquidityRate = liquidityRate;
    _variableBorrowRate = variableBorrowRate;
    _liquidityIndex = liquidityIndex;
    _variableBorrowIndex = variableBorrowIndex;
    _lastUpdateTimestamp = lastUpdateTimestamp;
    _utilisationBps = 0;
    if (totalAToken > 0) {
      _utilisationBps = (totalVariableDebt * 10_000) / totalAToken;
    }
  }

  function _logSnapshot() internal view {
    console.log('block', block.number);
    console.log('timestamp', block.timestamp);
    console.log('totalAToken', _totalAToken);
    console.log('totalVariableDebt', _totalVariableDebt);
    console.log('utilisationBps', _utilisationBps);
    console.log('liquidityRate (ray)', _liquidityRate);
    console.log('variableBorrowRate (ray)', _variableBorrowRate);
    console.log('liquidityIndex (ray)', _liquidityIndex);
    console.log('variableBorrowIndex (ray)', _variableBorrowIndex);
    console.log('lastUpdateTimestamp', uint256(_lastUpdateTimestamp));
  }

  function _buildSnapshotJson() internal view returns (string memory) {
    string memory out = string.concat(
      '{\n',
      '  "chainId": ',
      vm.toString(block.chainid),
      ',\n',
      '  "blockNumber": ',
      vm.toString(block.number),
      ',\n',
      '  "timestamp": ',
      vm.toString(block.timestamp),
      ',\n'
    );
    out = string.concat(
      out,
      '  "pool": "',
      vm.toString(POOL),
      '",\n',
      '  "protocolDataProvider": "',
      vm.toString(PROTOCOL_DATA_PROVIDER),
      '",\n'
    );
    out = string.concat(
      out,
      '  "asset": {\n',
      '    "symbol": "dNZD",\n',
      '    "decimals": 6,\n',
      '    "underlying": "',
      vm.toString(DNZD),
      '"\n',
      '  },\n'
    );
    out = string.concat(
      out,
      '  "totalAToken": "',
      vm.toString(_totalAToken),
      '",\n',
      '  "totalVariableDebt": "',
      vm.toString(_totalVariableDebt),
      '",\n',
      '  "utilisationBps": ',
      vm.toString(_utilisationBps),
      ',\n'
    );
    out = string.concat(
      out,
      '  "liquidityRateRay": "',
      vm.toString(_liquidityRate),
      '",\n',
      '  "variableBorrowRateRay": "',
      vm.toString(_variableBorrowRate),
      '",\n'
    );
    out = string.concat(
      out,
      '  "liquidityIndexRay": "',
      vm.toString(_liquidityIndex),
      '",\n',
      '  "variableBorrowIndexRay": "',
      vm.toString(_variableBorrowIndex),
      '",\n',
      '  "lastUpdateTimestamp": ',
      vm.toString(uint256(_lastUpdateTimestamp)),
      ',\n'
    );
    out = string.concat(
      out,
      '  "seed": {\n',
      '    "targetSupply": "',
      vm.toString(TARGET_SUPPLY),
      '",\n',
      '    "targetUtilBps": ',
      vm.toString(TARGET_UTIL_BPS),
      ',\n',
      '    "supplyAdded": "',
      vm.toString(_supplyAdded),
      '",\n',
      '    "borrowAdded": "',
      vm.toString(_borrowAdded),
      '"\n',
      '  },\n',
      '  "notes": "Unwind broadcaster position, then target ~2M dNZD TVL at ~45% util (accounts for other users). Rates are Aave ray units (1e27). APR = rate/1e27."\n',
      '}\n'
    );
    return out;
  }
}
