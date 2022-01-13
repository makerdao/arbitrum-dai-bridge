pragma solidity ^0.6.11;

// Standard Maker Wormhole GUID
struct WormholeGUID {
  bytes32 sourceDomain;
  bytes32 targetDomain;
  address receiver;
  address operator;
  uint128 amount;
  uint80 nonce;
  uint48 timestamp;
}
