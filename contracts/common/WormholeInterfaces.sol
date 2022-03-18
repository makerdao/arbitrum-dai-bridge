// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2021 Dai Foundation
//
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

import {WormholeGUID} from "./WormholeGUID.sol";

interface IL1WormholeRouter {
  function requestMint(
    WormholeGUID calldata wormholeGUID,
    uint256 maxFeePercentage,
    uint256 operatorFee
  ) external returns (uint256 postFeeAmount, uint256 totalFee);

  function settle(bytes32 targetDomain, uint256 batchedDaiToFlush) external;
}

interface IL1WormholeGateway {
  function l1Token() external view returns (address);

  function l1Escrow() external view returns (address);

  function l1WormholeRouter() external view returns (IL1WormholeRouter);

  function l2WormholeGateway() external view returns (address);

  function finalizeFlush(bytes32 targetDomain, uint256 daiToFlush) external;

  function finalizeRegisterWormhole(WormholeGUID calldata wormhole) external;
}

interface IL2WormholeGateway {
  event WormholeInitialized(WormholeGUID wormhole);
  event Flushed(bytes32 indexed targetDomain, uint256 dai);

  function l2Token() external view returns (address);

  function l1WormholeGateway() external view returns (address);

  function domain() external view returns (bytes32);

  function initiateWormhole(
    bytes32 targetDomain,
    address receiver,
    uint128 amount
  ) external;

  function initiateWormhole(
    bytes32 targetDomain,
    address receiver,
    uint128 amount,
    address operator
  ) external;

  function initiateWormhole(
    bytes32 targetDomain,
    bytes32 receiver,
    uint128 amount,
    bytes32 operator
  ) external;

  function flush(bytes32 targetDomain) external;
}
