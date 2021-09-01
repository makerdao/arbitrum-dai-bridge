import {
  assertPublicMutableMethods,
  assertPublicNotMutableMethods,
  getRandomAddresses,
  simpleDeploy,
  testAuth,
} from '@makerdao/hardhat-utils'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { defaultAbiCoder, parseUnits } from 'ethers/lib/utils'
import { ethers } from 'hardhat'

import { deployArbitrumContractMock } from '../../arbitrum-helpers/mocks'
import { Dai__factory, L1DaiGateway__factory, L2DaiGateway__factory } from '../../typechain'

const initialTotalL1Supply = 3000
const errorMessages = {
  closed: 'L1DaiGateway/closed',
  tokenMismatch: 'L1DaiGateway/token-not-dai',
  callHookDataNotAllowed: 'L1DaiGateway/call-hook-data-not-allowed',
  insufficientAllowance: 'Dai/insufficient-allowance',
  insufficientFunds: 'Dai/insufficient-balance',
  l2CounterpartMismatch: 'ONLY_COUNTERPART_GATEWAY',
  notOwner: 'L1DaiGateway/not-authorized',
  inboundEscrowAndCallGuard: 'Mint can only be called by self',
  notExpectedSender: 'NOT_EXPECTED_SENDER',
  transferHookFail: 'TRANSFER_HOOK_FAIL',
  exitToNotAContract: 'TO_NOT_CONTRACT',
}

describe('L1DaiGateway', () => {
  describe('outboundTransfer()', () => {
    const depositAmount = 100
    const defaultGas = 42
    const maxSubmissionCost = 7
    const emptyCallHookData = '0x'
    const defaultEthValue = parseUnits('0.1', 'ether')
    const defaultData = defaultAbiCoder.encode(['uint256', 'bytes'], [maxSubmissionCost, emptyCallHookData])
    const notEmptyCallHookData = '0x12'
    const defaultDataWithNotEmptyCallHookData = defaultAbiCoder.encode(
      ['uint256', 'bytes'],
      [maxSubmissionCost, notEmptyCallHookData],
    )

    it('escrows funds and sends xdomain message', async () => {
      const [_deployer, inboxImpersonator, l1EscrowEOA, l2DaiGatewayEOA, routerEOA, sender] = await ethers.getSigners()
      const defaultInboxBalance = await inboxImpersonator.getBalance()
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
        .outboundTransfer(l1Dai.address, sender.address, depositAmount, defaultGas, 0, defaultData, {
          value: defaultEthValue,
        })
      const depositCallToMessengerCall = inboxMock.smocked.createRetryableTicket.calls[0]

      const expectedDepositId = 0
      const l2EncodedData = defaultAbiCoder.encode(['bytes', 'bytes'], ['0x', emptyCallHookData])
      const expectedDepositXDomainCallData = new L2DaiGateway__factory().interface.encodeFunctionData(
        'finalizeInboundTransfer',
        [l1Dai.address, sender.address, sender.address, depositAmount, l2EncodedData],
      )

      expect(await l1Dai.balanceOf(sender.address)).to.be.eq(initialTotalL1Supply - depositAmount)
      expect(await l1Dai.balanceOf(l1DaiGateway.address)).to.be.eq(0)
      expect(await l1Dai.balanceOf(l1EscrowEOA.address)).to.be.eq(depositAmount)

      expect(await inboxImpersonator.getBalance()).to.equal(defaultInboxBalance.add(defaultEthValue))
      expect(depositCallToMessengerCall.destAddr).to.equal(l2DaiGatewayEOA.address)
      expect(depositCallToMessengerCall.l2CallValue).to.equal(0)
      expect(depositCallToMessengerCall.maxSubmissionCost).to.equal(maxSubmissionCost)
      expect(depositCallToMessengerCall.excessFeeRefundAddress).to.equal(sender.address)
      expect(depositCallToMessengerCall.callValueRefundAddress).to.equal(sender.address)
      expect(depositCallToMessengerCall.maxGas).to.equal(defaultGas)
      expect(depositCallToMessengerCall.gasPriceBid).to.equal(0)
      expect(depositCallToMessengerCall.data).to.equal(expectedDepositXDomainCallData)

      await expect(depositTx)
        .to.emit(l1DaiGateway, 'DepositInitiated')
        .withArgs(l1Dai.address, sender.address, sender.address, expectedDepositId, depositAmount)
      await expect(depositTx)
        .to.emit(l1DaiGateway, 'TxToL2')
        .withArgs(sender.address, l2DaiGatewayEOA.address, expectedDepositId, expectedDepositXDomainCallData)
    })

    it('escrows funds and sends xdomain message for 3rd party', async () => {
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
      const l2EncodedData = defaultAbiCoder.encode(['bytes', 'bytes'], ['0x', emptyCallHookData])
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
        .to.emit(l1DaiGateway, 'DepositInitiated')
        .withArgs(l1Dai.address, sender.address, receiver.address, expectedDepositId, depositAmount)
      await expect(depositTx)
        .to.emit(l1DaiGateway, 'TxToL2')
        .withArgs(sender.address, l2DaiGatewayEOA.address, expectedDepositId, expectedDepositXDomainCallData)
    })

    it('decodes data correctly when called via router', async () => {
      const [_deployer, inboxImpersonator, l1EscrowEOA, l2DaiGatewayEOA, routerEOA, sender] = await ethers.getSigners()
      const { l1Dai, inboxMock, l1DaiGateway } = await setupTest({
        inboxImpersonator,
        l1Escrow: l1EscrowEOA,
        l2DaiGateway: l2DaiGatewayEOA,
        router: routerEOA,
        user1: sender,
      })
      const routerEncodedData = defaultAbiCoder.encode(['address', 'bytes'], [sender.address, defaultData])

      await l1Dai.connect(sender).approve(l1DaiGateway.address, depositAmount)
      const depositTx = await l1DaiGateway
        .connect(routerEOA)
        .outboundTransfer(l1Dai.address, sender.address, depositAmount, defaultGas, 0, routerEncodedData)
      const depositCallToMessengerCall = inboxMock.smocked.createRetryableTicket.calls[0]

      const expectedDepositId = 0
      const l2EncodedData = defaultAbiCoder.encode(['bytes', 'bytes'], ['0x', emptyCallHookData])
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
        .to.emit(l1DaiGateway, 'DepositInitiated')
        .withArgs(l1Dai.address, sender.address, sender.address, expectedDepositId, depositAmount)
      await expect(depositTx)
        .to.emit(l1DaiGateway, 'TxToL2')
        .withArgs(sender.address, l2DaiGatewayEOA.address, expectedDepositId, expectedDepositXDomainCallData)
    })

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
      ).to.be.revertedWith(errorMessages.tokenMismatch)
    })

    it('reverts when called with hook calldata', async () => {
      const [_deployer, inboxImpersonator, l1EscrowEOA, l2DaiGatewayEOA, routerEOA, sender] = await ethers.getSigners()
      const { l1Dai, l1DaiGateway } = await setupTest({
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
          .outboundTransfer(
            l1Dai.address,
            sender.address,
            depositAmount,
            defaultGas,
            0,
            defaultDataWithNotEmptyCallHookData,
          ),
      ).to.be.revertedWith(errorMessages.callHookDataNotAllowed)
    })

    it('reverts when approval is too low', async () => {
      const [_deployer, inboxImpersonator, l1EscrowEOA, l2DaiGatewayEOA, routerEOA, sender, receiver] =
        await ethers.getSigners()
      const { l1Dai, l1DaiGateway } = await setupTest({
        inboxImpersonator,
        l1Escrow: l1EscrowEOA,
        l2DaiGateway: l2DaiGatewayEOA,
        router: routerEOA,
        user1: sender,
      })

      await expect(
        l1DaiGateway
          .connect(sender)
          .outboundTransfer(l1Dai.address, receiver.address, depositAmount, defaultGas, 0, defaultData),
      ).to.be.revertedWith(errorMessages.insufficientAllowance)
    })

    it('reverts when funds too low', async () => {
      const [_deployer, inboxImpersonator, l1EscrowEOA, l2DaiGatewayEOA, routerEOA, user1, sender, receiver] =
        await ethers.getSigners()
      const { l1Dai, l1DaiGateway } = await setupTest({
        inboxImpersonator,
        l1Escrow: l1EscrowEOA,
        l2DaiGateway: l2DaiGatewayEOA,
        router: routerEOA,
        user1,
      })

      await l1Dai.connect(sender).approve(l1DaiGateway.address, depositAmount)
      await expect(
        l1DaiGateway
          .connect(sender)
          .outboundTransfer(l1Dai.address, receiver.address, depositAmount, defaultGas, 0, defaultData),
      ).to.be.revertedWith(errorMessages.insufficientFunds)
    })

    it('reverts when bridge is closed', async () => {
      const [deployer, inboxImpersonator, l1EscrowEOA, l2DaiGatewayEOA, routerEOA, sender, receiver] =
        await ethers.getSigners()
      const { l1Dai, l1DaiGateway } = await setupTest({
        inboxImpersonator,
        l1Escrow: l1EscrowEOA,
        l2DaiGateway: l2DaiGatewayEOA,
        router: routerEOA,
        user1: sender,
      })

      await l1DaiGateway.connect(deployer).close()

      await l1Dai.connect(sender).approve(l1DaiGateway.address, depositAmount)
      await expect(
        l1DaiGateway
          .connect(sender)
          .outboundTransfer(l1Dai.address, receiver.address, depositAmount, defaultGas, 0, defaultData),
      ).to.revertedWith(errorMessages.closed)
    })
  })

  describe('finalizeInboundTransfer', () => {
    const withdrawAmount = 100
    const expectedTransferId = 1
    const defaultWithdrawData = ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [expectedTransferId, '0x'])

    it('sends funds from the escrow', async () => {
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
        .connect(bridgeImpersonator)
        .finalizeInboundTransfer(l1Dai.address, user1.address, user1.address, withdrawAmount, defaultWithdrawData)

      expect(await l1Dai.balanceOf(user1.address)).to.be.equal(withdrawAmount)
      expect(await l1Dai.balanceOf(l1EscrowEOA.address)).to.be.equal(initialTotalL1Supply - withdrawAmount)
      await expect(finalizeWithdrawalTx)
        .to.emit(l1DaiGateway, 'WithdrawalFinalized')
        .withArgs(l1Dai.address, user1.address, user1.address, expectedTransferId, withdrawAmount)
      //   await expect(finalizeWithdrawalTx).not.to.emit(l1DaiGateway, 'TransferAndCallTriggered')
    })

    it('sends funds from the escrow to the 3rd party', async () => {
      const [
        _deployer,
        inboxImpersonator,
        l1EscrowEOA,
        l2DaiGatewayEOA,
        routerEOA,
        bridgeImpersonator,
        outboxImpersonator,
        sender,
        receiver,
      ] = await ethers.getSigners()
      const { l1Dai, outboxMock, l1DaiGateway } = await setupWithdrawalTest({
        inboxImpersonator,
        l1Escrow: l1EscrowEOA,
        l2DaiGateway: l2DaiGatewayEOA,
        router: routerEOA,
        user1: sender,
        bridgeImpersonator,
        outboxImpersonator,
      })
      outboxMock.smocked.l2ToL1Sender.will.return.with(() => l2DaiGatewayEOA.address)

      const finalizeWithdrawalTx = await l1DaiGateway
        .connect(bridgeImpersonator)
        .finalizeInboundTransfer(l1Dai.address, sender.address, receiver.address, withdrawAmount, defaultWithdrawData)

      expect(await l1Dai.balanceOf(sender.address)).to.be.equal(0)
      expect(await l1Dai.balanceOf(receiver.address)).to.be.equal(withdrawAmount)
      expect(await l1Dai.balanceOf(l1EscrowEOA.address)).to.be.equal(initialTotalL1Supply - withdrawAmount)
      await expect(finalizeWithdrawalTx)
        .to.emit(l1DaiGateway, 'WithdrawalFinalized')
        .withArgs(l1Dai.address, sender.address, receiver.address, expectedTransferId, withdrawAmount)
      //   await expect(finalizeWithdrawalTx).not.to.emit(l1DaiGateway, 'TransferAndCallTriggered')
    })

    // todo: test revert when calldata !=  0

    describe.skip('[SKIP BUG] calls receiver contract', () => {
      const callHookData = ethers.utils.defaultAbiCoder.encode(['uint256'], [42])
      const defaultWithdrawData = ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'bytes'],
        [expectedTransferId, callHookData],
      )

      it('calls receiver contract when callHookData is present', async () => {
        const [
          _deployer,
          inboxImpersonator,
          l1EscrowEOA,
          l2DaiGatewayEOA,
          routerEOA,
          bridgeImpersonator,
          outboxImpersonator,
          sender,
        ] = await ethers.getSigners()
        const { l1Dai, outboxMock, l1DaiGateway } = await setupWithdrawalTest({
          inboxImpersonator,
          l1Escrow: l1EscrowEOA,
          l2DaiGateway: l2DaiGatewayEOA,
          router: routerEOA,
          user1: sender,
          bridgeImpersonator,
          outboxImpersonator,
        })
        outboxMock.smocked.l2ToL1Sender.will.return.with(() => l2DaiGatewayEOA.address)
        const receiverMock = await deployArbitrumContractMock('IERC677Receiver')
        receiverMock.smocked.onTokenTransfer.will.return.with()

        const finalizeWithdrawalTx = await l1DaiGateway
          .connect(outboxImpersonator)
          .finalizeInboundTransfer(
            l1Dai.address,
            sender.address,
            receiverMock.address,
            withdrawAmount,
            defaultWithdrawData,
          )
        const onWithdrawalMessengerCall = receiverMock.smocked.onTokenTransfer.calls[0]

        expect(await l1Dai.balanceOf(sender.address)).to.be.equal(0)
        expect(await l1Dai.balanceOf(receiverMock.address)).to.be.equal(withdrawAmount)
        expect(await l1Dai.balanceOf(l1EscrowEOA.address)).to.be.equal(initialTotalL1Supply - withdrawAmount)
        expect(onWithdrawalMessengerCall._sender).to.be.eq(sender.address)
        expect(onWithdrawalMessengerCall._value).to.be.eq(withdrawAmount)
        expect(onWithdrawalMessengerCall.data).to.be.eq(callHookData)
        await expect(finalizeWithdrawalTx)
          .to.emit(l1DaiGateway, 'WithdrawalFinalized')
          .withArgs(l1Dai.address, sender.address, receiverMock.address, expectedTransferId, withdrawAmount)
        await expect(finalizeWithdrawalTx)
          .to.emit(l1DaiGateway, 'TransferAndCallTriggered')
          .withArgs(true, sender.address, receiverMock.address, withdrawAmount, callHookData)
      })

      it('doesnt revert when receiver contract return false')
      it('doesnt revert when receiver contract reverts')
      it('reverts when receiver address is not a contract')
    })

    // pending withdrawals MUST success even if bridge is closed
    it('completes withdrawals even when closed', async () => {
      const [
        deployer,
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
      await l1DaiGateway.connect(deployer).close()

      const finalizeWithdrawalTx = await l1DaiGateway
        .connect(bridgeImpersonator)
        .finalizeInboundTransfer(l1Dai.address, user1.address, user1.address, withdrawAmount, defaultWithdrawData)

      expect(await l1Dai.balanceOf(user1.address)).to.be.equal(withdrawAmount)
      expect(await l1Dai.balanceOf(l1EscrowEOA.address)).to.be.equal(initialTotalL1Supply - withdrawAmount)
      await expect(finalizeWithdrawalTx)
        .to.emit(l1DaiGateway, 'WithdrawalFinalized')
        .withArgs(l1Dai.address, user1.address, user1.address, expectedTransferId, withdrawAmount)
    })

    // this is not easy to implement in the current implementation
    it.skip('[SKIP BUG] reverts when called with a different token', async () => {
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
      const { l2Dai, outboxMock, l1DaiGateway } = await setupWithdrawalTest({
        inboxImpersonator,
        l1Escrow: l1EscrowEOA,
        l2DaiGateway: l2DaiGatewayEOA,
        router: routerEOA,
        user1,
        bridgeImpersonator,
        outboxImpersonator,
      })
      outboxMock.smocked.l2ToL1Sender.will.return.with(() => l2DaiGatewayEOA.address)

      // this should revert
      await l1DaiGateway
        .connect(bridgeImpersonator)
        .finalizeInboundTransfer(l2Dai.address, user1.address, user1.address, withdrawAmount, defaultWithdrawData)
    })

    it.skip('[SKIP BUG] reverts when called not by the outbox', async () => {
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

      await expect(
        l1DaiGateway.finalizeInboundTransfer(
          l1Dai.address,
          user1.address,
          user1.address,
          withdrawAmount,
          defaultWithdrawData,
        ),
      ).to.be.revertedWith('wrong caller!')
    })

    it('reverts when called by the outbox but not relying message from l2 counterpart', async () => {
      const [
        _deployer,
        inboxImpersonator,
        l1EscrowEOA,
        l2DaiGatewayEOA,
        routerEOA,
        bridgeImpersonator,
        outboxImpersonator,
        user1,
        user2,
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
      outboxMock.smocked.l2ToL1Sender.will.return.with(() => user2.address)

      await expect(
        l1DaiGateway
          .connect(bridgeImpersonator)
          .finalizeInboundTransfer(l1Dai.address, user1.address, user1.address, withdrawAmount, defaultWithdrawData),
      ).to.be.revertedWith(errorMessages.l2CounterpartMismatch)
    })
  })

  describe.skip('transferExitAndCall', () => {
    // const withdrawAmount = 100
    // const expectedTransferId = 1
    // const defaultWithdrawData = ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [expectedTransferId, '0x'])
    // it('transfers exit and calls external contract', async () => {
    //   const [
    //     _deployer,
    //     inboxImpersonator,
    //     l1EscrowEOA,
    //     l2DaiGatewayEOA,
    //     routerEOA,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //     user1,
    //   ] = await ethers.getSigners()
    //   const { l1Dai, outboxMock, l1DaiGateway } = await setupWithdrawalTest({
    //     inboxImpersonator,
    //     l1Escrow: l1EscrowEOA,
    //     l2DaiGateway: l2DaiGatewayEOA,
    //     router: routerEOA,
    //     user1,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //   })
    //   const exitReceiverMock = await deployArbitrumContractMock('ITradeableExitReceiver')
    //   exitReceiverMock.smocked.onExitTransfer.will.return.with(true)
    //   const transferExitTx = await l1DaiGateway
    //     .connect(user1)
    //     .transferExitAndCall(
    //       expectedTransferId,
    //       user1.address,
    //       exitReceiverMock.address,
    //       defaultWithdrawData,
    //       defaultWithdrawData,
    //     )
    //   const onExitTransferMessengerCall = exitReceiverMock.smocked.onExitTransfer.calls[0]
    //   expect(onExitTransferMessengerCall.exitNum).to.be.eq(expectedTransferId)
    //   expect(onExitTransferMessengerCall.sender).to.be.eq(user1.address)
    //   expect(onExitTransferMessengerCall.data).to.be.eq(defaultWithdrawData)
    //   await expect(transferExitTx)
    //     .to.emit(l1DaiGateway, 'WithdrawRedirected')
    //     .withArgs(
    //       user1.address,
    //       exitReceiverMock.address,
    //       expectedTransferId,
    //       defaultWithdrawData,
    //       defaultWithdrawData,
    //       true,
    //     )
    //   outboxMock.smocked.l2ToL1Sender.will.return.with(() => l2DaiGatewayEOA.address)
    //   // it should withdraw funds not to user1 but to exitReceiverMock
    //   await l1DaiGateway
    //     .connect(bridgeImpersonator)
    //     .finalizeInboundTransfer(l1Dai.address, user1.address, user1.address, withdrawAmount, defaultWithdrawData)
    //   expect(await l1Dai.balanceOf(user1.address)).to.be.equal(0)
    //   expect(await l1Dai.balanceOf(exitReceiverMock.address)).to.be.equal(withdrawAmount)
    //   expect(await l1Dai.balanceOf(l1EscrowEOA.address)).to.be.equal(initialTotalL1Supply - withdrawAmount)
    // })
    // it('transfers exit and calls external contract when closed', async () => {
    //   const [
    //     _deployer,
    //     inboxImpersonator,
    //     l1EscrowEOA,
    //     l2DaiGatewayEOA,
    //     routerEOA,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //     user1,
    //   ] = await ethers.getSigners()
    //   const { l1Dai, outboxMock, l1DaiGateway } = await setupWithdrawalTest({
    //     inboxImpersonator,
    //     l1Escrow: l1EscrowEOA,
    //     l2DaiGateway: l2DaiGatewayEOA,
    //     router: routerEOA,
    //     user1,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //   })
    //   const exitReceiverMock = await deployArbitrumContractMock('ITradeableExitReceiver')
    //   exitReceiverMock.smocked.onExitTransfer.will.return.with(true)
    //   await l1DaiGateway.close()
    //   const transferExitTx = await l1DaiGateway
    //     .connect(user1)
    //     .transferExitAndCall(
    //       expectedTransferId,
    //       user1.address,
    //       exitReceiverMock.address,
    //       defaultWithdrawData,
    //       defaultWithdrawData,
    //     )
    //   const onExitTransferMessengerCall = exitReceiverMock.smocked.onExitTransfer.calls[0]
    //   expect(onExitTransferMessengerCall.exitNum).to.be.eq(expectedTransferId)
    //   expect(onExitTransferMessengerCall.sender).to.be.eq(user1.address)
    //   expect(onExitTransferMessengerCall.data).to.be.eq(defaultWithdrawData)
    //   await expect(transferExitTx)
    //     .to.emit(l1DaiGateway, 'WithdrawRedirected')
    //     .withArgs(
    //       user1.address,
    //       exitReceiverMock.address,
    //       expectedTransferId,
    //       defaultWithdrawData,
    //       defaultWithdrawData,
    //       true,
    //     )
    //   outboxMock.smocked.l2ToL1Sender.will.return.with(() => l2DaiGatewayEOA.address)
    //   // it should withdraw funds not to user1 but to exitReceiverMock
    //   await l1DaiGateway
    //     .connect(bridgeImpersonator)
    //     .finalizeInboundTransfer(l1Dai.address, user1.address, user1.address, withdrawAmount, defaultWithdrawData)
    //   expect(await l1Dai.balanceOf(user1.address)).to.be.equal(0)
    //   expect(await l1Dai.balanceOf(exitReceiverMock.address)).to.be.equal(withdrawAmount)
    //   expect(await l1Dai.balanceOf(l1EscrowEOA.address)).to.be.equal(initialTotalL1Supply - withdrawAmount)
    // })
    // it('transfers exit and calls external contract when withdrawing', async () => {
    //   const [
    //     _deployer,
    //     inboxImpersonator,
    //     l1EscrowEOA,
    //     l2DaiGatewayEOA,
    //     routerEOA,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //     user1,
    //   ] = await ethers.getSigners()
    //   const { l1Dai, outboxMock, l1DaiGateway } = await setupWithdrawalTest({
    //     inboxImpersonator,
    //     l1Escrow: l1EscrowEOA,
    //     l2DaiGateway: l2DaiGatewayEOA,
    //     router: routerEOA,
    //     user1,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //   })
    //   const exitReceiverMock = await deployArbitrumContractMock('IERC677ReceiverAndExitReceiver')
    //   exitReceiverMock.smocked.onExitTransfer.will.return.with(true)
    //   const callHookData = ethers.utils.defaultAbiCoder.encode(['uint256'], [42])
    //   const transferExitTx = await l1DaiGateway
    //     .connect(user1)
    //     .transferExitAndCall(
    //       expectedTransferId,
    //       user1.address,
    //       exitReceiverMock.address,
    //       callHookData,
    //       defaultWithdrawData,
    //     )
    //   const onExitTransferMessengerCall = exitReceiverMock.smocked.onExitTransfer.calls[0]
    //   exitReceiverMock.smocked.onTokenTransfer.will.return.with()
    //   expect(onExitTransferMessengerCall.exitNum).to.be.eq(expectedTransferId)
    //   expect(onExitTransferMessengerCall.sender).to.be.eq(user1.address)
    //   expect(onExitTransferMessengerCall.data).to.be.eq(defaultWithdrawData)
    //   await expect(transferExitTx)
    //     .to.emit(l1DaiGateway, 'WithdrawRedirected')
    //     .withArgs(user1.address, exitReceiverMock.address, expectedTransferId, callHookData, defaultWithdrawData, true)
    //   outboxMock.smocked.l2ToL1Sender.will.return.with(() => l2DaiGatewayEOA.address)
    //   // it should withdraw funds not to user1 but to exitReceiverMock and should call onTokenTransfer
    //   const finalizeWithdrawalTx = await l1DaiGateway
    //     .connect(bridgeImpersonator)
    //     .finalizeInboundTransfer(l1Dai.address, user1.address, user1.address, withdrawAmount, defaultWithdrawData)
    //   const onWithdrawalMessengerCall = exitReceiverMock.smocked.onTokenTransfer.calls[0]
    //   await expect(finalizeWithdrawalTx)
    //     .to.emit(l1DaiGateway, 'TransferAndCallTriggered')
    //     .withArgs(true, user1.address, exitReceiverMock.address, withdrawAmount, callHookData)
    //   expect(await onWithdrawalMessengerCall._sender).to.be.eq(user1.address)
    //   expect(await onWithdrawalMessengerCall._value).to.be.eq(withdrawAmount)
    //   expect(await onWithdrawalMessengerCall.data).to.be.eq(callHookData)
    //   expect(await l1Dai.balanceOf(user1.address)).to.be.equal(0)
    //   expect(await l1Dai.balanceOf(exitReceiverMock.address)).to.be.equal(withdrawAmount)
    //   expect(await l1Dai.balanceOf(l1EscrowEOA.address)).to.be.equal(initialTotalL1Supply - withdrawAmount)
    // })
    // it('reverts when not expected sender called', async () => {
    //   const [
    //     _deployer,
    //     inboxImpersonator,
    //     l1EscrowEOA,
    //     l2DaiGatewayEOA,
    //     routerEOA,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //     user1,
    //     user2,
    //   ] = await ethers.getSigners()
    //   const { l1DaiGateway } = await setupWithdrawalTest({
    //     inboxImpersonator,
    //     l1Escrow: l1EscrowEOA,
    //     l2DaiGateway: l2DaiGatewayEOA,
    //     router: routerEOA,
    //     user1,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //   })
    //   const exitReceiverMock = await deployArbitrumContractMock('ITradeableExitReceiver')
    //   exitReceiverMock.smocked.onExitTransfer.will.return.with(true)
    //   await expect(
    //     l1DaiGateway
    //       .connect(user2)
    //       .transferExitAndCall(
    //         expectedTransferId,
    //         user1.address,
    //         exitReceiverMock.address,
    //         defaultWithdrawData,
    //         defaultWithdrawData,
    //       ),
    //   ).to.be.revertedWith(errorMessages.notExpectedSender)
    // })
    // it('works allows for multiple redirection of exits', async () => {
    //   const [
    //     _deployer,
    //     inboxImpersonator,
    //     l1EscrowEOA,
    //     l2DaiGatewayEOA,
    //     routerEOA,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //     user1,
    //     exitReceiverMockImpersonator,
    //   ] = await ethers.getSigners()
    //   const { l1Dai, outboxMock, l1DaiGateway } = await setupWithdrawalTest({
    //     inboxImpersonator,
    //     l1Escrow: l1EscrowEOA,
    //     l2DaiGateway: l2DaiGatewayEOA,
    //     router: routerEOA,
    //     user1,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //   })
    //   const exitReceiverMock = await deployArbitrumContractMock('ITradeableExitReceiver', {
    //     address: exitReceiverMockImpersonator.address,
    //   })
    //   exitReceiverMock.smocked.onExitTransfer.will.return.with(true)
    //   const exitReceiverMock2 = await deployArbitrumContractMock('ITradeableExitReceiver')
    //   exitReceiverMock2.smocked.onExitTransfer.will.return.with(true)
    //   // first redirect
    //   {
    //     const transferExitTx = await l1DaiGateway
    //       .connect(user1)
    //       .transferExitAndCall(
    //         expectedTransferId,
    //         user1.address,
    //         exitReceiverMock.address,
    //         defaultWithdrawData,
    //         defaultWithdrawData,
    //       )
    //     const onExitTransferMessengerCall = exitReceiverMock.smocked.onExitTransfer.calls[0]
    //     expect(onExitTransferMessengerCall.exitNum).to.be.eq(expectedTransferId)
    //     expect(onExitTransferMessengerCall.sender).to.be.eq(user1.address)
    //     expect(onExitTransferMessengerCall.data).to.be.eq(defaultWithdrawData)
    //     await expect(transferExitTx)
    //       .to.emit(l1DaiGateway, 'WithdrawRedirected')
    //       .withArgs(
    //         user1.address,
    //         exitReceiverMock.address,
    //         expectedTransferId,
    //         defaultWithdrawData,
    //         defaultWithdrawData,
    //         true,
    //       )
    //   }
    //   // second redirect
    //   {
    //     const transferExitTx2 = await l1DaiGateway
    //       .connect(exitReceiverMockImpersonator)
    //       .transferExitAndCall(
    //         expectedTransferId,
    //         user1.address,
    //         exitReceiverMock2.address,
    //         defaultWithdrawData,
    //         defaultWithdrawData,
    //       )
    //     const onExitTransferMessengerCall2 = exitReceiverMock2.smocked.onExitTransfer.calls[0]
    //     expect(onExitTransferMessengerCall2.exitNum).to.be.eq(expectedTransferId)
    //     expect(onExitTransferMessengerCall2.sender).to.be.eq(exitReceiverMockImpersonator.address)
    //     expect(onExitTransferMessengerCall2.data).to.be.eq(defaultWithdrawData)
    //     await expect(transferExitTx2)
    //       .to.emit(l1DaiGateway, 'WithdrawRedirected')
    //       .withArgs(
    //         exitReceiverMock.address,
    //         exitReceiverMock2.address,
    //         expectedTransferId,
    //         defaultWithdrawData,
    //         defaultWithdrawData,
    //         true,
    //       )
    //   }
    //   outboxMock.smocked.l2ToL1Sender.will.return.with(() => l2DaiGatewayEOA.address)
    //   // it should withdraw funds not to user1 but to exitReceiverMock2
    //   await l1DaiGateway
    //     .connect(bridgeImpersonator)
    //     .finalizeInboundTransfer(l1Dai.address, user1.address, user1.address, withdrawAmount, defaultWithdrawData)
    //   expect(await l1Dai.balanceOf(user1.address)).to.be.equal(0)
    //   expect(await l1Dai.balanceOf(exitReceiverMock.address)).to.be.equal(0)
    //   expect(await l1Dai.balanceOf(exitReceiverMock2.address)).to.be.equal(withdrawAmount)
    //   expect(await l1Dai.balanceOf(l1EscrowEOA.address)).to.be.equal(initialTotalL1Supply - withdrawAmount)
    // })
    // it.skip('[SKIP TO IMPLEMENT] reverts when exitReceiver reverts', async () => {
    //   // likely a smock bug
    //   const [
    //     _deployer,
    //     inboxImpersonator,
    //     l1EscrowEOA,
    //     l2DaiGatewayEOA,
    //     routerEOA,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //     user1,
    //   ] = await ethers.getSigners()
    //   const { l1DaiGateway } = await setupWithdrawalTest({
    //     inboxImpersonator,
    //     l1Escrow: l1EscrowEOA,
    //     l2DaiGateway: l2DaiGatewayEOA,
    //     router: routerEOA,
    //     user1,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //   })
    //   const exitReceiverMock = await deployArbitrumContractMock('ITradeableExitReceiver')
    //   exitReceiverMock.smocked.onExitTransfer.will.revert.with('mock_reverted')
    //   await expect(
    //     l1DaiGateway
    //       .connect(user1)
    //       .transferExitAndCall(
    //         expectedTransferId,
    //         user1.address,
    //         exitReceiverMock.address,
    //         defaultWithdrawData,
    //         defaultWithdrawData,
    //       ),
    //   ).to.be.revertedWith('mock_reverted')
    // })
    // it('reverts when exitReceiver returns false', async () => {
    //   const [
    //     _deployer,
    //     inboxImpersonator,
    //     l1EscrowEOA,
    //     l2DaiGatewayEOA,
    //     routerEOA,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //     user1,
    //   ] = await ethers.getSigners()
    //   const { l1DaiGateway } = await setupWithdrawalTest({
    //     inboxImpersonator,
    //     l1Escrow: l1EscrowEOA,
    //     l2DaiGateway: l2DaiGatewayEOA,
    //     router: routerEOA,
    //     user1,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //   })
    //   const exitReceiverMock = await deployArbitrumContractMock('ITradeableExitReceiver')
    //   exitReceiverMock.smocked.onExitTransfer.will.return.with(false)
    //   await expect(
    //     l1DaiGateway
    //       .connect(user1)
    //       .transferExitAndCall(
    //         expectedTransferId,
    //         user1.address,
    //         exitReceiverMock.address,
    //         defaultWithdrawData,
    //         defaultWithdrawData,
    //       ),
    //   ).to.be.revertedWith(errorMessages.transferHookFail)
    // })
    // it('reverts when exitReceiver is not a contract', async () => {
    //   const [
    //     _deployer,
    //     inboxImpersonator,
    //     l1EscrowEOA,
    //     l2DaiGatewayEOA,
    //     routerEOA,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //     user1,
    //   ] = await ethers.getSigners()
    //   const [exitReceiverEOA] = await getRandomAddresses()
    //   const { l1DaiGateway } = await setupWithdrawalTest({
    //     inboxImpersonator,
    //     l1Escrow: l1EscrowEOA,
    //     l2DaiGateway: l2DaiGatewayEOA,
    //     router: routerEOA,
    //     user1,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //   })
    //   await expect(
    //     l1DaiGateway
    //       .connect(user1)
    //       .transferExitAndCall(
    //         expectedTransferId,
    //         user1.address,
    //         exitReceiverEOA,
    //         defaultWithdrawData,
    //         defaultWithdrawData,
    //       ),
    //   ).to.be.revertedWith(errorMessages.exitToNotAContract)
    // })
    // it('reverts when trying to exit twice', async () => {
    //   const [
    //     _deployer,
    //     inboxImpersonator,
    //     l1EscrowEOA,
    //     l2DaiGatewayEOA,
    //     routerEOA,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //     user1,
    //   ] = await ethers.getSigners()
    //   const { l1DaiGateway } = await setupWithdrawalTest({
    //     inboxImpersonator,
    //     l1Escrow: l1EscrowEOA,
    //     l2DaiGateway: l2DaiGatewayEOA,
    //     router: routerEOA,
    //     user1,
    //     bridgeImpersonator,
    //     outboxImpersonator,
    //   })
    //   const exitReceiverMock = await deployArbitrumContractMock('ITradeableExitReceiver')
    //   exitReceiverMock.smocked.onExitTransfer.will.return.with(true)
    //   const exitReceiverMock2 = await deployArbitrumContractMock('ITradeableExitReceiver')
    //   exitReceiverMock2.smocked.onExitTransfer.will.return.with(true)
    //   await l1DaiGateway
    //     .connect(user1)
    //     .transferExitAndCall(
    //       expectedTransferId,
    //       user1.address,
    //       exitReceiverMock.address,
    //       defaultWithdrawData,
    //       defaultWithdrawData,
    //     )
    //   await expect(
    //     l1DaiGateway
    //       .connect(user1)
    //       .transferExitAndCall(
    //         expectedTransferId,
    //         user1.address,
    //         exitReceiverMock2.address,
    //         defaultWithdrawData,
    //         defaultWithdrawData,
    //       ),
    //   ).to.be.revertedWith(errorMessages.notExpectedSender)
    // })
  })

  describe('close()', () => {
    it('can be called by owner', async () => {
      const [owner, inboxImpersonator, l1EscrowEOA, l2DaiGatewayEOA, routerEOA, user1] = await ethers.getSigners()
      const { l1DaiGateway } = await setupTest({
        inboxImpersonator,
        l1Escrow: l1EscrowEOA,
        l2DaiGateway: l2DaiGatewayEOA,
        router: routerEOA,
        user1,
      })

      expect(await l1DaiGateway.isOpen()).to.be.eq(1)
      const closeTx = await l1DaiGateway.connect(owner).close()

      await expect(closeTx).to.emit(l1DaiGateway, 'Closed')

      expect(await l1DaiGateway.isOpen()).to.be.eq(0)
    })

    it('can be called multiple times by the owner but nothing changes', async () => {
      const [owner, inboxImpersonator, l1EscrowEOA, l2DaiGatewayEOA, routerEOA, user1] = await ethers.getSigners()
      const { l1DaiGateway } = await setupTest({
        inboxImpersonator,
        l1Escrow: l1EscrowEOA,
        l2DaiGateway: l2DaiGatewayEOA,
        router: routerEOA,
        user1,
      })

      await l1DaiGateway.connect(owner).close()
      expect(await l1DaiGateway.isOpen()).to.be.eq(0)

      await l1DaiGateway.connect(owner).close()
      expect(await l1DaiGateway.isOpen()).to.be.eq(0)
    })

    it('reverts when called not by the owner', async () => {
      const [_deployer, inboxImpersonator, l1EscrowEOA, l2DaiGatewayEOA, routerEOA, user1] = await ethers.getSigners()
      const { l1DaiGateway } = await setupTest({
        inboxImpersonator,
        l1Escrow: l1EscrowEOA,
        l2DaiGateway: l2DaiGatewayEOA,
        router: routerEOA,
        user1,
      })

      await expect(l1DaiGateway.connect(user1).close()).to.be.revertedWith(errorMessages.notOwner)
    })
  })

  describe('constructor', () => {
    it('assigns all variables properly', async () => {
      const [l2DaiGateway, l1Router, inbox, l1Dai, l2Dai, l1Escrow] = await getRandomAddresses()

      const l1DaiGateway = await simpleDeploy<L1DaiGateway__factory>('L1DaiGateway', [
        l2DaiGateway,
        l1Router,
        inbox,
        l1Dai,
        l2Dai,
        l1Escrow,
      ])

      expect(await l1DaiGateway.l2Counterpart()).to.be.eq(l2DaiGateway)
      expect(await l1DaiGateway.l1Router()).to.be.eq(l1Router)
      expect(await l1DaiGateway.inbox()).to.be.eq(inbox)
      expect(await l1DaiGateway.l1Dai()).to.be.eq(l1Dai)
      expect(await l1DaiGateway.l2Dai()).to.be.eq(l2Dai)
      expect(await l1DaiGateway.l1Escrow()).to.be.eq(l1Escrow)
      expect(await l1DaiGateway.isOpen()).to.be.eq(1)
    })
  })

  describe.skip('inboundEscrowAndCall', () => {
    // it("can't be called by anyone", async () => {
    //   const [_deployer, inboxImpersonator, l1EscrowEOA, l2DaiGatewayEOA, routerEOA, user1, user2] =
    //     await ethers.getSigners()
    //   const { l1DaiGateway } = await setupTest({
    //     inboxImpersonator,
    //     l1Escrow: l1EscrowEOA,
    //     l2DaiGateway: l2DaiGatewayEOA,
    //     router: routerEOA,
    //     user1,
    //   })
    //   await expect(
    //     l1DaiGateway.inboundEscrowAndCall(user2.address, 100, user2.address, user2.address, '0x'),
    //   ).to.be.revertedWith(errorMessages.inboundEscrowAndCallGuard)
    // })
  })

  it('has correct public interface', async () => {
    await assertPublicMutableMethods('L1DaiGateway', [
      'finalizeInboundTransfer(address,address,address,uint256,bytes)', // withdraw
      'outboundTransfer(address,address,uint256,uint256,uint256,bytes)', // deposit
      'close()',
      'deny(address)',
      'rely(address)',
    ])

    await assertPublicNotMutableMethods('L1DaiGateway', [
      'getOutboundCalldata(address,address,address,uint256,bytes)',

      // storage variables:
      'inbox()',
      'isOpen()',
      'l1Dai()',
      'l1Escrow()',
      'l1Router()',
      'l2Counterpart()',
      'l2Dai()',
      'wards(address)',
    ])
  })

  testAuth({
    name: 'L1DaiGateway',
    getDeployArgs: async () => {
      const [l2Counterpart, l1Router, inbox, l1Dai, l2Dai, l1Escrow] = await getRandomAddresses()

      return [l2Counterpart, l1Router, inbox, l1Dai, l2Dai, l1Escrow]
    },
    authedMethods: [(c) => c.close()],
  })
})

async function setupTest(signers: {
  router: SignerWithAddress
  l2DaiGateway: SignerWithAddress
  inboxImpersonator: SignerWithAddress
  l1Escrow: SignerWithAddress
  user1: SignerWithAddress
}) {
  const l1Dai = await simpleDeploy<Dai__factory>('Dai', [])
  await l1Dai.mint(signers.user1.address, initialTotalL1Supply)

  const l2Dai = await simpleDeploy<Dai__factory>('Dai', [])
  const inboxMock = await deployArbitrumContractMock('Inbox', {
    address: signers.inboxImpersonator.address,
  })

  const l1DaiGateway = await simpleDeploy<L1DaiGateway__factory>('L1DaiGateway', [
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
