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

interface BridgeLike {
  function close() external;

  function l2Dai() external view returns (address);
}

interface AuthLike {
  function rely(address usr) external;

  function deny(address usr) external;
}

/**
 * An example spell to transfer from the old bridge to the new one.
 */
contract TestBridgeUpgradeSpell {
  function upgradeBridge(address _oldBridge, address _newBridge) external {
    BridgeLike oldBridge = BridgeLike(_oldBridge);
    AuthLike dai = AuthLike(oldBridge.l2Dai());
    oldBridge.close();

    // note: ususally you wouldn't "deny" right away b/c of async messages
    dai.deny(_oldBridge);
    dai.rely(_newBridge);
  }
}
