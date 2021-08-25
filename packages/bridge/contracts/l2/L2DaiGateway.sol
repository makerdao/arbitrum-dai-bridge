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
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

interface Mintable {
  function mint(address usr, uint256 wad) external;

  function burn(address usr, uint256 wad) external;
}

contract L2DaiGateway is L2ArbitrumGateway {
  using SafeERC20 for IERC20;

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
  uint256 public isOpen = 1;

  event Closed();

  constructor(
    address _l1Counterpart,
    address _l2Router,
    address _l1Dai,
    address _l2Dai
  ) public {
    wards[msg.sender] = 1;
    emit Rely(msg.sender);

    L2ArbitrumGateway._initialize(_l1Counterpart, _l2Router);
    l1Dai = _l1Dai;
    l2Dai = _l2Dai;
  }

  function close() external auth {
    isOpen = 0;

    emit Closed();
  }

  function handleNoContract(
    address l1ERC20,
    address expectedL2Address,
    address _from,
    address _to,
    uint256 _amount,
    bytes memory gatewayData
  ) internal virtual override returns (bool shouldHalt) {
    // it is assumed that the custom token is deployed in the L2 before deposits are made
    // trigger withdrawal
    createOutboundTx(_from, _amount, gatewayData);
    return true;
  }

  function calculateL2TokenAddress(address l1ERC20) public view virtual override returns (address) {
    require(l1ERC20 == l1Dai, "L2DaiGateway/token-not-dai");
    return l2Dai;
  }

  // @todo: remove
  function inboundEscrowTransfer(
    address _l2TokenAddress,
    address _dest,
    uint256 _amount
  ) internal virtual override {
    Mintable(_l2TokenAddress).mint(_dest, _amount);
  }

  function createOutboundTx(
    address _from,
    uint256 _tokenAmount,
    bytes memory _outboundCalldata
  ) internal override returns (uint256) {
    // do not allow initiating new xchain messages if bridge is closed
    require(isOpen == 1, "L2DaiGateway/closed");

    exitNum++;
    return sendTxToL1(0, _from, counterpartGateway, _outboundCalldata);
  }

  function gasReserveIfCallRevert() public pure virtual override returns (uint256) {
    // amount of arbgas necessary to send user tokens in case
    // of the "onTokenTransfer" call consumes all available gas
    return 5000;
  }
}
