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

import "../l1/IEthERC20Bridge.sol";

import "@openzeppelin/contracts/utils/Address.sol";

import "./IArbTokenBridge.sol";
import "../interfaces/ArbSys.sol";

interface Mintable {
  function mint(address usr, uint256 wad) external;

  function burn(address usr, uint256 wad) external;
}

contract L2Gateway is IArbTokenBridge {
    using Address for address;

    uint256 exitNum;

    address public l1Gateway;
    address public l1DAI;
    Mintable public l2DAI;

    // amount of arbgas necessary to send user tokens in case
    // of the "onTokenTransfer" call consumes all available gas
    uint256 internal constant arbgasReserveIfCallRevert = 250000;

    modifier onlyL1Counterpart {
        // @todo this assumes that sender on L2 can be a contract of L1. Double check it.
        require(msg.sender == l1Gateway, "L2Gateway/not-called-by-l1-counterpart");
        _;
    }

    function initialize(address _l1Gateway, address _l1DAI, address _l2DAI) external {
        require(address(l1Gateway) == address(0), "L2Gateway/already-initialized");

        l1Gateway = _l1Gateway;
        l1DAI = _l1DAI;
        l2DAI = Mintable(_l2DAI);
    }

    function mintFromL1(
        address l1ERC20,
        address sender,
        address dest,
        uint256 amount,
        bytes calldata deployData,
        bytes calldata callHookData
    ) external override onlyL1Counterpart {
        require(l1ERC20 == l1DAI, 'L2Gateway/not-supported');
        require(deployData.length == 0, 'L2Gateway/not-supported');
        require(callHookData.length == 0, 'L2Gateway/not-supported');

        l2DAI.mint(dest, amount);

        emit TokenMinted(
            l1ERC20,
            address(l2DAI),
            sender,
            dest, //@todo double check this
            amount,
            true
        );
    }

    function migrate(
        address l1ERC20,
        address sender,
        address destination,
        uint256 amount
    ) external override {
        require(false, 'L2Gateway/not-supported');
    }

    function customTokenRegistered(address l1Address, address l2Address)
        external
        override
        onlyL1Counterpart
    {
        require(false, 'L2Gateway/not-supported');
    }

    /**
     * @notice send a withdraw message to the L1 outbox
     * @dev this call is initiated by the token, ie StandardArbERC20.withdraw or WhateverCustomToken.whateverWithdrawMethod
     * @param l1ERC20 L1 address of ERC20
     * @param destination the account to be credited with the tokens
     * @param amount token amount to be withdrawn
     */
    function withdraw(
        address l1ERC20,
        address sender, //@todo why sender is an argument?
        address destination,
        uint256 amount
    ) external override returns (uint256) {
        require(l1ERC20 == l1DAI, 'L2Gateway/not-supported');

        l2DAI.burn(sender, amount);

        uint256 id =
            ArbSys(100).sendTxToL1(
                l1Gateway,
                abi.encodeWithSelector(
                    IEthERC20Bridge.withdrawFromL2.selector,
                    exitNum,
                    l1ERC20,
                    destination,
                    amount
                )
            );

        exitNum++;
        emit WithdrawToken(id, l1ERC20, amount, destination, exitNum);
        return id;
    }

    /**
     * @notice Calculate the address used when bridging an ERC20 token
     * @dev this always returns the same as the L1 oracle, but may be out of date.
     * For example, a custom token may have been registered but not deploy or the contract self destructed.
     * @param l1ERC20 address of L1 token
     * @return L2 address of a bridged ERC20 token
     */
    function calculateL2TokenAddress(address l1ERC20) public view override returns (address) {
        require(l1ERC20 == l1DAI, 'L2Gateway/not-supported');

        return address(l2DAI);
    }
}
