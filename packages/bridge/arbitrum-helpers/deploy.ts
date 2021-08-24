import { deployUsingFactoryAndVerify, getAddressOfNextDeployedContract } from '@makerdao/hardhat-utils'
import { expect } from 'chai'
import { providers, Signer, Wallet } from 'ethers'
import { ethers } from 'hardhat'
import { assert, Awaited } from 'ts-essentials'

import { ArbDai, Dai, L1DaiGateway, L1Escrow, L1GatewayRouter, L2DaiGateway, L2GatewayRouter } from '../typechain'

interface Dependencies {
  l1: {
    deployer: Signer
    dai: string
    inbox: string
  }

  l2: {
    deployer: Signer
  }
}

interface RouterDependencies {
  l1: {
    deployer: Signer
    dai: string
    inbox: string
  }
  l2: {
    deployer: Signer
  }
}

export interface RouterDeployment {
  l1GatewayRouter: L1GatewayRouter
  l2GatewayRouter: L2GatewayRouter
}

export type BridgeDeployment = Awaited<ReturnType<typeof deploy>>

export async function deployRouter(deps: RouterDependencies): Promise<RouterDeployment> {
  const zeroAddr = ethers.constants.AddressZero

  const l1GatewayRouter = await deployUsingFactoryAndVerify(
    deps.l1.deployer,
    await ethers.getContractFactory('L1GatewayRouter'),
    [],
  )

  const futureAddressOfL2GatewayRouter = await getAddressOfNextDeployedContract(deps.l2.deployer)

  await l1GatewayRouter.initialize(
    await deps.l1.deployer.getAddress(),
    zeroAddr,
    zeroAddr,
    futureAddressOfL2GatewayRouter,
    deps.l1.inbox,
  )

  const l2GatewayRouter = await deployUsingFactoryAndVerify(
    deps.l2.deployer,
    await ethers.getContractFactory('L2GatewayRouter'),
    [],
  )
  expect(l2GatewayRouter.address).to.be.eq(futureAddressOfL2GatewayRouter)

  await l2GatewayRouter.initialize(l1GatewayRouter.address, zeroAddr)

  return {
    l1GatewayRouter,
    l2GatewayRouter,
  }
}

export async function deploy(deps: Dependencies, routerDeployment: RouterDeployment) {
  const l1Escrow = await deployUsingFactoryAndVerify(deps.l1.deployer, await ethers.getContractFactory('L1Escrow'), [])
  console.log('Deployed l1Escrow at: ', l1Escrow.address)

  const l2Dai = await deployUsingFactoryAndVerify(deps.l2.deployer, await ethers.getContractFactory('ArbDai'), [
    deps.l1.dai,
  ])
  console.log('Deployed l2Dai at: ', l2Dai.address)
  const l1DaiGatewayFutureAddr = await getAddressOfNextDeployedContract(deps.l1.deployer)
  const l2DaiGateway = await deployUsingFactoryAndVerify(
    deps.l2.deployer,
    await ethers.getContractFactory('L2DaiGateway'),
    [l1DaiGatewayFutureAddr, routerDeployment.l2GatewayRouter.address, deps.l1.dai, l2Dai.address],
  )
  console.log('Deployed l2DaiGateway at: ', l2DaiGateway.address)
  await l2Dai.rely(l2DaiGateway.address) // allow minting/burning from the bridge

  const l1DaiGateway = await deployUsingFactoryAndVerify(
    deps.l1.deployer,
    await ethers.getContractFactory('L1DaiGateway'),
    [
      l2DaiGateway.address,
      routerDeployment.l1GatewayRouter.address,
      deps.l1.inbox,
      deps.l1.dai,
      l2Dai.address,
      l1Escrow.address,
    ],
  )
  console.log('Deployed l1DaiGateway at: ', l1DaiGateway.address)
  expect(l1DaiGateway.address).to.be.eq(
    l1DaiGatewayFutureAddr,
    "Expected future address of l1DaiGateway doesn't match actual address!",
  )

  await l1Escrow.approve(deps.l1.dai, l1DaiGateway.address, ethers.constants.MaxUint256)

  return {
    l1DaiGateway,
    l1Escrow,
    l2Dai,
    l2DaiGateway,
    l1Dai: (await ethers.getContractAt('Dai', deps.l1.dai, deps.l1.deployer)) as Dai,
  }
}

export interface NetworkConfig {
  l1: {
    provider: providers.BaseProvider
    deployer: Wallet
    dai: string
    inbox: string
  }
  l2: {
    provider: providers.BaseProvider
    deployer: Wallet
  }
}

export async function useStaticDeployment(
  network: NetworkConfig,
  staticConfigString: string,
): ReturnType<typeof deploy> {
  const staticConfig = JSON.parse(staticConfigString)

  return {
    l1DaiGateway: (await ethers.getContractAt(
      'L1DaiGateway',
      throwIfUndefined(staticConfig.l1DaiGateway),
      network.l1.deployer,
    )) as L1DaiGateway,
    l1Escrow: (await ethers.getContractAt(
      'L1Escrow',
      throwIfUndefined(staticConfig.l1Escrow),
      network.l1.deployer,
    )) as L1Escrow,
    l2Dai: (await ethers.getContractAt('ArbDai', throwIfUndefined(staticConfig.l2Dai), network.l2.deployer)) as ArbDai,
    l2DaiGateway: (await ethers.getContractAt(
      'L2DaiGateway',
      throwIfUndefined(staticConfig.l2DaiGateway),
      network.l2.deployer,
    )) as L2DaiGateway,
    l1Dai: (await ethers.getContractAt('Dai', throwIfUndefined(staticConfig.l1Dai), network.l1.deployer)) as Dai,
  }
}

export async function useStaticRouterDeployment(
  network: NetworkConfig,
  staticConfigString: string,
): ReturnType<typeof deployRouter> {
  const staticConfig = JSON.parse(staticConfigString)

  return {
    l1GatewayRouter: (await ethers.getContractAt(
      'L1GatewayRouter',
      throwIfUndefined(staticConfig.l1GatewayRouter),
      network.l1.deployer,
    )) as L1GatewayRouter,
    l2GatewayRouter: (await ethers.getContractAt(
      'L2GatewayRouter',
      throwIfUndefined(staticConfig.l2GatewayRouter),
      network.l1.deployer,
    )) as L2GatewayRouter,
  }
}

function throwIfUndefined(val: any): any {
  assert(val !== undefined, 'val is undefined! Static config incorrect!')

  return val
}
