import {
  deployUsingFactoryAndVerify,
  getActiveWards,
  getAddressOfNextDeployedContract,
  waitForTx,
} from '@makerdao/hardhat-utils'
import { expect } from 'chai'
import { providers, Signer, Wallet } from 'ethers'
import { ethers } from 'hardhat'
import { assert, Awaited } from 'ts-essentials'

import { delay } from '../test-e2e/RetryProvider'
import { Dai, L1DaiGateway, L1Escrow, L1GovernanceRelay, L2DaiGateway, L2GovernanceRelay } from '../typechain'

export interface NetworkConfig {
  l1: {
    provider: providers.BaseProvider
    deployer: Wallet
    dai: string
    inbox: string
    makerPauseProxy: string
    makerESM: string
  }
  l2: {
    provider: providers.BaseProvider
    deployer: Wallet
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
  l1GatewayRouter: any
  l2GatewayRouter: any
}

export type BridgeDeployment = Awaited<ReturnType<typeof deployBridge>>

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

export async function deployBridge(deps: NetworkConfig, routerDeployment: RouterDeployment) {
  const l1BlockOfBeginningOfDeployment = await deps.l1.provider.getBlockNumber()
  const l2BlockOfBeginningOfDeployment = await deps.l2.provider.getBlockNumber()
  // deploy contracts
  const l1Escrow = await deployUsingFactoryAndVerify(deps.l1.deployer, await ethers.getContractFactory('L1Escrow'), [])
  console.log('Deployed l1Escrow at: ', l1Escrow.address)

  const l2Dai = await deployUsingFactoryAndVerify(deps.l2.deployer, await ethers.getContractFactory('Dai'), [])
  console.log('Deployed l2Dai at: ', l2Dai.address)
  const l1DaiGatewayFutureAddr = await getAddressOfNextDeployedContract(deps.l1.deployer)
  const l2DaiGateway = await deployUsingFactoryAndVerify(
    deps.l2.deployer,
    await ethers.getContractFactory('L2DaiGateway'),
    [l1DaiGatewayFutureAddr, routerDeployment.l2GatewayRouter.address, deps.l1.dai, l2Dai.address],
  )
  console.log('Deployed l2DaiGateway at: ', l2DaiGateway.address)

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

  const l2GovRelayFutureAddr = await getAddressOfNextDeployedContract(deps.l2.deployer)
  const l1GovRelay = await deployUsingFactoryAndVerify(
    deps.l1.deployer,
    await ethers.getContractFactory('L1GovernanceRelay'),
    [deps.l1.inbox, l2GovRelayFutureAddr],
  )
  console.log('Deployed l1GovernanceRelay at: ', l1GovRelay.address)
  const l2GovRelay = await deployUsingFactoryAndVerify(
    deps.l2.deployer,
    await ethers.getContractFactory('L2GovernanceRelay'),
    [l1GovRelay.address],
  )
  expect(l2GovRelay.address).to.be.eq(l2GovRelayFutureAddr)

  // permissions
  console.log('Setting permissions...')
  await waitForTx(l2Dai.rely(l2DaiGateway.address)) // allow minting/burning from the bridge
  await waitForTx(l2Dai.rely(l2GovRelay.address)) // allow granting new minting rights by the governance
  await waitForTx(l2Dai.deny(await deps.l2.deployer.getAddress()))

  await waitForTx(l2DaiGateway.rely(l2GovRelay.address)) // allow closing bridge by the governance
  await waitForTx(l2DaiGateway.deny(await deps.l2.deployer.getAddress()))

  await waitForTx(l1Escrow.approve(deps.l1.dai, l1DaiGateway.address, ethers.constants.MaxUint256)) // allow l1DaiGateway accessing funds from the bridge for withdrawals
  await waitForTx(l1Escrow.rely(deps.l1.makerPauseProxy))
  await waitForTx(l1Escrow.rely(deps.l1.makerESM))
  await waitForTx(l1Escrow.deny(await deps.l1.deployer.getAddress()))

  await waitForTx(l1DaiGateway.rely(deps.l1.makerPauseProxy))
  await waitForTx(l1DaiGateway.rely(deps.l1.makerESM))
  await waitForTx(l1DaiGateway.deny(await deps.l1.deployer.getAddress()))

  await waitForTx(l1GovRelay.rely(deps.l1.makerPauseProxy))
  await waitForTx(l1GovRelay.rely(deps.l1.makerESM))
  await waitForTx(l1GovRelay.deny(await deps.l1.deployer.getAddress()))

  // @todo: waitForTx should wait till tx is finalized
  await delay(5000)

  console.log('Permission sanity checks...')
  expect(await getActiveWards(l1Escrow, l1BlockOfBeginningOfDeployment)).to.deep.eq([
    deps.l1.makerPauseProxy,
    deps.l1.makerESM,
  ])
  expect(await getActiveWards(l1DaiGateway, l1BlockOfBeginningOfDeployment)).to.deep.eq([
    deps.l1.makerPauseProxy,
    deps.l1.makerESM,
  ])
  expect(await getActiveWards(l1GovRelay, l1BlockOfBeginningOfDeployment)).to.deep.eq([
    deps.l1.makerPauseProxy,
    deps.l1.makerESM,
  ])
  expect(await getActiveWards(l2DaiGateway, l2BlockOfBeginningOfDeployment)).to.deep.eq([l2GovRelay.address])
  expect(await getActiveWards(l2Dai, l2BlockOfBeginningOfDeployment)).to.deep.eq([
    l2DaiGateway.address,
    l2GovRelay.address,
  ])

  return {
    l1DaiGateway,
    l1Escrow,
    l2Dai,
    l2DaiGateway,
    l1Dai: (await ethers.getContractAt('Dai', deps.l1.dai, deps.l1.deployer)) as Dai,
    l1GovRelay,
    l2GovRelay,
  }
}

export async function useStaticDeployment(
  network: NetworkConfig,
  staticConfigString: string,
): ReturnType<typeof deployBridge> {
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
    l2Dai: (await ethers.getContractAt('Dai', throwIfUndefined(staticConfig.l2Dai), network.l2.deployer)) as Dai,
    l2DaiGateway: (await ethers.getContractAt(
      'L2DaiGateway',
      throwIfUndefined(staticConfig.l2DaiGateway),
      network.l2.deployer,
    )) as L2DaiGateway,
    l1Dai: (await ethers.getContractAt('Dai', throwIfUndefined(staticConfig.l1Dai), network.l1.deployer)) as Dai,
    l1GovRelay: (await ethers.getContractAt(
      'L1GovernanceRelay',
      throwIfUndefined(staticConfig.l1GovRelay),
      network.l1.deployer,
    )) as L1GovernanceRelay,
    l2GovRelay: (await ethers.getContractAt(
      'L2GovernanceRelay',
      throwIfUndefined(staticConfig.l2GovRelay),
      network.l2.deployer,
    )) as L2GovernanceRelay,
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
    )) as any,
    l2GatewayRouter: (await ethers.getContractAt(
      'L2GatewayRouter',
      throwIfUndefined(staticConfig.l2GatewayRouter),
      network.l1.deployer,
    )) as any, // todo types for router
  }
}

function throwIfUndefined(val: any): any {
  assert(val !== undefined, 'val is undefined! Static config incorrect!')

  return val
}
