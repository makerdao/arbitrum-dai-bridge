import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { ethers } from 'hardhat'

import { ArbDai__factory, Dai__factory, L1DaiGateway__factory, L2DaiGateway__factory } from '../../typechain'
import { assertPublicMethods, deploy, deployArbitrumContractMock } from '../helpers/helpers'

const initialTotalL1Supply = 3000
const depositAmount = 100
const defaultGas = 0
const defaultData = ethers.utils.defaultAbiCoder.encode(['bytes', 'bytes'], ['0x', '0x'])

describe('L1DaiGateway', () => {
  describe('outboundTransfer()', () => {
    it('escrows funds and sends xchain message', async () => {
      const [_deployer, inboxImpersonator, l1EscrowEOA, l2DaiGatewayEOA, routerEOA, user1] = await ethers.getSigners()
      const { l1Dai, inboxMock, l1DaiGateway } = await setupTest({
        inboxImpersonator,
        l1Escrow: l1EscrowEOA,
        l2DaiGateway: l2DaiGatewayEOA,
        router: routerEOA,
        user1: user1,
      })

      await l1Dai.connect(user1).approve(l1DaiGateway.address, depositAmount)
      const depositTx = await l1DaiGateway
        .connect(user1)
        .outboundTransfer(l1Dai.address, user1.address, depositAmount, defaultGas, 0, defaultData)
      const depositCallToMessengerCall = inboxMock.smocked.createRetryableTicket.calls[0]

      expect(await l1Dai.balanceOf(user1.address)).to.be.eq(initialTotalL1Supply - depositAmount)
      expect(await l1Dai.balanceOf(l1DaiGateway.address)).to.be.eq(0)
      expect(await l1Dai.balanceOf(l1EscrowEOA.address)).to.be.eq(depositAmount)

      const expectedDepositId = 0
      const expectedDepositXDomainCallData = new L2DaiGateway__factory().interface.encodeFunctionData(
        'finalizeInboundTransfer',
        [l1Dai.address, user1.address, user1.address, depositAmount, defaultData],
      )
      expect(depositCallToMessengerCall.destAddr).to.equal(l2DaiGatewayEOA.address)
      expect(depositCallToMessengerCall.l2CallValue).to.equal(0)
      expect(depositCallToMessengerCall.maxSubmissionCost).to.equal(0x40) //whats this?
      expect(depositCallToMessengerCall.excessFeeRefundAddress).to.equal(user1.address)
      expect(depositCallToMessengerCall.callValueRefundAddress).to.equal(user1.address)
      expect(depositCallToMessengerCall.maxGas).to.equal(defaultGas)
      expect(depositCallToMessengerCall.gasPriceBid).to.equal(0)
      expect(depositCallToMessengerCall.data).to.equal(expectedDepositXDomainCallData)
      await expect(depositTx)
        .to.emit(l1DaiGateway, 'OutboundTransferInitiated')
        .withArgs(l1Dai.address, user1.address, user1.address, expectedDepositId, depositAmount, defaultData)
      await expect(depositTx)
        .to.emit(l1DaiGateway, 'TxToL2')
        .withArgs(user1.address, l2DaiGatewayEOA.address, expectedDepositId, expectedDepositXDomainCallData)
    })

    it('escrows funds and sends xchain message for 3rd party')
    it('works with custom gas and data')
    it('reverts when called with a different token')
    it('reverts when called not by EOA')
    it('reverts when approval is too low')
    it('reverts when funds too low')
    it('reverts when bridge is closed')
  })

  describe('finalizeInboundTransfer', () => {
    const withdrawAmount = 100

    it('sends funds from the escrow', async () => {
      const defaultWithdrawData = ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [1, '0x'])

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
      const expectedTransferId = 1
      await expect(finalizeWithdrawalTx)
        .to.emit(l1DaiGateway, 'InboundTransferFinalized')
        .withArgs(l1Dai.address, user1.address, user1.address, expectedTransferId, depositAmount, defaultWithdrawData)
    })

    it('sends funds from the escrow to the 3rd party')
    // pending withdrawals MUST success even if bridge is closed
    it('completes withdrawals even when closed')
    it('reverts when called with a different token')
    it('reverts when called not by XDomainMessenger')
    it('reverts when called by XDomainMessenger but not relying message from l2DAITokenBridge')
  })

  describe('transferExitAndCall', () => {
    it('transfers exit and calls external contract')
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
