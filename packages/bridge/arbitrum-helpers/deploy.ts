import { deployUsingFactory, getAddressOfNextDeployedContract } from '@makerdao/hardhat-utils'
import { expect } from 'chai'
import { Signer } from 'ethers'
import { ethers } from 'hardhat'

import { ArbDai, Dai, L1DaiGateway, L1Escrow, L2DaiGateway } from '../typechain'

interface Dependencies {
  l1: {
    deployer: Signer
    dai: string
    router: string
    inbox: string
  }

  l2: {
    deployer: Signer
    router: string
  }
}

export async function deploy(deps: Dependencies) {
  const l1Escrow = await deployUsingFactory(deps.l1.deployer, await ethers.getContractFactory('L1Escrow'), [])
  console.log('Deployed l1Escrow at: ', l1Escrow.address)

  const l2Dai = await deployUsingFactory(deps.l2.deployer, await ethers.getContractFactory('ArbDai'), [deps.l1.dai])
  console.log('Deployed l2Dai at: ', l2Dai.address)
  const l1DaiGatewayFutureAddr = await getAddressOfNextDeployedContract(deps.l1.deployer)
  const l2DaiGateway = await deployUsingFactory(deps.l2.deployer, await ethers.getContractFactory('L2DaiGateway'), [
    l1DaiGatewayFutureAddr,
    deps.l2.router, // @todo: double check
    deps.l1.dai,
    l2Dai.address,
  ])
  console.log('Deployed l2DaiGateway at: ', l2DaiGateway.address)
  await l2Dai.rely(l2DaiGateway.address) // allow minting/burning from the bridge

  const l1DaiGateway = await deployUsingFactory(deps.l1.deployer, await ethers.getContractFactory('L1DaiGateway'), [
    l2DaiGateway.address,
    deps.l1.router,
    deps.l1.inbox,
    deps.l1.dai,
    l2Dai.address,
    l1Escrow.address,
  ])
  console.log('Deployed l1DaiGateway at: ', l1DaiGateway.address)
  expect(l1DaiGateway.address).to.be.eq(
    l1DaiGatewayFutureAddr,
    "Expected future address of l1DaiGateway doesn't match actual address!",
  )

  return {
    l1DaiGateway,
    l1Escrow,
    l2Dai,
    l2DaiGateway,
    l1Dai: (await ethers.getContractAt('Dai', deps.l1.dai, deps.l1.deployer)) as Dai,
  }
}

export async function useDeployment(deps: Dependencies, staticConfigString: string) {
  const staticConfig = JSON.parse(staticConfigString)

  return {
    l1DaiGateway: (await ethers.getContractAt(
      'L1DaiGateway',
      staticConfig.l1DaiGateway,
      deps.l1.deployer,
    )) as L1DaiGateway,
    l1Escrow: (await ethers.getContractAt('L1Escrow', staticConfig.l1Escrow, deps.l1.deployer)) as L1Escrow,
    l2Dai: (await ethers.getContractAt('ArbDai', staticConfig.l2Dai, deps.l2.deployer)) as ArbDai,
    l2DaiGateway: (await ethers.getContractAt(
      'L2DaiGateway',
      staticConfig.l2DaiGateway,
      deps.l2.deployer,
    )) as L2DaiGateway,
    l1Dai: (await ethers.getContractAt('Dai', staticConfig.l1Dai, deps.l1.deployer)) as Dai,
  }
}
