import { waitForTx } from '@makerdao/hardhat-utils'
import { BigNumber, ethers, Wallet } from 'ethers'
import { defaultAbiCoder } from 'ethers/lib/utils'

import { L1DaiGateway, L1GatewayRouter, L2GatewayRouter } from '../typechain'
import { getArbitrumCoreContracts } from './contracts'

export async function getGasPriceBid(l2: ethers.providers.BaseProvider): Promise<BigNumber> {
  return await l2.getGasPrice()
}

export async function getMaxSubmissionPrice(
  l2: ethers.providers.BaseProvider,
  calldataOrCalldataLength: string | number,
) {
  const calldataLength =
    typeof calldataOrCalldataLength === 'string' ? calldataOrCalldataLength.length : calldataOrCalldataLength
  const [submissionPrice] = await getArbitrumCoreContracts(l2).arbRetryableTx.getSubmissionPrice(calldataLength)
  const maxSubmissionPrice = submissionPrice.mul(4)
  return maxSubmissionPrice
}

export async function getMaxGas(
  l2: ethers.providers.BaseProvider,
  sender: string,
  destination: string,
  maxSubmissionPrice: BigNumber,
  gasPriceBid: BigNumber,
  calldata: string,
): Promise<BigNumber> {
  const [maxGas] = await getArbitrumCoreContracts(l2).nodeInterface.estimateRetryableTicket(
    sender,
    ethers.utils.parseEther('0.05'),
    destination,
    0,
    maxSubmissionPrice,
    sender,
    sender,
    0,
    gasPriceBid,
    calldata,
  )
  return maxGas
}

export async function depositToStandardBridge({
  from,
  to,
  l2Provider,
  deposit,
  l1Gateway,
  l1TokenAddress,
  l2GatewayAddress,
}: {
  from: Wallet
  to: string
  l2Provider: ethers.providers.BaseProvider
  deposit: BigNumber | string
  l1Gateway: L1DaiGateway
  l1TokenAddress: string
  l2GatewayAddress: string
}) {
  const gasPriceBid = await getGasPriceBid(l2Provider)

  const onlyData = '0x'
  const depositCalldata = await l1Gateway.getOutboundCalldata(l1TokenAddress, from.address, to, deposit, onlyData)
  const maxSubmissionPrice = await getMaxSubmissionPrice(l2Provider, depositCalldata)

  const maxGas = await getMaxGas(
    l2Provider,
    l1Gateway.address,
    l2GatewayAddress,
    maxSubmissionPrice,
    gasPriceBid,
    depositCalldata,
  )
  const defaultData = defaultAbiCoder.encode(['uint256', 'bytes'], [maxSubmissionPrice, onlyData])
  const ethValue = await maxSubmissionPrice.add(gasPriceBid.mul(maxGas))

  return await waitForTx(
    l1Gateway.connect(from).outboundTransfer(l1TokenAddress, to, deposit, maxGas, gasPriceBid, defaultData, {
      value: ethValue,
    }),
  )
}

export async function depositToStandardRouter({
  from,
  to,
  l2Provider,
  deposit,
  l1Gateway,
  l1Router,
  l1TokenAddress,
  l2GatewayAddress,
}: {
  from: Wallet
  to: string
  l2Provider: ethers.providers.BaseProvider
  deposit: BigNumber | string
  l1Router: L1GatewayRouter
  l1Gateway: L1DaiGateway
  l1TokenAddress: string
  l2GatewayAddress: string
}) {
  const gasPriceBid = await getGasPriceBid(l2Provider)

  const onlyData = '0x'
  const depositCalldata = await l1Gateway.getOutboundCalldata(l1TokenAddress, from.address, to, deposit, onlyData)
  const maxSubmissionPrice = await getMaxSubmissionPrice(l2Provider, depositCalldata)

  const maxGas = await getMaxGas(
    l2Provider,
    l1Gateway.address,
    l2GatewayAddress,
    maxSubmissionPrice,
    gasPriceBid,
    depositCalldata,
  )
  const defaultData = defaultAbiCoder.encode(['uint256', 'bytes'], [maxSubmissionPrice, onlyData])
  const ethValue = await maxSubmissionPrice.add(gasPriceBid.mul(maxGas))

  return await waitForTx(
    l1Router.connect(from).outboundTransfer(l1TokenAddress, to, deposit, maxGas, gasPriceBid, defaultData, {
      value: ethValue,
    }),
  )
}

export async function setGatewayForToken({
  l2Provider,
  l1Router,
  tokenGateway,
}: {
  l2Provider: ethers.providers.BaseProvider
  l1Router: L1GatewayRouter
  l2Router: L2GatewayRouter
  tokenGateway: L1DaiGateway
}) {
  const token = await tokenGateway.l1Dai()

  const calldataLength = 300 + 20 * 2 // fixedOverheadLength + 2 * address
  const gasPriceBid = await getGasPriceBid(l2Provider)
  const maxSubmissionPrice = await getMaxSubmissionPrice(l2Provider, calldataLength)
  await l1Router.setGateways([token], [tokenGateway.address], 0, gasPriceBid, maxSubmissionPrice, {
    value: maxSubmissionPrice,
  })
}
