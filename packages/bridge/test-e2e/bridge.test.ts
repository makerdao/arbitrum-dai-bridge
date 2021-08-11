require('hardhat')

import { defaultAbiCoder, parseUnits } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { mapValues } from 'lodash'
import { depositToStandardBridge, getGasPriceBid, getMaxSubmissionPrice } from './helpers/arbitrum'
import { deploy, useDeployment } from './helpers/deploy'
import { getRequiredEnv, waitForTx } from './helpers/utils'

describe('bridge', () => {
  it('works', async () => {
    const pkey = getRequiredEnv('E2E_TESTS_PKEY')
    const l1 = new ethers.providers.JsonRpcProvider('https://rinkeby.infura.io/v3/54c77d74180948c98dc94473437438f4')
    const l2 = new ethers.providers.JsonRpcProvider('https://rinkeby.arbitrum.io/rpc')

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

    const depositAmount = parseUnits('7', 'ether')

    await waitForTx(deployment.l1Dai.approve(deployment.l1DaiGateway.address, depositAmount))

    await depositToStandardBridge({
      l2Provider: l2,
      from: l1Deployer,
      to: l1Deployer.address,
      l1Gateway: deployment.l1DaiGateway,
      l1TokenAddress: deployment.l1Dai.address,
      l2GatewayAddress: deployment.l2DaiGateway.address,
      deposit: depositAmount,
    })
  })
})
