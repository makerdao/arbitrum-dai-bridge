// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2021 Dai Foundation
// @unsupported: ovm
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

import "./L1CrossDomainEnabled.sol";
import {WormholeGUID} from "../common/WormholeGUID.sol";
import {IL1WormholeGateway, IL1WormholeRouter} from "../common/WormholeInterfaces.sol";

interface TokenLike {
  function approve(address, uint256) external returns (bool);

  function transferFrom(
    address _from,
    address _to,
    uint256 _value
  ) external returns (bool success);
}

contract L1DaiWormholeGateway is L1CrossDomainEnabled, IL1WormholeGateway {
  address public immutable override l1Token;
  address public immutable override l2WormholeGateway;
  address public immutable override l1Escrow;
  IL1WormholeRouter public immutable override l1WormholeRouter;

  constructor(
    address _l1Token,
    address _l2WormholeGateway,
    address _inbox,
    address _l1Escrow,
    address _l1WormholeRouter
  ) public L1CrossDomainEnabled(_inbox) {
    l1Token = _l1Token;
    l2WormholeGateway = _l2WormholeGateway;
    l1Escrow = _l1Escrow;
    l1WormholeRouter = IL1WormholeRouter(_l1WormholeRouter);
    // Approve the router to pull DAI from this contract during settle() (after the DAI has been pulled by this contract from the escrow)
    TokenLike(_l1Token).approve(_l1WormholeRouter, type(uint256).max);
  }

  function finalizeFlush(bytes32 targetDomain, uint256 daiToFlush)
    external
    override
    onlyL2Counterpart(l2WormholeGateway)
  {
    // Pull DAI from the escrow to this contract
    TokenLike(l1Token).transferFrom(l1Escrow, address(this), daiToFlush);
    // The router will pull the DAI from this contract
    l1WormholeRouter.settle(targetDomain, daiToFlush);
  }

  function finalizeRegisterWormhole(WormholeGUID calldata wormhole)
    external
    override
    onlyL2Counterpart(l2WormholeGateway)
  {
    l1WormholeRouter.requestMint(wormhole, 0, 0);
  }
}
