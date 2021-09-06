pragma solidity ^0.6.11;

import "arb-bridge-eth/contracts/bridge/interfaces/IInbox.sol";
import "arb-bridge-eth/contracts/bridge/interfaces/IOutbox.sol";

contract L1CrossDomainEnabled {
  address public immutable inbox;

  event TxToL2(address indexed from, address indexed to, uint256 indexed seqNum, bytes data);

  constructor(address _inbox) public {
    inbox = _inbox;
  }

  modifier onlyL2Counterpart(address l2Counterpart) {
    address _inbox = inbox;

    // a message coming from the counterpart gateway was executed by the bridge
    address bridge = address(IInbox(_inbox).bridge());
    require(msg.sender == bridge, "NOT_FROM_BRIDGE");

    // and the outbox reports that the L2 address of the sender is the counterpart gateway
    address l2ToL1Sender = getL2ToL1Sender(_inbox);
    require(l2ToL1Sender == l2Counterpart, "ONLY_COUNTERPART_GATEWAY");
    _;
  }

  function getL2ToL1Sender(address _inbox) internal view returns (address) {
    IOutbox outbox = IOutbox(IInbox(_inbox).bridge().activeOutbox());
    address l2ToL1Sender = outbox.l2ToL1Sender();

    require(l2ToL1Sender != address(0), "NO_SENDER");
    return l2ToL1Sender;
  }

  // assumes that l1CallValue = msg.value
  function sendTxToL2(
    address target,
    address user,
    uint256 l2CallValue,
    uint256 maxSubmissionCost,
    uint256 maxGas,
    uint256 gasPriceBid,
    bytes memory data
  ) internal returns (uint256) {
    return
      sendTxToL2(
        target,
        user,
        msg.value,
        l2CallValue,
        maxSubmissionCost,
        maxGas,
        gasPriceBid,
        data
      );
  }

  function sendTxToL2(
    address target,
    address user,
    uint256 l1CallValue,
    uint256 l2CallValue,
    uint256 maxSubmissionCost,
    uint256 maxGas,
    uint256 gasPriceBid,
    bytes memory data
  ) internal returns (uint256) {
    uint256 seqNum = IInbox(inbox).createRetryableTicket{value: l1CallValue}(
      target,
      l2CallValue,
      maxSubmissionCost,
      user,
      user,
      maxGas,
      gasPriceBid,
      data
    );
    emit TxToL2(user, target, seqNum, data);
    return seqNum;
  }
}
