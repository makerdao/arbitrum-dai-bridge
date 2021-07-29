pragma solidity ^0.6.11;

import "arb-bridge-peripherals/contracts/tokenbridge/arbitrum/IArbToken.sol";
import "./dai.sol";

contract ArbDai is IArbToken, Dai {
  address public immutable override l1Address;

  constructor(address _l1Address) public {
    l1Address = _l1Address;
  }

  function bridgeMint(address account, uint256 amount) external override {
    mint(account, amount);
  }

  function bridgeBurn(address account, uint256 amount) external override {
    burn(account, amount);
  }
}
