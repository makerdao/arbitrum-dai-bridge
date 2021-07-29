import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers } from 'hardhat'

import { ArbDai__factory, L1DaiGateway__factory, L2DaiGateway__factory } from '../../typechain'
import { assertPublicMethods, deploy, deployArbitrumContractMock } from '../helpers/helpers'

describe('L2DaiGateway', () => {
  describe('finalizeInboundTransfer', () => {
    const depositAmount = 100

    it('mints tokens', async () => {
      const [sender, l1Dai, router] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: sender, router })
      const receiverAddress = sender.address

      const data = ethers.utils.defaultAbiCoder.encode(['bytes', 'bytes'], ['0x', '0x'])

      const tx = await l2DaiGateway.finalizeInboundTransfer(
        l1Dai.address,
        sender.address,
        receiverAddress,
        depositAmount,
        data,
      )

      expect(await l2Dai.balanceOf(receiverAddress)).to.be.eq(depositAmount)
      expect(await l2Dai.totalSupply()).to.be.eq(depositAmount)
      await expect(tx)
        .to.emit(l2DaiGateway, 'InboundTransferFinalized')
        .withArgs(l1Dai.address, sender.address, receiverAddress, l2Dai.address, depositAmount, data)
    })

    it('mints tokens for a 3rd party')
    it('mints tokens and emits events with custom data')
    it('calls receiver with data when present', () => {})
    it('mints tokens even when closed')
    it('reverts when withdrawing not supported tokens')
    it('reverts when DAI minting access was revoked')
    it('reverts when called not by XDomainMessenger')
    it('reverts when called by XDomainMessenger but not relying message from l1DaiGateway')
  })

  describe('outboundTransfer(address,address,uint256,bytes)', () => {
    const withdrawAmount = 100

    it('sends xchain message and burns tokens', async () => {
      const [sender, l1DaiBridge, l1Dai, router] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway, arbSysMock } = await setupWithdrawalTest({ l1Dai, l1DaiBridge, router })

      const receiverAddress = sender.address
      const data = '0x'
      const expectedWithdrawalId = 0

      await l2Dai.mint(sender.address, withdrawAmount)

      const tx = await l2DaiGateway['outboundTransfer(address,address,uint256,bytes)'](
        l1Dai.address,
        receiverAddress,
        withdrawAmount,
        data,
      )
      const withdrawCrossChainCall = arbSysMock.smocked.sendTxToL1.calls[0]

      expect(await l2Dai.balanceOf(sender.address)).to.be.eq(0)
      expect(await l2Dai.totalSupply()).to.be.eq(0)
      await expect(tx)
        .to.emit(l2DaiGateway, 'OutboundTransferInitiated')
        .withArgs(l1Dai.address, sender.address, receiverAddress, expectedWithdrawalId, withdrawAmount, data)
      expect(withdrawCrossChainCall.destAddr).to.eq(l1DaiBridge.address)
      expect(withdrawCrossChainCall.calldataForL1).to.eq(
        new L1DaiGateway__factory().interface.encodeFunctionData('finalizeInboundTransfer', [
          l1Dai.address,
          sender.address,
          receiverAddress,
          withdrawAmount,
          ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [expectedWithdrawalId, data]),
        ]),
      )
    })
  })
  describe('outboundTransfer(address,address,uint256,uint256,uint256,bytes)', () => {})
  describe('close', () => {})
  describe('constructor', () => {})

  describe('inboundEscrowAndCall', () => {
    it("can't be called from the outside")
  })

  describe('postUpgradeInit', () => {
    it("can't be called from the outside")
  })

  it('has correct public interface', async () => {
    // @todo missing close & auth interface
    await assertPublicMethods('L2DaiGateway', [
      'finalizeInboundTransfer(address,address,address,uint256,bytes)', // finalize deposit
      'outboundTransfer(address,address,uint256,bytes)', // withdraw
      'outboundTransfer(address,address,uint256,uint256,uint256,bytes)', // withdrawTo
      'inboundEscrowAndCall(address,uint256,address,address,bytes)', // not really public
      'postUpgradeInit()', // @todo not sure why this one is needed
    ])
  })

  it('implements auth')
})

async function setupTest(signers: {
  l1Dai: SignerWithAddress
  l1DaiBridge: SignerWithAddress
  router: SignerWithAddress
}) {
  const l2Dai = await deploy<ArbDai__factory>('ArbDai', [signers.l1Dai.address])
  const l2DaiGateway = await deploy<L2DaiGateway__factory>('L2DaiGateway', [
    signers.l1DaiBridge.address,
    signers.router.address,
    signers.l1Dai.address,
    l2Dai.address,
  ])
  await l2Dai.rely(l2DaiGateway.address)

  return {
    l2Dai,
    l2DaiGateway,
  }
}

async function setupWithdrawalTest(signers: {
  l1Dai: SignerWithAddress
  l1DaiBridge: SignerWithAddress
  router: SignerWithAddress
}) {
  const harness = await setupTest(signers)
  const arbSysMock = await deployArbitrumContractMock('ArbSys', {
    address: '0x0000000000000000000000000000000000000064',
  })

  return {
    ...harness,
    arbSysMock,
  }
}
