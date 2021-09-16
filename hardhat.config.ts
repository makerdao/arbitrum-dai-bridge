import 'solidity-coverage'
import 'hardhat-gas-reporter'
import '@nomiclabs/hardhat-etherscan'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import '@nomiclabs/hardhat-web3'
import '@typechain/hardhat'

import { HardhatUserConfig } from 'hardhat/config'

const testDir = process.env.TESTS_DIR ?? 'test'

const config: HardhatUserConfig = {
  mocha: {
    timeout: 50000,
  },
  solidity: {
    // note: we run optimizer only for dai.sol
    compilers: [
      {
        version: '0.6.11',
        settings: {
          optimizer: {
            enabled: false,
          },
        },
      },
    ],
    overrides: {
      'contracts/l2/dai.sol': {
        version: '0.6.11',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  paths: {
    tests: testDir,
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === '1',
    currency: 'USD',
    gasPrice: 50,
  },
}

export default config
