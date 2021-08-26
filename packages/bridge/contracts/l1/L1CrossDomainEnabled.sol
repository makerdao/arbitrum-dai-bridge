// SPDX-License-Identifier: Apache-2.0

/*
 * Copyright 2020, Offchain Labs, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

pragma solidity ^0.6.11;

import "arb-bridge-eth/contracts/bridge/interfaces/IInbox.sol";
import "arb-bridge-eth/contracts/bridge/interfaces/IOutbox.sol";

contract L1CrossDomainEnabled {
  address public immutable inbox;

  event TxToL2(address indexed _from, address indexed _to, uint256 indexed _seqNum, bytes _data);

  constructor(address _inbox) public {
    inbox = _inbox;
  }

  modifier onlyL2Counterpart(address l2Counterpart) {
    address _inbox = inbox;

    // a message coming from the counterpart gateway was executed by the bridge
    address bridge = address(IInbox(_inbox).bridge());
    require(msg.sender == bridge, "NOT_FROM_BRIDGE");

    // and the outbox reports that the L2 address of the sender is the counterpart gateway
    address l2ToL1Sender = getL2ToL1Sender(_inbox);
    require(l2ToL1Sender == l2Counterpart, "ONLY_COUNTERPART_GATEWAY");
    _;
  }

  function getL2ToL1Sender(address _inbox) internal view returns (address) {
    IOutbox outbox = IOutbox(IInbox(_inbox).bridge().activeOutbox());
    address l2ToL1Sender = outbox.l2ToL1Sender();

    require(l2ToL1Sender != address(0), "NO_SENDER");
    return l2ToL1Sender;
  }

  function sendTxToL2(
    address target,
    address _user,
    uint256 _l2CallValue,
    uint256 _maxSubmissionCost,
    uint256 _maxGas,
    uint256 _gasPriceBid,
    bytes memory _data
  ) internal returns (uint256) {
    uint256 seqNum = IInbox(inbox).createRetryableTicket{value: msg.value}(
      target,
      _l2CallValue,
      _maxSubmissionCost,
      _user,
      _user,
      _maxGas,
      _gasPriceBid,
      _data
    );
    emit TxToL2(_user, target, seqNum, _data);
    return seqNum;
  }
}
