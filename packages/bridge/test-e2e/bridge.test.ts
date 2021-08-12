require('hardhat')

import { expect } from 'chai'
import { defaultAbiCoder, parseUnits } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { mapValues } from 'lodash'
import { L1Escrow } from '../typechain'
import { waitToRelayTxsToL2 } from './helpers/arbitrum'
import { depositToStandardBridge, getGasPriceBid, getMaxSubmissionPrice } from './helpers/arbitrum/bridge'
import { deploy, useDeployment } from './helpers/deploy'
import { getRequiredEnv, waitForTx } from './helpers/utils'

describe('bridge', () => {
  it('deposits funds', async () => {
    const { deployment, l1, l2, l1Deployer, l2Deployer, inboxAddress } = await setupTest()
    const initialL1Balance = await deployment.l1Dai.balanceOf(l1Deployer.address)
    const initialEscrowBalance = await deployment.l1Dai.balanceOf(deployment.l1Escrow.address)
    const initialL2Balance = await deployment.l2Dai.balanceOf(l1Deployer.address)

    const amount = parseUnits('7', 'ether')

    await waitForTx(deployment.l1Dai.approve(deployment.l1DaiGateway.address, amount))

    await waitToRelayTxsToL2(
      depositToStandardBridge({
        l2Provider: l2,
        from: l1Deployer,
        to: l1Deployer.address,
        l1Gateway: deployment.l1DaiGateway,
        l1TokenAddress: deployment.l1Dai.address,
        l2GatewayAddress: deployment.l2DaiGateway.address,
        deposit: amount,
      }),
      inboxAddress,
      l1,
      l2,
    )

    expect(await deployment.l1Dai.balanceOf(l1Deployer.address)).to.be.eq(initialL1Balance.sub(amount))
    expect(await deployment.l1Dai.balanceOf(deployment.l1Escrow.address)).to.be.eq(initialEscrowBalance.add(amount))
    expect(await deployment.l2Dai.balanceOf(l1Deployer.address)).to.be.eq(initialL2Balance.add(amount))

    await waitForTx(
      deployment.l2DaiGateway
        .connect(l2Deployer)
        ['outboundTransfer(address,address,uint256,bytes)'](deployment.l1Dai.address, l1Deployer.address, amount, '0x'),
    )

    expect(await deployment.l2Dai.balanceOf(l1Deployer.address)).to.be.eq(initialL2Balance) // burn is immediate
  })
})

export async function setupTest() {
  const pkey = getRequiredEnv('E2E_TESTS_PKEY')
  const l1 = new ethers.providers.JsonRpcProvider('https://rinkeby.infura.io/v3/54c77d74180948c98dc94473437438f4')
  const l2 = new ethers.providers.JsonRpcProvider('https://rinkeby.arbitrum.io/rpc')
  const inboxAddress = '0x578BAde599406A8fE3d24Fd7f7211c0911F5B29e'

  const l1Deployer = new ethers.Wallet(pkey, l1)
  const l2Deployer = new ethers.Wallet(pkey, l2)

  const deployment = await useDeployment({
    l1: {
      dai: '0xd9e66A2f546880EA4d800F189d6F12Cc15Bff281',
      deployer: l1Deployer,
      inbox: '0x578BAde599406A8fE3d24Fd7f7211c0911F5B29e',
      router: '0x70C143928eCfFaf9F5b406f7f4fC28Dc43d68380',
    },
    l2: {
      deployer: l2Deployer,
      router: '0x9413AD42910c1eA60c737dB5f58d1C504498a3cD',
    },
  })

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
    l1Deployer,
    l1,
    l2,
    l2Deployer,
    inboxAddress,
  }
}
