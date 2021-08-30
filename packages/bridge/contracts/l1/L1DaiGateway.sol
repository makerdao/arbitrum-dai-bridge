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

import "arb-bridge-peripherals/contracts/tokenbridge/libraries/gateway/ITokenGateway.sol";
import "./L1CrossDomainEnabled.sol";

interface TokenLike {
  function transferFrom(
    address _from,
    address _to,
    uint256 _value
  ) external returns (bool success);
}

contract L1DaiGateway is L1CrossDomainEnabled {
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

  constructor(
    address _l2Counterpart,
    address _l1Router,
    address _inbox,
    address _l1Dai,
    address _l2Dai,
    address _l1Escrow
  ) public L1CrossDomainEnabled(_inbox) {
    wards[msg.sender] = 1;
    emit Rely(msg.sender);

    l1Dai = _l1Dai;
    l2Dai = _l2Dai;
    l1Escrow = _l1Escrow;
    l1Router = _l1Router;
    l2Counterpart = _l2Counterpart;
  }

  function close() external auth {
    isOpen = 0;

    emit Closed();
  }

  function outboundTransfer(
    address l1Token,
    address to,
    uint256 amount,
    uint256 maxGas,
    uint256 gasPriceBid,
    bytes calldata data
  ) external payable returns (bytes memory) {
    // do not allow initiating new xchain messages if bridge is closed
    require(isOpen == 1, "L1DaiGateway/closed");
    require(l1Token == l1Dai, "L1DaiGateway/token-not-dai");

    // we use nested scope to avoid stack too deep errors
    address from;
    uint256 seqNum;
    bytes memory extraData;
    {
      uint256 maxSubmissionCost;
      (from, maxSubmissionCost, extraData) = parseOutboundData(data);
      require(extraData.length == 0, "L1DaiGateway/call-hook-data-not-allowed");

      TokenLike(l1Token).transferFrom(from, l1Escrow, amount);

      bytes memory outboundCalldata = getOutboundCalldata(l1Token, from, to, amount, extraData);
      seqNum = sendTxToL2(
        l2Counterpart,
        from,
        0,
        maxSubmissionCost,
        maxGas,
        gasPriceBid,
        outboundCalldata
      );
    }

    // deposits don't have an exit num from L1 to L2, only on the way back
    uint256 currExitNum = 0;
    emit OutboundTransferInitiatedV1(l1Dai, from, to, seqNum, currExitNum, amount, extraData);

    return abi.encode(seqNum);
  }

  function getOutboundCalldata(
    address l1Token,
    address from,
    address to,
    uint256 amount,
    bytes memory data
  ) public view returns (bytes memory outboundCalldata) {
    bytes memory emptyBytes = "";

    outboundCalldata = abi.encodeWithSelector(
      ITokenGateway.finalizeInboundTransfer.selector,
      l1Token,
      from,
      to,
      amount,
      abi.encode(emptyBytes, data)
    );

    return outboundCalldata;
  }

  function finalizeInboundTransfer(
    address token,
    address from,
    address to,
    uint256 amount,
    bytes calldata data
  ) external payable onlyL2Counterpart(l2Counterpart) returns (bytes memory) {
    require(token == l1Dai, "L1DaiGateway/token-not-dai");
    (uint256 exitNum, bytes memory callHookData) = abi.decode(data, (uint256, bytes));

    TokenLike(token).transferFrom(l1Escrow, to, amount);

    emit InboundTransferFinalized(l1Dai, from, to, exitNum, amount, data);
    return bytes("");
  }

  function parseOutboundData(bytes memory data)
    internal
    view
    returns (
      address from,
      uint256 maxSubmissionCost,
      bytes memory extraData
    )
  {
    if (msg.sender == l1Router) {
      // router encoded
      (from, extraData) = abi.decode(data, (address, bytes));
    } else {
      from = msg.sender;
      extraData = data;
    }
    // user encoded
    (maxSubmissionCost, extraData) = abi.decode(extraData, (uint256, bytes));
  }
}
