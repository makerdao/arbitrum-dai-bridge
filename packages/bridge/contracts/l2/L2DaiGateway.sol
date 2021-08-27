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
import "./L2CrossDomainEnabled.sol";

interface Mintable {
  function mint(address usr, uint256 wad) external;

  function burn(address usr, uint256 wad) external;
}

contract L2DaiGateway is L2CrossDomainEnabled {
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
    require(wards[msg.sender] == 1, "L2DaiGateway/not-authorized");
    _;
  }

  event Rely(address indexed usr);
  event Deny(address indexed usr);

  address public immutable l1Dai;
  address public immutable l2Dai;
  address public immutable l1Counterpart;
  address public immutable l2Router;
  uint256 public isOpen = 1;

  uint256 public exitNum;

  event Closed();

  event OutboundTransferInitiatedV1(
    address token,
    address indexed from,
    address indexed to,
    uint256 indexed transferId,
    uint256 exitNum,
    uint256 amount,
    bytes userData
  );

  event InboundTransferFinalized(
    address token,
    address indexed from,
    address indexed to,
    uint256 indexed transferId,
    uint256 amount,
    bytes data
  );

  constructor(
    address _l1Counterpart,
    address _l2Router,
    address _l1Dai,
    address _l2Dai
  ) public {
    wards[msg.sender] = 1;
    emit Rely(msg.sender);

    l1Dai = _l1Dai;
    l2Dai = _l2Dai;
    l1Counterpart = _l1Counterpart;
    l2Router = _l2Router;
  }

  function close() external auth {
    isOpen = 0;

    emit Closed();
  }

  function outboundTransfer(
    address l1Token,
    address to,
    uint256 amount,
    bytes calldata data
  ) public payable virtual returns (bytes memory) {
    return outboundTransfer(l1Token, to, amount, 0, 0, data);
  }

  function outboundTransfer(
    address l1Token,
    address to,
    uint256 amount,
    uint256 maxGas, // @todo: unused
    uint256 gasPriceBid, // @todo: unused
    bytes calldata data
  ) public returns (bytes memory res) {
    require(isOpen == 1, "L2DaiGateway/closed");
    require(l1Token == l1Dai, "L2DaiGateway/token-not-dai");

    (address from, bytes memory extraData) = parseOutboundData(data);
    require(extraData.length == 0, "L2DaiGateway/call-hook-data-not-allowed");

    // unique id used to identify the L2 to L1 tx
    uint256 id;
    // exit number used for tradeable exits
    uint256 currExitNum = exitNum;

    Mintable(l2Dai).burn(from, amount);

    // we override the res field to save on the stack
    res = getOutboundCalldata(l1Token, from, to, amount, extraData);
    exitNum++;
    id = sendTxToL1(
      // default to sending no callvalue to the L1
      0,
      from,
      l1Counterpart,
      res
    );

    emit OutboundTransferInitiatedV1(l1Token, from, to, id, currExitNum, amount, extraData);
    return abi.encode(id);
  }

  function getOutboundCalldata(
    address token,
    address from,
    address to,
    uint256 amount,
    bytes memory data
  ) public view returns (bytes memory outboundCalldata) {
    outboundCalldata = abi.encodeWithSelector(
      ITokenGateway.finalizeInboundTransfer.selector,
      token,
      from,
      to,
      amount,
      abi.encode(exitNum, data)
    );

    return outboundCalldata;
  }

  function finalizeInboundTransfer(
    address l1token,
    address from,
    address to,
    uint256 amount,
    bytes calldata data
  ) external payable onlyL1Counterpart(l1Counterpart) returns (bytes memory) {
    require(l1token == l1Dai, "L2DaiGateway/token-not-dai");
    (bytes memory _gatewayData, bytes memory _callHookData) = abi.decode(data, (bytes, bytes)); // @todo this can be removed as we don't use these data at all

    Mintable(l2Dai).mint(to, amount);

    // @todo: werid transferId
    emit InboundTransferFinalized(l1token, from, to, uint256(uint160(l2Dai)), amount, data);

    return bytes("");
  }

  function parseOutboundData(bytes memory data)
    internal
    view
    returns (address from, bytes memory extraData)
  {
    if (msg.sender == l2Router) {
      (from, extraData) = abi.decode(data, (address, bytes));
    } else {
      from = msg.sender;
      extraData = data;
    }
  }
}
