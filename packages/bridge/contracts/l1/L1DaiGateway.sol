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
import "arb-bridge-peripherals/contracts/tokenbridge/libraries/gateway/ITokenGateway.sol";

interface TokenLike {
  function transferFrom(
    address _from,
    address _to,
    uint256 _value
  ) external returns (bool success);
}

contract L1DaiGateway {
  // --- Auth ---
  mapping(address => uint256) public wards;

  function rely(address usr) external auth {
    wards[usr] = 1;
    emit Rely(usr);
  }

  function deny(address usr) external auth {
    wards[usr] = 0;
    emit Deny(usr);
  }

  modifier auth() {
    require(wards[msg.sender] == 1, "L1DaiGateway/not-authorized");
    _;
  }

  event Rely(address indexed usr);
  event Deny(address indexed usr);

  address public immutable l1Dai;
  address public immutable l2Dai;
  address public immutable l1Escrow;
  address public immutable l1Router;
  address public immutable l2Counterpart;
  address public immutable inbox;
  uint256 public isOpen = 1;

  event Closed();

  event OutboundTransferInitiatedV1(
    address token,
    address indexed _from,
    address indexed _to,
    uint256 indexed _transferId,
    uint256 _exitNum,
    uint256 _amount,
    bytes _userData
  );
  event InboundTransferFinalized(
    address token,
    address indexed _from,
    address indexed _to,
    uint256 indexed _transferId,
    uint256 _amount,
    bytes _data
  );
  event TxToL2(address indexed _from, address indexed _to, uint256 indexed _seqNum, bytes _data);

  constructor(
    address _l2Counterpart,
    address _l1Router,
    address _inbox,
    address _l1Dai,
    address _l2Dai,
    address _l1Escrow
  ) public {
    wards[msg.sender] = 1;
    emit Rely(msg.sender);

    l1Dai = _l1Dai;
    l2Dai = _l2Dai;
    l1Escrow = _l1Escrow;
    l1Router = _l1Router;
    l2Counterpart = _l2Counterpart;
    inbox = _inbox;
  }

  function close() external auth {
    isOpen = 0;

    emit Closed();
  }

  function outboundTransfer(
    address _l1Token,
    address _to,
    uint256 _amount,
    uint256 _maxGas,
    uint256 _gasPriceBid,
    bytes calldata _data
  ) public payable returns (bytes memory) {
    // do not allow initiating new xchain messages if bridge is closed
    require(isOpen == 1, "L1DaiGateway/closed");
    require(_l1Token == l1Dai, "L1DaiGateway/token-not-dai");

    // we use nested scope to avoid stack too deep errors
    address _from;
    uint256 seqNum;
    bytes memory extraData;
    {
      uint256 _maxSubmissionCost;
      (_from, _maxSubmissionCost, extraData) = parseOutboundData(_data);

      TokenLike(_l1Token).transferFrom(_from, l1Escrow, _amount);

      bytes memory outboundCalldata = getOutboundCalldata(_l1Token, _from, _to, _amount, extraData);
      seqNum = sendTxToL2(_from, 0, _maxSubmissionCost, _maxGas, _gasPriceBid, outboundCalldata);
    }

    // deposits don't have an exit num from L1 to L2, only on the way back
    uint256 currExitNum = 0;
    emit OutboundTransferInitiatedV1(l1Dai, _from, _to, seqNum, currExitNum, _amount, extraData);

    return abi.encode(seqNum);
  }

  modifier onlyCounterpartGateway() {
    address _inbox = inbox;

    // a message coming from the counterpart gateway was executed by the bridge
    address bridge = address(IInbox(_inbox).bridge());
    require(msg.sender == bridge, "NOT_FROM_BRIDGE");

    // and the outbox reports that the L2 address of the sender is the counterpart gateway
    address l2ToL1Sender = getL2ToL1Sender(_inbox);
    require(l2ToL1Sender == l2Counterpart, "ONLY_COUNTERPART_GATEWAY");
    _;
  }

  function getL2ToL1Sender(address _inbox) internal view virtual returns (address) {
    IOutbox outbox = IOutbox(IInbox(_inbox).bridge().activeOutbox());
    address l2ToL1Sender = outbox.l2ToL1Sender();

    require(l2ToL1Sender != address(0), "NO_SENDER");
    return l2ToL1Sender;
  }

  function finalizeInboundTransfer(
    address _token,
    address _from,
    address _to,
    uint256 _amount,
    bytes calldata _data
  ) external payable onlyCounterpartGateway returns (bytes memory) {
    require(_token == l1Dai, "L1DaiGateway/token-not-dai");
    (uint256 exitNum, bytes memory callHookData) = abi.decode(_data, (uint256, bytes));

    require(callHookData.length == 0, "no calldata allowed");
    TokenLike(_token).transferFrom(l1Escrow, _to, _amount);

    emit InboundTransferFinalized(_token, _from, _to, exitNum, _amount, _data);
    return bytes("");
  }

  function parseOutboundData(bytes memory _data)
    internal
    view
    returns (
      address _from,
      uint256 _maxSubmissionCost,
      bytes memory _extraData
    )
  {
    if (msg.sender == l1Router) {
      // router encoded
      (_from, _extraData) = abi.decode(_data, (address, bytes));
    } else {
      _from = msg.sender;
      _extraData = _data;
    }
    // user encoded
    (_maxSubmissionCost, _extraData) = abi.decode(_extraData, (uint256, bytes));
  }

  function getOutboundCalldata(
    address _l1Token,
    address _from,
    address _to,
    uint256 _amount,
    bytes memory _data
  ) public view returns (bytes memory outboundCalldata) {
    bytes memory emptyBytes = "";

    outboundCalldata = abi.encodeWithSelector(
      ITokenGateway.finalizeInboundTransfer.selector,
      _l1Token,
      _from,
      _to,
      _amount,
      abi.encode(emptyBytes, _data)
    );

    return outboundCalldata;
  }

  function sendTxToL2(
    address _user,
    uint256 _l2CallValue,
    uint256 _maxSubmissionCost,
    uint256 _maxGas,
    uint256 _gasPriceBid,
    bytes memory _data
  ) internal virtual returns (uint256) {
    uint256 seqNum = IInbox(inbox).createRetryableTicket{value: msg.value}(
      l2Counterpart,
      _l2CallValue,
      _maxSubmissionCost,
      _user,
      _user,
      _maxGas,
      _gasPriceBid,
      _data
    );
    emit TxToL2(_user, l2Counterpart, seqNum, _data);
    return seqNum;
  }
}
