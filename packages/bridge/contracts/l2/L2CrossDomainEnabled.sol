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

import "arbos-contracts/arbos/builtin/ArbSys.sol";

contract L2CrossDomainEnabled {
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

  modifier onlyL1Counterpart(address l1Counterpart) {
    require(msg.sender == applyL1ToL2Alias(l1Counterpart), "ONLY_COUNTERPART_GATEWAY");
    _;
  }

  uint160 constant offset = uint160(0x1111000000000000000000000000000000001111);

  // l1 addresses are transformed durng l1->l2 calls
  function applyL1ToL2Alias(address l1Address) internal pure returns (address l2Address) {
    l2Address = address(uint160(l1Address) + offset);
  }
}
