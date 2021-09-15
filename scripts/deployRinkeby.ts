require('dotenv').config()
import { getRequiredEnv } from '@makerdao/hardhat-utils'

import { deployBridge, getRinkebyNetworkConfig, getRinkebyRouterDeployment } from '../arbitrum-helpers'

async function main() {
  const pkey = getRequiredEnv('L1_RINKEBY_DEPLOYER_PRIV_KEY')
  const l1Rpc = getRequiredEnv('L1_RINKEBY_RPC_URL')
  const l2Rpc = getRequiredEnv('L2_RINKEBY_RPC_URL')

  const network = await getRinkebyNetworkConfig({ pkey, l1Rpc, l2Rpc })
  const routerDeployment = await getRinkebyRouterDeployment(network)

  const contractsInfo = await deployBridge(network, routerDeployment)

  console.log(JSON.stringify(contractsInfo, null, 2))
}

main()
  .then(() => console.log('DONE'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
