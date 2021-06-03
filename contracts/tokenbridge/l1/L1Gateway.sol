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

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./IExitLiquidityProvider.sol";
import "../interfaces/IInbox.sol";
import "../interfaces/IOutbox.sol";
import "./IEthERC20Bridge.sol";
import "../l2/IArbTokenBridge.sol";

contract L1Gateway is IEthERC20Bridge {
    address internal constant USED_ADDRESS = address(0x01);

    mapping(bytes32 => address) public redirectedExits;

    mapping(address => bool) public override hasTriedDeploy;

    IInbox public inbox;
    address public escrow;
    address public l1DAI;
    address public l2Gateway;
    address public l2DAI; // it's required by IEthERC20Bridge interface to be able to return L2 token address

    modifier onlyL2Address {
        IBridge bridge = inbox.bridge();
        IOutbox outbox = IOutbox(bridge.activeOutbox());
        require(l2Gateway == outbox.l2ToL1Sender(), "Not from l2 buddy");
        _;
    }

    constructor(
        address _inbox,
        address _escrow,
        address _l1DAI,
        address _l2Gateway,
        address _l2DAI
    ) public {
        inbox = IInbox(_inbox);
        escrow = _escrow;
        l1DAI = _l1DAI;
        l2Gateway = _l2Gateway;
        l2DAI = _l2DAI;
    }

    function registerCustomL2Token(
        address l2CustomTokenAddress,
        uint256 maxSubmissionCost,
        uint256 maxGas,
        uint256 gasPriceBid,
        address refundAddress
    ) external payable override returns (uint256) {
        require(false, "L1Gateway/not-supported");
    }

    function transferExitAndCall(
        address initialDestination,
        address erc20,
        uint256 amount,
        uint256 exitNum,
        address to,
        bytes calldata data
    ) external override {
        require(false);
    }

    /**
     * @notice Finalizes a withdraw via Outbox message; callable only by ArbTokenBridge._withdraw
     * @param exitNum Sequentially increasing exit counter determined by the L2 bridge
     * @param erc20 L1 address of token being withdrawn from
     * @param initialDestination address the L2 withdrawal call initially set as the destination.
     * @param amount Token amount being withdrawn
     */
    function withdrawFromL2(
        uint256 exitNum,
        address erc20,
        address initialDestination,
        uint256 amount
    ) external override onlyL2Address {
        bytes32 withdrawData = encodeWithdrawal(exitNum, initialDestination, erc20, amount);
        address exitAddress = redirectedExits[withdrawData];
        redirectedExits[withdrawData] = USED_ADDRESS;
        address dest = exitAddress != address(0) ? exitAddress : initialDestination;
        // Unsafe external calls must occur below checks and effects
        IERC20(erc20).transferFrom(escrow, dest, amount);

        emit WithdrawExecuted(initialDestination, dest, erc20, amount, exitNum);
    }

    function deposit(
        address erc20,
        address destination,
        uint256 amount,
        uint256 maxSubmissionCost,
        uint256 maxGas,
        uint256 gasPriceBid,
        bytes calldata callHookData
    ) external payable override returns (uint256 seqNum, uint256 depositCalldataLength) {
        // note: not checking erc20 here b/c getDepositCalldata has all the checks
        IERC20(erc20).transferFrom(msg.sender, escrow, amount);

        bytes memory depositCalldata;
        {
            bool isDeployed;
            (isDeployed, depositCalldata) = getDepositCalldata(
                erc20,
                msg.sender,
                destination,
                amount,
                callHookData
            );
        }

        seqNum = inbox.createRetryableTicket{ value: msg.value }(
            l2Gateway,
            0,
            maxSubmissionCost,
            msg.sender,
            msg.sender,
            maxGas,
            gasPriceBid,
            depositCalldata
        );

        emit DepositToken(destination, msg.sender, seqNum, amount, erc20);
        return (seqNum, depositCalldata.length);
    }

    function getDepositCalldata(
        address erc20,
        address sender,
        address destination,
        uint256 amount,
        bytes calldata callHookData
    ) public view override returns (bool isDeployed, bytes memory depositCalldata) {
        require(erc20 == l1DAI, 'L1Gateway/not-supported');
        require(callHookData.length == 0, 'L1Gateway/not-supported');

        bool isDeployed = true;
        depositCalldata = abi.encodeWithSelector(
            IArbTokenBridge.mintFromL1.selector,
            erc20,
            sender,
            destination,
            amount,
            0, // we ommit deployData
            callHookData
        );

        return (isDeployed, depositCalldata);
    }

    function encodeWithdrawal(
        uint256 exitNum,
        address initialDestination,
        address erc20,
        uint256 amount
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(exitNum, initialDestination, erc20, amount));
    }

    function calculateL2TokenAddress(address erc20) public view override returns (address) {
        require(erc20 == l1DAI, 'L1Gateway/not-supported');
        return l2DAI;
    }
}
