import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { defaultAbiCoder } from 'ethers/lib/utils'
import { ethers } from 'hardhat'

import { ArbDai__factory, Dai__factory, L1DaiGateway__factory, L2DaiGateway__factory } from '../../typechain'
import { assertPublicMethods, deploy, deployArbitrumContractMock } from '../helpers/helpers'

const initialTotalL1Supply = 3000
const errorMessages = {
  tokenMismatch: 'L1DaiGateway/token-not-dai',
}

describe('L1DaiGateway', () => {
  describe('outboundTransfer()', () => {
    const depositAmount = 100
    const defaultGas = 42
    const maxSubmissionCost = 7
    const callHookData = '0x12'
    const defaultData = defaultAbiCoder.encode(['uint256', 'bytes'], [maxSubmissionCost, callHookData])

    it('escrows funds and sends xchain message', async () => {
      const [_deployer, inboxImpersonator, l1EscrowEOA, l2DaiGatewayEOA, routerEOA, sender] = await ethers.getSigners()
      const { l1Dai, inboxMock, l1DaiGateway } = await setupTest({
        inboxImpersonator,
        l1Escrow: l1EscrowEOA,
        l2DaiGateway: l2DaiGatewayEOA,
        router: routerEOA,
        user1: sender,
      })

      await l1Dai.connect(sender).approve(l1DaiGateway.address, depositAmount)
      const depositTx = await l1DaiGateway
        .connect(sender)
        .outboundTransfer(l1Dai.address, sender.address, depositAmount, defaultGas, 0, defaultData)
      const depositCallToMessengerCall = inboxMock.smocked.createRetryableTicket.calls[0]

      const expectedDepositId = 0
      const l2EncodedData = defaultAbiCoder.encode(['bytes', 'bytes'], ['0x', callHookData])
      const expectedDepositXDomainCallData = new L2DaiGateway__factory().interface.encodeFunctionData(
        'finalizeInboundTransfer',
        [l1Dai.address, sender.address, sender.address, depositAmount, l2EncodedData],
      )

      expect(await l1Dai.balanceOf(sender.address)).to.be.eq(initialTotalL1Supply - depositAmount)
      expect(await l1Dai.balanceOf(l1DaiGateway.address)).to.be.eq(0)
      expect(await l1Dai.balanceOf(l1EscrowEOA.address)).to.be.eq(depositAmount)

      expect(depositCallToMessengerCall.destAddr).to.equal(l2DaiGatewayEOA.address)
      expect(depositCallToMessengerCall.l2CallValue).to.equal(0)
      expect(depositCallToMessengerCall.maxSubmissionCost).to.equal(maxSubmissionCost)
      expect(depositCallToMessengerCall.excessFeeRefundAddress).to.equal(sender.address)
      expect(depositCallToMessengerCall.callValueRefundAddress).to.equal(sender.address)
      expect(depositCallToMessengerCall.maxGas).to.equal(defaultGas)
      expect(depositCallToMessengerCall.gasPriceBid).to.equal(0)
      expect(depositCallToMessengerCall.data).to.equal(expectedDepositXDomainCallData)

      await expect(depositTx)
        .to.emit(l1DaiGateway, 'OutboundTransferInitiated')
        .withArgs(l1Dai.address, sender.address, sender.address, expectedDepositId, depositAmount, defaultData)
      await expect(depositTx)
        .to.emit(l1DaiGateway, 'TxToL2')
        .withArgs(sender.address, l2DaiGatewayEOA.address, expectedDepositId, expectedDepositXDomainCallData)
    })

    it('escrows funds and sends xchain message for 3rd party', async () => {
      const [_deployer, inboxImpersonator, l1EscrowEOA, l2DaiGatewayEOA, routerEOA, sender, receiver] =
        await ethers.getSigners()
      const { l1Dai, inboxMock, l1DaiGateway } = await setupTest({
        inboxImpersonator,
        l1Escrow: l1EscrowEOA,
        l2DaiGateway: l2DaiGatewayEOA,
        router: routerEOA,
        user1: sender,
      })

      await l1Dai.connect(sender).approve(l1DaiGateway.address, depositAmount)
      const depositTx = await l1DaiGateway
        .connect(sender)
        .outboundTransfer(l1Dai.address, receiver.address, depositAmount, defaultGas, 0, defaultData)
      const depositCallToMessengerCall = inboxMock.smocked.createRetryableTicket.calls[0]

      const expectedDepositId = 0
      const l2EncodedData = defaultAbiCoder.encode(['bytes', 'bytes'], ['0x', callHookData])
      const expectedDepositXDomainCallData = new L2DaiGateway__factory().interface.encodeFunctionData(
        'finalizeInboundTransfer',
        [l1Dai.address, sender.address, receiver.address, depositAmount, l2EncodedData],
      )

      expect(await l1Dai.balanceOf(sender.address)).to.be.eq(initialTotalL1Supply - depositAmount)
      expect(await l1Dai.balanceOf(receiver.address)).to.be.eq(0)
      expect(await l1Dai.balanceOf(l1DaiGateway.address)).to.be.eq(0)
      expect(await l1Dai.balanceOf(l1EscrowEOA.address)).to.be.eq(depositAmount)

      expect(depositCallToMessengerCall.destAddr).to.equal(l2DaiGatewayEOA.address)
      expect(depositCallToMessengerCall.l2CallValue).to.equal(0)
      expect(depositCallToMessengerCall.maxSubmissionCost).to.equal(maxSubmissionCost)
      expect(depositCallToMessengerCall.excessFeeRefundAddress).to.equal(sender.address)
      expect(depositCallToMessengerCall.callValueRefundAddress).to.equal(sender.address)
      expect(depositCallToMessengerCall.maxGas).to.equal(defaultGas)
      expect(depositCallToMessengerCall.gasPriceBid).to.equal(0)
      expect(depositCallToMessengerCall.data).to.equal(expectedDepositXDomainCallData)

      await expect(depositTx)
        .to.emit(l1DaiGateway, 'OutboundTransferInitiated')
        .withArgs(l1Dai.address, sender.address, receiver.address, expectedDepositId, depositAmount, defaultData)
      await expect(depositTx)
        .to.emit(l1DaiGateway, 'TxToL2')
        .withArgs(sender.address, l2DaiGatewayEOA.address, expectedDepositId, expectedDepositXDomainCallData)
    })
    it('decodes data correctly when called via router')
    it('decodes data correctly in other cases')

    it('reverts when called with a different token', async () => {
      const [_deployer, inboxImpersonator, l1EscrowEOA, l2DaiGatewayEOA, routerEOA, sender] = await ethers.getSigners()
      const { l1Dai, l1DaiGateway, l2Dai } = await setupTest({
        inboxImpersonator,
        l1Escrow: l1EscrowEOA,
        l2DaiGateway: l2DaiGatewayEOA,
        router: routerEOA,
        user1: sender,
      })

      await l1Dai.connect(sender).approve(l1DaiGateway.address, depositAmount)
      await expect(
        l1DaiGateway
          .connect(sender)
          .outboundTransfer(l2Dai.address, sender.address, depositAmount, defaultGas, 0, defaultData),
      ).to.revertedWith(errorMessages.tokenMismatch)
    })
    it('reverts when called not by EOA')
    it('reverts when approval is too low')
    it('reverts when funds too low')
    it('reverts when bridge is closed')
  })

  describe('finalizeInboundTransfer', () => {
    const withdrawAmount = 100

    it('sends funds from the escrow', async () => {
      const expectedTransferId = 1
      const defaultWithdrawData = ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [expectedTransferId, '0x'])

      const [
        _deployer,
        inboxImpersonator,
        l1EscrowEOA,
        l2DaiGatewayEOA,
        routerEOA,
        bridgeImpersonator,
        outboxImpersonator,
        user1,
      ] = await ethers.getSigners()
      const { l1Dai, outboxMock, l1DaiGateway } = await setupWithdrawalTest({
        inboxImpersonator,
        l1Escrow: l1EscrowEOA,
        l2DaiGateway: l2DaiGatewayEOA,
        router: routerEOA,
        user1,
        bridgeImpersonator,
        outboxImpersonator,
      })
      outboxMock.smocked.l2ToL1Sender.will.return.with(() => l2DaiGatewayEOA.address)

      const finalizeWithdrawalTx = await l1DaiGateway
        .connect(outboxImpersonator)
        .finalizeInboundTransfer(l1Dai.address, user1.address, user1.address, withdrawAmount, defaultWithdrawData)

      expect(await l1Dai.balanceOf(user1.address)).to.be.equal(withdrawAmount)
      expect(await l1Dai.balanceOf(l1EscrowEOA.address)).to.be.equal(initialTotalL1Supply - withdrawAmount)
      await expect(finalizeWithdrawalTx)
        .to.emit(l1DaiGateway, 'InboundTransferFinalized')
        .withArgs(l1Dai.address, user1.address, user1.address, expectedTransferId, withdrawAmount, defaultWithdrawData)
    })

    it('sends funds from the escrow to the 3rd party')
    // pending withdrawals MUST success even if bridge is closed
    it('completes withdrawals even when closed')
    it('reverts when called with a different token')
    it('reverts when called not by XDomainMessenger')
    it('reverts when called by XDomainMessenger but not relying message from l2DAITokenBridge')
  })

  describe('transferExitAndCall', () => {
    const withdrawAmount = 100

    it('transfers exit and calls external contract', async () => {
      const expectedTransferId = 1
      const defaultWithdrawData = ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [expectedTransferId, '0x'])

      const [
        _deployer,
        inboxImpersonator,
        l1EscrowEOA,
        l2DaiGatewayEOA,
        routerEOA,
        bridgeImpersonator,
        outboxImpersonator,
        user1,
      ] = await ethers.getSigners()
      const { l1Dai, outboxMock, l1DaiGateway } = await setupWithdrawalTest({
        inboxImpersonator,
        l1Escrow: l1EscrowEOA,
        l2DaiGateway: l2DaiGatewayEOA,
        router: routerEOA,
        user1,
        bridgeImpersonator,
        outboxImpersonator,
      })
      const exitReceiverMock = await deployArbitrumContractMock('ITradeableExitReceiver')
      exitReceiverMock.smocked.onExitTransfer.will.return.with(true)

      const transferExitTx = await l1DaiGateway
        .connect(user1)
        .transferExitAndCall(
          expectedTransferId,
          user1.address,
          exitReceiverMock.address,
          defaultWithdrawData,
          defaultWithdrawData,
        )
      const onExitTransferMessengerCall = exitReceiverMock.smocked.onExitTransfer.calls[0]

      expect(onExitTransferMessengerCall.exitNum).to.be.eq(expectedTransferId)
      expect(onExitTransferMessengerCall.sender).to.be.eq(user1.address)
      expect(onExitTransferMessengerCall.data).to.be.eq(defaultWithdrawData)

      await expect(transferExitTx)
        .to.emit(l1DaiGateway, 'WithdrawRedirected')
        .withArgs(
          user1.address,
          exitReceiverMock.address,
          expectedTransferId,
          defaultWithdrawData,
          defaultWithdrawData,
          true,
        )

      outboxMock.smocked.l2ToL1Sender.will.return.with(() => l2DaiGatewayEOA.address)
      // it should withdraw funds not to user1 but to exitReceiverMock
      await l1DaiGateway
        .connect(outboxImpersonator)
        .finalizeInboundTransfer(l1Dai.address, user1.address, user1.address, withdrawAmount, defaultWithdrawData)

      expect(await l1Dai.balanceOf(user1.address)).to.be.equal(0)
      expect(await l1Dai.balanceOf(exitReceiverMock.address)).to.be.equal(withdrawAmount)
      expect(await l1Dai.balanceOf(l1EscrowEOA.address)).to.be.equal(initialTotalL1Supply - withdrawAmount)
    })

    it('reverts when not expected sender called')
    it('reverts when exitReceiver reverts or returns false')
  })

  describe('close()', () => {})

  describe('constructor', () => {})

  describe('inboundEscrowAndCall', () => {
    it("can't be called by anyone")
  })

  it('has correct public interface', async () => {
    await assertPublicMethods('L1DaiGateway', [
      'finalizeInboundTransfer(address,address,address,uint256,bytes)', // withdraw
      'outboundTransfer(address,address,uint256,uint256,uint256,bytes)', // deposit
      'transferExitAndCall(uint256,address,address,bytes,bytes)', // transfers the right to withdrawal and call a contract(allows for fast exits)
      'inboundEscrowAndCall(address,uint256,address,address,bytes)', // not really public -- can be called only by itself
    ])
  })

  it('implements auth')
})

async function setupTest(signers: {
  router: SignerWithAddress
  l2DaiGateway: SignerWithAddress
  inboxImpersonator: SignerWithAddress
  l1Escrow: SignerWithAddress
  user1: SignerWithAddress
}) {
  const l1Dai = await deploy<Dai__factory>('Dai', [])
  await l1Dai.mint(signers.user1.address, initialTotalL1Supply)

  const l2Dai = await deploy<ArbDai__factory>('ArbDai', [l1Dai.address])
  const inboxMock = await deployArbitrumContractMock('Inbox', {
    address: signers.inboxImpersonator.address,
  })

  const l1DaiGateway = await deploy<L1DaiGateway__factory>('L1DaiGateway', [
    signers.l2DaiGateway.address,
    signers.router.address,
    signers.inboxImpersonator.address,
    l1Dai.address,
    l2Dai.address,
    signers.l1Escrow.address,
  ])

  await l1Dai.connect(signers.l1Escrow).approve(l1DaiGateway.address, ethers.constants.MaxUint256)

  return {
    l1Dai,
    l2Dai,
    l1DaiGateway,
    inboxMock,
  }
}

async function setupWithdrawalTest(signers: {
  router: SignerWithAddress
  l2DaiGateway: SignerWithAddress
  inboxImpersonator: SignerWithAddress
  l1Escrow: SignerWithAddress
  user1: SignerWithAddress
  bridgeImpersonator: SignerWithAddress
  outboxImpersonator: SignerWithAddress
}) {
  const harness = await setupTest(signers)

  const bridgeMock = await deployArbitrumContractMock('Bridge', {
    address: await signers.bridgeImpersonator.getAddress(),
  })
  const outboxMock = await deployArbitrumContractMock('Outbox', {
    address: await signers.outboxImpersonator.getAddress(),
  })

  const allContracts = { ...harness, bridgeMock, outboxMock }

  allContracts.inboxMock.smocked.bridge.will.return.with(bridgeMock.address)
  allContracts.bridgeMock.smocked.activeOutbox.will.return.with(outboxMock.address)

  // move all DAI to the escrow so withdrawals work
  await allContracts.l1Dai.connect(signers.user1).transfer(signers.l1Escrow.address, initialTotalL1Supply)

  return allContracts
}
