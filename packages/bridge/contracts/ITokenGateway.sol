pragma solidity ^0.6.11;

interface ITokenGateway {
  function outboundTransfer(
    address token,
    address to,
    uint256 amount,
    uint256 maxGas,
    uint256 gasPriceBid,
    bytes calldata data
  ) external returns (bytes memory);

  function finalizeInboundTransfer(
    address token,
    address from,
    address to,
    uint256 amount,
    bytes calldata data
  ) external;

  // if contract is not supported this should return 0x0 address
  function calculateL2TokenAddress(address l1Token) external view returns (address);
}
