import { getOptionalEnv, getRequiredEnv, waitForTx } from '@makerdao/hardhat-utils'
import { expect } from 'chai'
import { parseUnits } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { mapValues } from 'lodash'

import { deploy, useDeployment, waitToRelayTxsToL2 } from '../arbitrum-helpers'
import { depositToStandardBridge } from '../arbitrum-helpers/bridge'

describe('bridge', () => {
  it('deposits funds', async () => {
    const { deployment, network } = await setupTest()
    const initialL1Balance = await deployment.l1Dai.balanceOf(network.l1.deployer.address)
    const initialEscrowBalance = await deployment.l1Dai.balanceOf(deployment.l1Escrow.address)
    const initialL2Balance = await deployment.l2Dai.balanceOf(network.l1.deployer.address)

    const amount = parseUnits('7', 'ether')

    await waitForTx(deployment.l1Dai.approve(deployment.l1DaiGateway.address, amount))

    await waitToRelayTxsToL2(
      depositToStandardBridge({
        l2Provider: network.l2.provider,
        from: network.l1.deployer,
        to: network.l1.deployer.address,
        l1Gateway: deployment.l1DaiGateway,
        l1TokenAddress: deployment.l1Dai.address,
        l2GatewayAddress: deployment.l2DaiGateway.address,
        deposit: amount,
      }),
      network.l1.inbox,
      network.l1.provider,
      network.l2.provider,
    )

    expect(await deployment.l1Dai.balanceOf(network.l1.deployer.address)).to.be.eq(initialL1Balance.sub(amount))
    expect(await deployment.l1Dai.balanceOf(deployment.l1Escrow.address)).to.be.eq(initialEscrowBalance.add(amount))
    expect(await deployment.l2Dai.balanceOf(network.l1.deployer.address)).to.be.eq(initialL2Balance.add(amount))

    await waitForTx(
      deployment.l2DaiGateway
        .connect(network.l2.deployer)
        ['outboundTransfer(address,address,uint256,bytes)'](
          deployment.l1Dai.address,
          network.l1.deployer.address,
          amount,
          '0x',
        ),
    )

    expect(await deployment.l2Dai.balanceOf(network.l1.deployer.address)).to.be.eq(initialL2Balance) // burn is immediate
  })
})

export async function setupTest() {
  const network = getRinkebyNetworkConfig()

  const staticDeployment = getOptionalEnv('E2E_TESTS_DEPLOYMENT')
  let deployment
  if (staticDeployment) {
    console.log('Using static deployment...')
    deployment = await useDeployment(network, staticDeployment)
  } else {
    console.log('Deploying stack...')
    deployment = await deploy(network)
  }

  console.log(
    'Addresses: ',
    JSON.stringify(
      mapValues(deployment, (v) => v.address),
      null,
      2,
    ),
  )

  return {
    deployment,
    network,
  }
}

export function getRinkebyNetworkConfig() {
  const pkey = getRequiredEnv('E2E_TESTS_PKEY')
  const l1 = new ethers.providers.JsonRpcProvider('https://rinkeby.infura.io/v3/54c77d74180948c98dc94473437438f4')
  const l2 = new ethers.providers.JsonRpcProvider('https://rinkeby.arbitrum.io/rpc')

  const l1Deployer = new ethers.Wallet(pkey, l1)
  const l2Deployer = new ethers.Wallet(pkey, l2)

  return {
    l1: {
      provider: l1,
      dai: '0xd9e66A2f546880EA4d800F189d6F12Cc15Bff281',
      deployer: l1Deployer,
      inbox: '0x578BAde599406A8fE3d24Fd7f7211c0911F5B29e',
      router: '0x70C143928eCfFaf9F5b406f7f4fC28Dc43d68380',
    },
    l2: {
      provider: l2,
      deployer: l2Deployer,
      router: '0x9413AD42910c1eA60c737dB5f58d1C504498a3cD',
    },
  }
}
