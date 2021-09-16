require('dotenv').config()
import { getRequiredEnv } from '@makerdao/hardhat-utils'
import { mapValues } from 'lodash'

import {
  deployBridge,
  getMainnetNetworkConfig,
  getMainnetRouterDeployment,
  performSanityChecks,
} from '../arbitrum-helpers'

async function main() {
  const pkey = getRequiredEnv('L1_MAINNET_DEPLOYER_PRIV_KEY')
  const l1Rpc = getRequiredEnv('L1_MAINNET_RPC_URL')
  const l2Rpc = getRequiredEnv('L2_MAINNET_RPC_URL')

  const network = await getMainnetNetworkConfig({ pkey, l1Rpc, l2Rpc })
  console.log(`Deploying to Mainnet using: ${network.l1.deployer.address}`)
  const routerDeployment = await getMainnetRouterDeployment(network)

  const l1BlockOfBeginningOfDeployment = await network.l1.provider.getBlockNumber()
  const l2BlockOfBeginningOfDeployment = await network.l2.provider.getBlockNumber()

  const bridgeDeployment = await deployBridge(network, routerDeployment, '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1')

  await performSanityChecks(
    network,
    bridgeDeployment,
    l1BlockOfBeginningOfDeployment,
    l2BlockOfBeginningOfDeployment,
    true,
  )

  console.log(
    JSON.stringify(
      mapValues(bridgeDeployment, (v) => v.address),
      null,
      2,
    ),
  )
}

main()
  .then(() => console.log('DONE'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
