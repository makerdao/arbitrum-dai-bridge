pragma solidity ^0.6.11;

// differences between L1 and L2 version of this interface:
// - payable modifier on outboundTransfer
// - events
interface L1ITokenGateway {
  event DepositInitiated(
    address l1Token,
    address indexed from,
    address indexed to,
    uint256 indexed sequenceNumber,
    uint256 amount
  );

  event WithdrawalFinalized(
    address l1Token,
    address indexed from,
    address indexed to,
    uint256 indexed exitNum,
    uint256 amount
  );

  function outboundTransfer(
    address token,
    address to,
    uint256 amount,
    uint256 maxGas,
    uint256 gasPriceBid,
    bytes calldata data
  ) external payable returns (bytes memory);

  function finalizeInboundTransfer(
    address token,
    address from,
    address to,
    uint256 amount,
    bytes calldata data
  ) external;

  // if token is not supported this should return 0x0 address
  function calculateL2TokenAddress(address l1Token) external view returns (address);
}
