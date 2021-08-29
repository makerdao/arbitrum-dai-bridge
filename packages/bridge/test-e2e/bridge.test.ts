import { getOptionalEnv, getRequiredEnv, waitForTx } from '@makerdao/hardhat-utils'
import { expect } from 'chai'
import { parseUnits } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { mapValues } from 'lodash'

import {
  BridgeDeployment,
  deployBridge,
  deployRouter,
  NetworkConfig,
  RouterDeployment,
  useStaticDeployment,
  useStaticRouterDeployment,
  waitToRelayTxsToL2,
} from '../arbitrum-helpers'
import { depositToStandardBridge, depositToStandardRouter, setGatewayForToken } from '../arbitrum-helpers/bridge'
import { RetryProvider } from './RetryProvider'

describe('bridge', () => {
  it('deposits funds', async () => {
    const { bridgeDeployment, network } = await setupTest()
    await bridgeDeployment.l1Escrow.approve(
      bridgeDeployment.l1Dai.address,
      bridgeDeployment.l1DaiGateway.address,
      ethers.constants.MaxUint256,
    )
    const initialL1Balance = await bridgeDeployment.l1Dai.balanceOf(network.l1.deployer.address)
    const initialEscrowBalance = await bridgeDeployment.l1Dai.balanceOf(bridgeDeployment.l1Escrow.address)
    const initialL2Balance = await bridgeDeployment.l2Dai.balanceOf(network.l1.deployer.address)

    const amount = parseUnits('7', 'ether')

    await waitForTx(bridgeDeployment.l1Dai.approve(bridgeDeployment.l1DaiGateway.address, amount))

    await waitToRelayTxsToL2(
      depositToStandardBridge({
        l2Provider: network.l2.provider,
        from: network.l1.deployer,
        to: network.l1.deployer.address,
        l1Gateway: bridgeDeployment.l1DaiGateway,
        l1TokenAddress: bridgeDeployment.l1Dai.address,
        l2GatewayAddress: bridgeDeployment.l2DaiGateway.address,
        deposit: amount,
      }),
      network.l1.inbox,
      network.l1.provider,
      network.l2.provider,
    )

    expect(await bridgeDeployment.l1Dai.balanceOf(network.l1.deployer.address)).to.be.eq(initialL1Balance.sub(amount))
    expect(await bridgeDeployment.l1Dai.balanceOf(bridgeDeployment.l1Escrow.address)).to.be.eq(
      initialEscrowBalance.add(amount),
    )
    expect(await bridgeDeployment.l2Dai.balanceOf(network.l1.deployer.address)).to.be.eq(initialL2Balance.add(amount))

    await waitForTx(
      bridgeDeployment.l2DaiGateway
        .connect(network.l2.deployer)
        ['outboundTransfer(address,address,uint256,bytes)'](
          bridgeDeployment.l1Dai.address,
          network.l1.deployer.address,
          amount,
          '0x',
        ),
    )

    expect(await bridgeDeployment.l2Dai.balanceOf(network.l1.deployer.address)).to.be.eq(initialL2Balance) // burn is immediate
  })

  it('deposits funds using gateway', async () => {
    const { bridgeDeployment, routerDeployment, network } = await setupTest()
    await bridgeDeployment.l1Escrow.approve(
      bridgeDeployment.l1Dai.address,
      bridgeDeployment.l1DaiGateway.address,
      ethers.constants.MaxUint256,
    )
    const initialL1Balance = await bridgeDeployment.l1Dai.balanceOf(network.l1.deployer.address)
    const initialEscrowBalance = await bridgeDeployment.l1Dai.balanceOf(bridgeDeployment.l1Escrow.address)
    const initialL2Balance = await bridgeDeployment.l2Dai.balanceOf(network.l1.deployer.address)

    const amount = parseUnits('7', 'ether')

    await waitForTx(bridgeDeployment.l1Dai.approve(bridgeDeployment.l1DaiGateway.address, amount))
    await waitToRelayTxsToL2(
      depositToStandardRouter({
        l2Provider: network.l2.provider,
        from: network.l1.deployer,
        to: network.l1.deployer.address,
        l1Gateway: bridgeDeployment.l1DaiGateway,
        l1Router: routerDeployment.l1GatewayRouter,
        l1TokenAddress: bridgeDeployment.l1Dai.address,
        l2GatewayAddress: bridgeDeployment.l2DaiGateway.address,
        deposit: amount,
      }),
      network.l1.inbox,
      network.l1.provider,
      network.l2.provider,
    )

    expect(await bridgeDeployment.l1Dai.balanceOf(network.l1.deployer.address)).to.be.eq(initialL1Balance.sub(amount))
    expect(await bridgeDeployment.l1Dai.balanceOf(bridgeDeployment.l1Escrow.address)).to.be.eq(
      initialEscrowBalance.add(amount),
    )
    expect(await bridgeDeployment.l2Dai.balanceOf(network.l1.deployer.address)).to.be.eq(initialL2Balance.add(amount))

    await waitForTx(
      bridgeDeployment.l2DaiGateway
        .connect(network.l2.deployer)
        ['outboundTransfer(address,address,uint256,bytes)'](
          bridgeDeployment.l1Dai.address,
          network.l1.deployer.address,
          amount,
          '0x',
        ),
    )

    expect(await bridgeDeployment.l2Dai.balanceOf(network.l1.deployer.address)).to.be.eq(initialL2Balance) // burn is immediate
  })
})

export async function setupTest() {
  const network = getRinkebyNetworkConfig()

  let bridgeDeployment: BridgeDeployment
  let routerDeployment: RouterDeployment

  const staticDeployment = getOptionalEnv('E2E_TESTS_DEPLOYMENT')
  if (staticDeployment) {
    console.log('Using static deployment...')
    routerDeployment = await useStaticRouterDeployment(network, staticDeployment)
    bridgeDeployment = await useStaticDeployment(network, staticDeployment)
  } else {
    routerDeployment = await deployRouter(network)
    bridgeDeployment = await deployBridge(network, routerDeployment)

    await setGatewayForToken({
      l1Router: routerDeployment.l1GatewayRouter,
      l2Router: routerDeployment.l2GatewayRouter,
      l2Provider: network.l2.provider,
      tokenGateway: bridgeDeployment.l1DaiGateway,
    })
  }

  console.log(
    'Bridge deployment: ',
    JSON.stringify(
      mapValues(bridgeDeployment, (v) => v.address),
      null,
      2,
    ),
  )

  console.log(
    'Router deployment: ',
    JSON.stringify(
      mapValues(routerDeployment, (v) => v.address),
      null,
      2,
    ),
  )

  return {
    bridgeDeployment,
    routerDeployment,
    network,
  }
}

export function getRinkebyNetworkConfig(): NetworkConfig {
  const pkey = getRequiredEnv('E2E_TESTS_PKEY')
  const l1 = new ethers.providers.JsonRpcProvider(getRequiredEnv('E2E_TESTS_L1_RPC'))
  const l2 = new RetryProvider(3, getRequiredEnv('E2E_TESTS_L2_RPC'))

  const l1Deployer = new ethers.Wallet(pkey, l1)
  const l2Deployer = new ethers.Wallet(pkey, l2)

  return {
    l1: {
      provider: l1,
      dai: '0xd9e66A2f546880EA4d800F189d6F12Cc15Bff281',
      deployer: l1Deployer,
      inbox: '0x578BAde599406A8fE3d24Fd7f7211c0911F5B29e',
      makerPauseProxy: '0xeA5F0Db1e768EE40eBEF1f3832F8C7B368690f66',
      makerESM: '0xa44E96287C34b9a37d3A0c9541908f4Ef3Cd4Aa4',
    },
    l2: {
      provider: l2,
      deployer: l2Deployer,
    },
  }
}
