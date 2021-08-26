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

import "arb-bridge-peripherals/contracts/tokenbridge/arbitrum/gateway/L2ArbitrumGateway.sol";
import "arb-bridge-peripherals/contracts/tokenbridge/libraries/gateway/ITokenGateway.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

interface Mintable {
  function mint(address usr, uint256 wad) external;

  function burn(address usr, uint256 wad) external;
}

contract L2DaiGateway {
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
    address indexed _from,
    address indexed _to,
    uint256 indexed _transferId,
    uint256 _exitNum,
    uint256 _amount,
    bytes _userData
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
    address _l1Token,
    address _to,
    uint256 _amount,
    bytes calldata _data
  ) public payable virtual returns (bytes memory) {
    return outboundTransfer(_l1Token, _to, _amount, 0, 0, _data);
  }

  function outboundTransfer(
    address _l1Token,
    address _to,
    uint256 _amount,
    uint256 _maxGas,
    uint256 _gasPriceBid,
    bytes calldata _data
  ) public returns (bytes memory res) {
    require(isOpen == 1, "L2DaiGateway/closed");
    require(_l1Token == l1Dai, "L2DaiGateway/token-not-dai");
    (address _from, bytes memory _extraData) = parseOutboundData(_data);

    require(_extraData.length == 0, "L2DaiGateway/call-hook-data-not-allowed");

    // unique id used to identify the L2 to L1 tx
    uint256 id;
    // exit number used for tradeable exits
    uint256 currExitNum = exitNum;
    {
      Mintable(l2Dai).burn(_from, _amount);

      // we override the res field to save on the stack
      res = getOutboundCalldata(_l1Token, _from, _to, _amount, _extraData);
      exitNum++;
      id = sendTxToL1(
        // default to sending no callvalue to the L1
        0,
        _from,
        l1Counterpart,
        res
      );
    }

    emit OutboundTransferInitiatedV1(_l1Token, _from, _to, id, currExitNum, _amount, _extraData);
    return abi.encode(id);
  }

  function parseOutboundData(bytes memory _data)
    internal
    view
    returns (address _from, bytes memory _extraData)
  {
    if (msg.sender == l2Router) {
      (_from, _extraData) = abi.decode(_data, (address, bytes));
    } else {
      _from = msg.sender;
      _extraData = _data;
    }
  }

  function getOutboundCalldata(
    address _token,
    address _from,
    address _to,
    uint256 _amount,
    bytes memory _data
  ) public view returns (bytes memory outboundCalldata) {
    outboundCalldata = abi.encodeWithSelector(
      ITokenGateway.finalizeInboundTransfer.selector,
      _token,
      _from,
      _to,
      _amount,
      abi.encode(exitNum, _data)
    );

    return outboundCalldata;
  }

  event TxToL1(address indexed _from, address indexed _to, uint256 indexed _id, bytes _data);

  function sendTxToL1(
    uint256 _l1CallValue,
    address _from,
    address _to,
    bytes memory _data
  ) internal returns (uint256) {
    uint256 _id = ArbSys(address(100)).sendTxToL1{value: _l1CallValue}(_to, _data);
    emit TxToL1(_from, _to, _id, _data);
    return _id;
  }

  function finalizeInboundTransfer(
    address _token,
    address _from,
    address _to,
    uint256 _amount,
    bytes calldata _data
  ) external payable onlyCounterpartGateway returns (bytes memory) {
    require(_token == l1Dai, "L2DaiGateway/token-not-dai");
    (bytes memory gatewayData, bytes memory callHookData) = abi.decode(_data, (bytes, bytes));

    Mintable(l2Dai).mint(_to, _amount);

    // @todo: werid transferId
    emit InboundTransferFinalized(_token, _from, _to, uint256(uint160(l2Dai)), _amount, _data);

    return bytes("");
  }

  event InboundTransferFinalized(
    address token,
    address indexed _from,
    address indexed _to,
    uint256 indexed _transferId,
    uint256 _amount,
    bytes _data
  );

  modifier onlyCounterpartGateway() virtual {
    // this method is overriden in gateways that require special logic for validation
    // ie L2 to L1 messages need to be validated against the outbox
    require(msg.sender == l1Counterpart, "ONLY_COUNTERPART_GATEWAY");
    _;
  }
}
