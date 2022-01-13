// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2021 Dai Foundation
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

pragma solidity ^0.6.11;
pragma experimental ABIEncoderV2;

import {WormholeGUID} from "../common/WormholeGUID.sol";
import {L1DaiWormholeGateway} from "../l1/L1DaiWormholeGateway.sol";
import "./L2CrossDomainEnabled.sol";

interface Mintable {
  function mint(address usr, uint256 wad) external;

  function burn(address usr, uint256 wad) external;
}

contract L2DAIWormholeBridge is L2CrossDomainEnabled {
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
    require(wards[msg.sender] == 1, "L2DAIWormholeBridge/not-authorized");
    _;
  }

  address public immutable l2Token;
  address public immutable l1DaiWormholeGateway;
  bytes32 public immutable domain;
  uint256 public isOpen = 1;
  uint80 public nonce;
  mapping(bytes32 => uint256) public validDomains;
  mapping(bytes32 => uint256) public batchedDaiToFlush;

  event Closed();
  event Rely(address indexed usr);
  event Deny(address indexed usr);
  event File(bytes32 indexed what, bytes32 indexed domain, uint256 data);
  event WormholeInitialized(WormholeGUID wormhole);
  event Flushed(bytes32 indexed targetDomain, uint256 dai);

  constructor(
    address _l2Token,
    address _l1DaiWormholeGateway,
    bytes32 _domain
  ) public {
    wards[msg.sender] = 1;
    emit Rely(msg.sender);

    l2Token = _l2Token;
    l1DaiWormholeGateway = _l1DaiWormholeGateway;
    domain = _domain;
  }

  function close() external auth {
    isOpen = 0;

    emit Closed();
  }

  function file(
    bytes32 what,
    bytes32 domain,
    uint256 data
  ) external auth {
    if (what == "validDomains") {
      require(data <= 1, "L2DAIWormholeBridge/invalid-data");

      validDomains[domain] = data;
    } else {
      revert("L2DAIWormholeBridge/file-unrecognized-param");
    }
    emit File(what, domain, data);
  }

  function initiateWormhole(
    bytes32 targetDomain,
    address receiver,
    uint128 amount,
    address operator
  ) external {
    // Disallow initiating new wormhole transfer if bridge is closed
    require(isOpen == 1, "L2DAIWormholeBridge/closed");

    // Disallow initiating new wormhole transfer if targetDomain has not been whitelisted
    require(validDomains[targetDomain] == 1, "L2DAIWormholeBridge/invalid-domain");

    WormholeGUID memory wormhole = WormholeGUID({
      sourceDomain: domain,
      targetDomain: targetDomain,
      receiver: receiver,
      operator: operator,
      amount: amount,
      nonce: nonce++,
      timestamp: uint48(block.timestamp)
    });

    batchedDaiToFlush[targetDomain] += amount;
    Mintable(l2Token).burn(msg.sender, amount);

    bytes memory message = abi.encodeWithSelector(
      L1DaiWormholeGateway.finalizeRegisterWormhole.selector,
      wormhole
    );
    sendTxToL1(msg.sender, l1DaiWormholeGateway, message);

    emit WormholeInitialized(wormhole);
  }

  function flush(bytes32 targetDomain) external {
    // We do not check for valid domain because previously valid domains still need their DAI flushed
    uint256 daiToFlush = batchedDaiToFlush[targetDomain];
    require(daiToFlush > 0, "L2DAIWormholeBridge/zero-dai-flush");

    batchedDaiToFlush[targetDomain] = 0;

    bytes memory message = abi.encodeWithSelector(
      L1DaiWormholeGateway.finalizeFlush.selector,
      targetDomain,
      daiToFlush
    );
    sendTxToL1(msg.sender, l1DaiWormholeGateway, message);

    emit Flushed(targetDomain, daiToFlush);
  }
}
