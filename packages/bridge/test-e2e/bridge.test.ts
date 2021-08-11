require('hardhat')

import { defaultAbiCoder, parseUnits } from 'ethers/lib/utils'
import { ethers } from 'hardhat'
import { mapValues } from 'lodash'
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
        arbRetryableTx: '0x000000000000000000000000000000000000006E',
        nodeInterface: '0x00000000000000000000000000000000000000C8',
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

    const depositAmount = parseUnits('42', 'ether')
    console.log('depositAmount', depositAmount.toString())

    const gasPriceBid = await l2Deployer.getGasPrice()
    console.log('gasPriceBid: ', gasPriceBid)

    const onlyData = '0x'
    const depositCalldata = await deployment.l1DaiGateway.getOutboundCalldata(
      deployment.l1Dai.address,
      l1Deployer.address,
      l1Deployer.address,
      depositAmount,
      onlyData,
    )
    const [submissionPrice] = await deployment.arbRetryableTx.getSubmissionPrice(depositCalldata.length)
    const maxSubmissionPrice = submissionPrice.mul(4)
    console.log('maxSubmissionPrice: ', maxSubmissionPrice)
    const defaultData = defaultAbiCoder.encode(['uint256', 'bytes'], [maxSubmissionPrice, onlyData])

    const [maxGas] = await deployment.nodeInterface.estimateRetryableTicket(
      deployment.l1DaiGateway.address,
      ethers.utils.parseEther('0.05'),
      deployment.l2DaiGateway.address,
      0,
      maxSubmissionPrice,
      l1Deployer.address,
      l1Deployer.address,
      0,
      0,
      depositCalldata,
    )
    console.log('maxGas: ', maxGas.toString())
    // await waitForTx(deployment.l1Dai.approve(deployment.l1DaiGateway.address, depositAmount))
    console.log('Sending deposit request!')
    const ethValue = await maxSubmissionPrice.add(gasPriceBid.mul(maxGas))
    await waitForTx(
      deployment.l1DaiGateway.outboundTransfer(
        deployment.l1Dai.address,
        l1Deployer.address,
        depositAmount,
        maxGas,
        gasPriceBid,
        defaultData,
        {
          value: ethValue,
        },
      ),
    )
  })
})
