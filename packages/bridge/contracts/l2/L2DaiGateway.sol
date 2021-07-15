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

    address immutable public l1Dai;
    address immutable public l2Dai;

    constructor(
        address _l1Counterpart,
        address _router,
        address _l1Dai,
        address _l2Dai
    ) public {
        L2ArbitrumGateway._initialize(_l1Counterpart, _router);
        l1Dai = _l1Dai;
        l2Dai = _l2Dai;
    }

    /**
     * @notice internal utility function used to handle when no contract is deployed at expected address
     * @param l1ERC20 L1 address of ERC20
     * @param expectedL2Address L2 address of ERC20
     * @param deployData encoded symbol/name/decimal data for initial deploy
     */
    function handleNoContract(
        address l1ERC20,
        address expectedL2Address,
        address _from,
        address _to,
        uint256 _amount,
        bytes memory deployData
    ) internal virtual override returns (bool shouldHalt) {
        // it is assumed that the custom token is deployed in the L2 before deposits are made
        // trigger withdrawal
        createOutboundTx(l1ERC20, address(this), _from, _amount, "");
        return true;
    }

    /**
     * @notice Calculate the address used when bridging an ERC20 token
     * @dev this always returns the same as the L1 oracle, but may be out of date.
     * For example, a custom token may have been registered but not deploy or the contract self destructed.
     * @param l1ERC20 address of L1 token
     * @return L2 address of a bridged ERC20 token
     */
    function _calculateL2TokenAddress(address l1ERC20)
        internal
        view
        virtual
        override
        returns (address)
    {
        require(l1ERC20 == l1Dai, "WRONG_L1Dai");
        return l2Dai;
    }

    function inboundEscrowTransfer(
        address _l2TokenAddress,
        address _dest,
        uint256 _amount
    ) internal virtual override {
        Mintable(_l2TokenAddress).mint(_dest, _amount);
    }

    function createOutboundTx(
        address _l1Token,
        address _from,
        address _to,
        uint256 _amount,
        bytes memory _extraData
    ) internal virtual override returns (uint256) {
        return
            sendTxToL1(
                _from,
                0,
                getOutboundCalldata(_l1Token, _from, _to, _amount, _extraData)
            );
    }

    function gasReserveIfCallRevert() public pure virtual override returns (uint256) {
        // amount of arbgas necessary to send user tokens in case
        // of the "onTokenTransfer" call consumes all available gas
        return 5000;
    }
}
