// this file exists only to compile some contracts from dependency dir for test purposes

import "arb-bridge-peripherals/contracts/buddybridge/test/Mock.sol";
import "arb-bridge-peripherals/contracts/buddybridge/test/TestBuddy.sol";
import "arb-bridge-peripherals/contracts/tokenbridge/ethereum/gateway/L1ERC20Gateway.sol";
import "arb-bridge-peripherals/contracts/tokenbridge/ethereum/gateway/L1GatewayRouter.sol";
import "arb-bridge-peripherals/contracts/tokenbridge/test/InboxMock.sol";
import "arb-bridge-peripherals/contracts/tokenbridge/test/TestCustomTokenL1.sol";
import "arb-bridge-peripherals/contracts/tokenbridge/libraries/aeWETH.sol";
import "arb-bridge-peripherals/contracts/tokenbridge/test/TestERC20.sol";
import "arb-bridge-peripherals/contracts/tokenbridge/test/TestArbCustomToken.sol";
import "arb-bridge-peripherals/contracts/tokenbridge/test/FastExitMock.sol";
