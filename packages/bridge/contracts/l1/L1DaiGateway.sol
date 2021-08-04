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
import "arb-bridge-peripherals/contracts/tokenbridge/ethereum/gateway/L1ArbitrumExtendedGateway.sol";

interface TokenLike {
  function transferFrom(
    address _from,
    address _to,
    uint256 _value
  ) external returns (bool success);
}

contract L1DaiGateway is L1ArbitrumExtendedGateway {
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

  modifier auth {
    require(wards[msg.sender] == 1, "L1DaiGateway/not-authorized");
    _;
  }

  event Rely(address indexed usr);
  event Deny(address indexed usr);

  address public immutable l1Dai;
  address public immutable l2Dai;
  address public immutable l1Escrow;
  uint256 public isOpen = 1;

  event Closed();

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

    L1ArbitrumExtendedGateway._initialize(_l2Counterpart, _l1Router, _inbox);
    l1Dai = _l1Dai;
    l2Dai = _l2Dai;
    l1Escrow = _l1Escrow;
  }

  function close() external auth {
    isOpen = 0;

    emit Closed();
  }

  function createOutboundTx(
    address _l1Token,
    address _from,
    address _to,
    uint256 _amount,
    uint256 _maxGas,
    uint256 _gasPriceBid,
    uint256 _maxSubmissionCost,
    bytes memory _extraData
  ) internal virtual override returns (uint256) {
    // do not allow initiating new xchain messages if bridge is closed
    require(isOpen == 1, "L1DaiGateway/closed");

    return
      sendTxToL2(
        _from,
        0,
        _maxSubmissionCost,
        _maxGas,
        _gasPriceBid,
        getOutboundCalldata(_l1Token, _from, _to, _amount, _extraData)
      );
  }

  function sendTxToL2(
    address _inbox,
    address _to,
    address _user,
    uint256 _l2CallValue,
    uint256 _maxSubmissionCost,
    uint256 _maxGas,
    uint256 _gasPriceBid,
    bytes memory _data
  ) internal virtual override returns (uint256) {
    uint256 seqNum = IInbox(_inbox).createRetryableTicket(
      _to,
      _l2CallValue,
      _maxSubmissionCost,
      _user,
      _user,
      _maxGas,
      _gasPriceBid,
      _data
    );
    emit TxToL2(_user, _to, seqNum, _data);
    return seqNum;
  }

  function outboundEscrowTransfer(
    address _l1Token,
    address _from,
    uint256 _amount
  ) internal virtual override {
    TokenLike(_l1Token).transferFrom(_from, l1Escrow, _amount);
  }

  function inboundEscrowTransfer(
    address _l1Token,
    address _dest,
    uint256 _amount
  ) internal virtual override {
    TokenLike(_l1Token).transferFrom(l1Escrow, _dest, _amount);
  }

  function _calculateL2TokenAddress(address l1ERC20)
    internal
    view
    virtual
    override
    returns (address)
  {
    require(l1ERC20 == l1Dai, "L1DaiGateway/token-not-dai");
    return l2Dai;
  }
}
