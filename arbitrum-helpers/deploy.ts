import { getActiveWards, getAddressOfNextDeployedContract } from '@makerdao/hardhat-utils'
import { AuthableLike } from '@makerdao/hardhat-utils/dist/auth/AuthableContract'
import { expect } from 'chai'
import { providers, Signer, Wallet } from 'ethers'
import { ethers } from 'hardhat'
import { compact } from 'lodash'
import { assert, Awaited } from 'ts-essentials'

import { waitForTx } from '../arbitrum-helpers'
import { Dai, L1DaiGateway, L1Escrow, L1GovernanceRelay, L2DaiGateway, L2GovernanceRelay } from '../typechain'
import { getArbitrumArtifact, getArbitrumArtifactFactory } from './contracts'
import { deployUsingFactoryAndVerify } from './deployment'

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
    getArbitrumArtifactFactory('L1GatewayRouter'),
    [],
  )

  const futureAddressOfL2GatewayRouter = await getAddressOfNextDeployedContract(deps.l2.deployer)

  await waitForTx(
    l1GatewayRouter.initialize(
      await deps.l1.deployer.getAddress(),
      zeroAddr,
      zeroAddr,
      futureAddressOfL2GatewayRouter,
      deps.l1.inbox,
    ),
  )

  const l2GatewayRouter = await deployUsingFactoryAndVerify(
    deps.l2.deployer,
    getArbitrumArtifactFactory('L2GatewayRouter'),
    [],
  )
  expect(l2GatewayRouter.address).to.be.eq(futureAddressOfL2GatewayRouter)

  await waitForTx(l2GatewayRouter.initialize(l1GatewayRouter.address, zeroAddr))

  return {
    l1GatewayRouter,
    l2GatewayRouter,
  }
}

// @note: by default the deployment won't be fully secured -- deployer won't be denied
export async function deployBridge(
  deps: NetworkConfig,
  routerDeployment: RouterDeployment,
  desiredL2DaiAddress?: string,
) {
  if (desiredL2DaiAddress) {
    const nextAddress = await getAddressOfNextDeployedContract(deps.l2.deployer)
    expect(nextAddress.toLowerCase()).to.be.eq(
      desiredL2DaiAddress.toLowerCase(),
      'Expected L2DAI address doesnt match with address that will be deployed',
    )
  }
  expect(await deps.l1.deployer.getBalance()).to.not.be.eq(0, 'Not enough balance on L1')
  expect(await deps.l2.deployer.getBalance()).to.not.be.eq(0, 'Not enough balance on L2')

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
  console.log('Deployed l2GovernanceRelay at: ', l2GovRelay.address)

  // permissions
  console.log('Setting permissions...')
  await waitForTx(l2Dai.rely(l2DaiGateway.address)) // allow minting/burning from the bridge
  await waitForTx(l2Dai.rely(l2GovRelay.address)) // allow granting new minting rights by the governance

  await waitForTx(l2DaiGateway.rely(l2GovRelay.address)) // allow closing bridge by the governance

  await waitForTx(l1Escrow.approve(deps.l1.dai, l1DaiGateway.address, ethers.constants.MaxUint256)) // allow l1DaiGateway accessing funds from the bridge for withdrawals
  await waitForTx(l1Escrow.rely(deps.l1.makerPauseProxy))
  await waitForTx(l1Escrow.rely(deps.l1.makerESM))

  await waitForTx(l1DaiGateway.rely(deps.l1.makerPauseProxy))
  await waitForTx(l1DaiGateway.rely(deps.l1.makerESM))

  await waitForTx(l1GovRelay.rely(deps.l1.makerPauseProxy))
  await waitForTx(l1GovRelay.rely(deps.l1.makerESM))

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

function normalizeAddresses(addresses: string[]): string[] {
  return addresses.map((a) => a.toLowerCase()).sort()
}

export async function performSanityChecks(
  deps: NetworkConfig,
  bridgeDeployment: BridgeDeployment,
  l1BlockOfBeginningOfDeployment: number,
  l2BlockOfBeginningOfDeployment: number,
  includeDeployer: boolean,
) {
  console.log('Performing sanity checks...')

  async function checkPermissions(contract: AuthableLike, startBlock: number, _expectedPermissions: string[]) {
    const actualPermissions = await getActiveWards(contract, startBlock)
    const expectedPermissions = compact([..._expectedPermissions, includeDeployer && deps.l1.deployer.address])

    expect(normalizeAddresses(actualPermissions)).to.deep.eq(normalizeAddresses(expectedPermissions))
  }

  await checkPermissions(bridgeDeployment.l1Escrow, l1BlockOfBeginningOfDeployment, [
    deps.l1.makerPauseProxy,
    deps.l1.makerESM,
  ])
  await checkPermissions(bridgeDeployment.l1DaiGateway, l1BlockOfBeginningOfDeployment, [
    deps.l1.makerPauseProxy,
    deps.l1.makerESM,
  ])
  await checkPermissions(bridgeDeployment.l1GovRelay, l1BlockOfBeginningOfDeployment, [
    deps.l1.makerPauseProxy,
    deps.l1.makerESM,
  ])
  await checkPermissions(bridgeDeployment.l2DaiGateway, l2BlockOfBeginningOfDeployment, [
    bridgeDeployment.l2GovRelay.address,
  ])
  await checkPermissions(bridgeDeployment.l2Dai, l2BlockOfBeginningOfDeployment, [
    bridgeDeployment.l2DaiGateway.address,
    bridgeDeployment.l2GovRelay.address,
  ])

  expect(await bridgeDeployment.l1DaiGateway.l1Escrow()).to.be.eq(bridgeDeployment.l1Escrow.address)
  expect(await bridgeDeployment.l1GovRelay.l2GovernanceRelay()).to.be.eq(bridgeDeployment.l2GovRelay.address)
  expect(await bridgeDeployment.l1GovRelay.inbox()).to.be.eq(await bridgeDeployment.l1DaiGateway.inbox())
}

export async function denyDeployer(deps: NetworkConfig, bridgeDeployment: BridgeDeployment) {
  console.log('Denying deployer access')
  await waitForTx(bridgeDeployment.l2Dai.deny(await deps.l2.deployer.getAddress()))
  await waitForTx(bridgeDeployment.l2DaiGateway.deny(await deps.l2.deployer.getAddress()))
  await waitForTx(bridgeDeployment.l1Escrow.deny(await deps.l1.deployer.getAddress()))
  await waitForTx(bridgeDeployment.l1DaiGateway.deny(await deps.l1.deployer.getAddress()))
  await waitForTx(bridgeDeployment.l1GovRelay.deny(await deps.l1.deployer.getAddress()))
}

export async function useStaticDeployment(
  network: NetworkConfig,
  addresses: {
    l1DaiGateway: string
    l1Escrow: string
    l2Dai: string
    l2DaiGateway: string
    l1Dai: string
    l1GovRelay: string
    l2GovRelay: string
  },
): ReturnType<typeof deployBridge> {
  return {
    l1DaiGateway: (await ethers.getContractAt(
      'L1DaiGateway',
      throwIfUndefined(addresses.l1DaiGateway),
      network.l1.deployer,
    )) as L1DaiGateway,
    l1Escrow: (await ethers.getContractAt(
      'L1Escrow',
      throwIfUndefined(addresses.l1Escrow),
      network.l1.deployer,
    )) as L1Escrow,
    l2Dai: (await ethers.getContractAt('Dai', throwIfUndefined(addresses.l2Dai), network.l2.deployer)) as Dai,
    l2DaiGateway: (await ethers.getContractAt(
      'L2DaiGateway',
      throwIfUndefined(addresses.l2DaiGateway),
      network.l2.deployer,
    )) as L2DaiGateway,
    l1Dai: (await ethers.getContractAt('Dai', throwIfUndefined(addresses.l1Dai), network.l1.deployer)) as Dai,
    l1GovRelay: (await ethers.getContractAt(
      'L1GovernanceRelay',
      throwIfUndefined(addresses.l1GovRelay),
      network.l1.deployer,
    )) as L1GovernanceRelay,
    l2GovRelay: (await ethers.getContractAt(
      'L2GovernanceRelay',
      throwIfUndefined(addresses.l2GovRelay),
      network.l2.deployer,
    )) as L2GovernanceRelay,
  }
}

export async function useStaticRouterDeployment(
  network: NetworkConfig,
  addresses: {
    l1GatewayRouter: string
    l2GatewayRouter: string
  },
): ReturnType<typeof deployRouter> {
  return {
    l1GatewayRouter: (await ethers.getContractAt(
      getArbitrumArtifact('L1GatewayRouter').abi as any,
      throwIfUndefined(addresses.l1GatewayRouter),
      network.l1.deployer,
    )) as any,
    l2GatewayRouter: (await ethers.getContractAt(
      getArbitrumArtifact('L2GatewayRouter').abi as any,
      throwIfUndefined(addresses.l2GatewayRouter),
      network.l1.deployer,
    )) as any, // todo types for router
  }
}

function throwIfUndefined(val: any): any {
  assert(val !== undefined, 'val is undefined! Static config incorrect!')

  return val
}
