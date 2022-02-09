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

interface WormholeRouter {
  function requestMint(
    WormholeGUID calldata wormholeGUID,
    uint256 maxFeePercentage,
    uint256 operatorFee
  ) external;

  function settle(bytes32 targetDomain, uint256 batchedDaiToFlush) external;
}

interface TokenLike {
  function approve(address, uint256) external returns (bool);

  function transferFrom(
    address _from,
    address _to,
    uint256 _value
  ) external returns (bool success);
}

contract L1DaiWormholeGateway is L1CrossDomainEnabled {
  address public immutable l1Token;
  address public immutable l2DaiWormholeGateway;
  address public immutable escrow;
  WormholeRouter public immutable wormholeRouter;

  constructor(
    address _l1Token,
    address _l2DaiWormholeGateway,
    address _inbox,
    address _escrow,
    address _wormholeRouter
  ) public L1CrossDomainEnabled(_inbox) {
    l1Token = _l1Token;
    l2DaiWormholeGateway = _l2DaiWormholeGateway;
    escrow = _escrow;
    wormholeRouter = WormholeRouter(_wormholeRouter);
    // Approve the router to pull DAI from this contract during settle() (after the DAI has been pulled by this contract from the escrow)
    TokenLike(_l1Token).approve(_wormholeRouter, type(uint256).max);
  }

  function finalizeFlush(bytes32 targetDomain, uint256 daiToFlush)
    external
    onlyL2Counterpart(l2DaiWormholeGateway)
  {
    // Pull DAI from the escrow to this contract
    TokenLike(l1Token).transferFrom(escrow, address(this), daiToFlush);
    // The router will pull the DAI from this contract
    wormholeRouter.settle(targetDomain, daiToFlush);
  }

  function finalizeRegisterWormhole(WormholeGUID calldata wormhole)
    external
    onlyL2Counterpart(l2DaiWormholeGateway)
  {
    wormholeRouter.requestMint(wormhole, 0, 0);
  }
}
