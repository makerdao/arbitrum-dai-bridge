import { assert } from 'console'
import { ethers } from 'hardhat'

import { NetworkConfig, useStaticRouterDeployment } from '..'
import { RetryProvider } from './RetryProvider'

// maker contracts: https://changelog.makerdao.com/releases/mainnet/1.9.5/contracts.json
// arbitrum contracts: https://github.com/OffchainLabs/arbitrum/blob/master/packages/arb-bridge-eth/_deployments/1_current_deployment.json

export async function getMainnetNetworkConfig({
  pkey,
  l1Rpc,
  l2Rpc,
}: {
  pkey: string
  l1Rpc: string
  l2Rpc: string
}): Promise<NetworkConfig> {
  const l1 = new ethers.providers.JsonRpcProvider(l1Rpc)
  const l2 = new RetryProvider(5, l2Rpc) // arbitrum l2 can be very unstable so we use RetryProvider
  const l1Deployer = new ethers.Wallet(pkey, l1)
  const l2Deployer = new ethers.Wallet(pkey, l2)

  assert((await l1.getNetwork()).chainId === 1, 'Not mainnet!')
  assert((await l2.getNetwork()).chainId === 42161, 'Not arbitrum one!')

  return {
    l1: {
      provider: l1,
      deployer: l1Deployer,
      dai: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      inbox: '0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f',
      makerPauseProxy: '0xBE8E3e3618f7474F8cB1d074A26afFef007E98FB',
      makerESM: '0x29CfBd381043D00a98fD9904a431015Fef07af2f',
    },
    l2: {
      provider: l2,
      deployer: l2Deployer,
    },
  }
}

export async function getMainnetRouterDeployment(network: NetworkConfig) {
  return await useStaticRouterDeployment(network, {
    l1GatewayRouter: '0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef',
    l2GatewayRouter: '0x5288c571Fd7aD117beA99bF60FE0846C4E84F933',
  })
}
