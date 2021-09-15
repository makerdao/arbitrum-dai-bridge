import { ethers } from 'hardhat'

import { deployRouter, NetworkConfig } from '..'
import { getArbitrumArtifact } from '../contracts'

export async function useExternalRouterDeployment(
  network: NetworkConfig,
  { l1GatewayRouter, l2GatewayRouter }: { l1GatewayRouter: string; l2GatewayRouter: string },
): ReturnType<typeof deployRouter> {
  return {
    l1GatewayRouter: (await ethers.getContractAt(
      getArbitrumArtifact('L1GatewayRouter').abi as any,
      l1GatewayRouter,
      network.l1.deployer,
    )) as any,
    l2GatewayRouter: (await ethers.getContractAt(
      getArbitrumArtifact('L2GatewayRouter').abi as any,
      l2GatewayRouter,
      network.l2.deployer,
    )) as any, // todo types for router
  }
}
