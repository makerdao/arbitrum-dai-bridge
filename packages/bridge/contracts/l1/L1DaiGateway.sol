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
  function transferFrom(address _from, address _to, uint256 _value) external returns (bool success);
}

contract L1DaiGateway is L1ArbitrumExtendedGateway {
    address immutable public l1Dai;
    address immutable public l2Dai;
    address immutable public l1Escrow;

    constructor(
        address _l2Counterpart,
        address _l1Router,
        address _inbox,
        address _l1Dai,
        address _l2Dai,
        address _l1Escrow
    ) public {
        L1ArbitrumExtendedGateway._initialize(_l2Counterpart, _l1Router, _inbox);
        l1Dai = _l1Dai;
        l2Dai = _l2Dai;
        l1Escrow = _l1Escrow;
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
        // msg.value does not include weth withdrawn from user, we need to add in that amount
        uint256 seqNum =
            IInbox(_inbox).createRetryableTicket(
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
        require(l1ERC20 == l1Dai, "WRONG_l1Dai");
        return l2Dai;
    }
}
