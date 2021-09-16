import { assert } from 'console'
import { ethers } from 'hardhat'

import { NetworkConfig, useStaticRouterDeployment } from '..'
import { RetryProvider } from './RetryProvider'

export async function getRinkebyNetworkConfig({
  pkey,
  l1Rpc,
  l2Rpc,
}: {
  pkey: string
  l1Rpc: string
  l2Rpc: string
}): Promise<NetworkConfig> {
  const l1 = new ethers.providers.JsonRpcProvider(l1Rpc)
  const l2 = new RetryProvider(5, l2Rpc) // arbitrum l2 testnet is very unstable so we use RetryProvider
  const l1Deployer = new ethers.Wallet(pkey, l1)
  const l2Deployer = new ethers.Wallet(pkey, l2)

  assert((await l1.getNetwork()).chainId === 4, 'Not rinkeby!')
  assert((await l2.getNetwork()).chainId === 421611, 'Not arbitrum testnet!')

  return {
    l1: {
      provider: l1,
      deployer: l1Deployer,
      dai: '0xd9e66A2f546880EA4d800F189d6F12Cc15Bff281', // our own deployment
      inbox: '0x578BAde599406A8fE3d24Fd7f7211c0911F5B29e',
      makerPauseProxy: '0x00edb63bc6f36a45fc18c98e03ad2d707652ab5c', // dummy EOA controlled by us
      makerESM: ethers.constants.AddressZero,
    },
    l2: {
      provider: l2,
      deployer: l2Deployer,
    },
  }
}

export async function getRinkebyRouterDeployment(network: NetworkConfig) {
  return await useStaticRouterDeployment(network, {
    l1GatewayRouter: '0x70C143928eCfFaf9F5b406f7f4fC28Dc43d68380',
    l2GatewayRouter: '0x9413AD42910c1eA60c737dB5f58d1C504498a3cD',
  })
}
