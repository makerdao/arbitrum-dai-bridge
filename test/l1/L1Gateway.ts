import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers } from 'hardhat'

import { Dai__factory, L1Escrow__factory, L1Gateway__factory } from '../../typechain'
import { deploy, deployArbitrumContractMock, deployMock, getRandomAddresses, ZERO_ADDRESS } from '../helpers'

const initialTotalL1Supply = 3000
const depositAmount = 100

const errorMessages = {
  alreadyInitialized: 'L1Gateway/already initialized',
  notSupported: 'L1Gateway/not-supported',
  invalidMessenger: 'OVM_XCHAIN: messenger contract unauthenticated',
  invalidXDomainMessageOriginator: 'OVM_XCHAIN: wrong sender of cross-domain message',
  bridgeClosed: 'L1Gateway/closed',
  notOwner: 'L1Gateway/not-authorized',
  daiInsufficientAllowance: 'Dai/insufficient-allowance',
  daiInsufficientBalance: 'Dai/insufficient-balance',
}

describe('L1Gateway', () => {
  describe('constructor', () => {
    it('initializes all variables', async () => {
      const [inbox, escrow, l1DAI, l2Gateway, l2DAI] = await getRandomAddresses()
      const l1Gateway = await deploy<L1Gateway__factory>('L1Gateway', [inbox, escrow, l1DAI, l2Gateway, l2DAI])

      expect(await l1Gateway.inbox()).to.eq(inbox)
      expect(await l1Gateway.escrow()).to.eq(escrow)
      expect(await l1Gateway.l1DAI()).to.eq(l1DAI)
      expect(await l1Gateway.l2Gateway()).to.eq(l2Gateway)
      expect(await l1Gateway.l2DAI()).to.eq(l2DAI)
    })
  })

  describe('registerCustomL2Token', () => {
    it('reverts', async () => {
      const [inbox, escrow, l1DAI, l2Gateway, l2DAI] = await getRandomAddresses()
      const l1Gateway = await deploy<L1Gateway__factory>('L1Gateway', [inbox, escrow, l1DAI, l2Gateway, l2DAI])

      await expect(l1Gateway.registerCustomL2Token(ZERO_ADDRESS, 0, 0, 0, ZERO_ADDRESS)).to.be.revertedWith(
        errorMessages.notSupported,
      )
    })
  })

  describe('calculateL2TokenAddress', () => {
    it('returns l2DAI address', async () => {
      const [inbox, escrow, l1DAI, l2Gateway, l2DAI] = await getRandomAddresses()
      const l1Gateway = await deploy<L1Gateway__factory>('L1Gateway', [inbox, escrow, l1DAI, l2Gateway, l2DAI])

      expect(await l1Gateway.calculateL2TokenAddress(l1DAI)).to.be.eq(l2DAI)
    })

    it('reverts when asked about different l1 token', async () => {
      const [inbox, escrow, l1DAI, l2Gateway, l2DAI, randomL1Token] = await getRandomAddresses()
      const l1Gateway = await deploy<L1Gateway__factory>('L1Gateway', [inbox, escrow, l1DAI, l2Gateway, l2DAI])

      await expect(l1Gateway.calculateL2TokenAddress(randomL1Token)).to.be.revertedWith(errorMessages.notSupported)
    })
  })

  describe('deposit()', () => {
    it('escrows funds and sends xchain message on deposit', async () => {
      const [inboxImpersonator, user1] = await ethers.getSigners()
      const { l1Dai, l1Gateway, inboxMock, l1Escrow, l2GatewayMock } = await setupTest({
        inboxImpersonator,
        user1,
      })

      await l1Dai.connect(user1).approve(l1Gateway.address, depositAmount)
      await l1Gateway.connect(user1).deposit(l1Dai.address, user1.address, depositAmount, 0, 0, 0, '0x')
      const depositCallToMessengerCall = inboxMock.smocked.createRetryableTicket.calls[0]

      expect(await l1Dai.balanceOf(user1.address)).to.be.eq(initialTotalL1Supply - depositAmount)
      expect(await l1Dai.balanceOf(l1Gateway.address)).to.be.eq(0)
      expect(await l1Dai.balanceOf(l1Escrow.address)).to.be.eq(depositAmount)

      expect(depositCallToMessengerCall.destAddr).to.equal(l2GatewayMock.address)
      //@todo fill it out
      // expect(depositCallToMessengerCall.data).to.equal(
      //   l2GatewayMock.interface.encodeFunctionData('finalizeDeposit', [user1.address, depositAmount]),
      // )
    })

    it('escrows funds and sends xchain message for another user')

    it('reverts when approval is too low')

    it('reverts when funds too low')

    it('reverts when bridge is closed')
  })

  describe('finalizeWithdrawal', () => {
    const withdrawAmount = 100

    it('sends funds from the escrow', async () => {
      const [inboxImpersonator, outboxImpersonator, bridgeImpersonator, user1, user2] = await ethers.getSigners()
      const { l1Dai, l1Gateway, outboxMock, l2GatewayMock, l1Escrow } = await setupWithdrawTest({
        inboxImpersonator,
        outboxImpersonator,
        bridgeImpersonator,
        user1,
      })
      outboxMock.smocked.l2ToL1Sender.will.return.with(() => l2GatewayMock.address)

      await l1Gateway.connect(inboxImpersonator).withdrawFromL2(0, l1Dai.address, user2.address, withdrawAmount)

      expect(await l1Dai.balanceOf(user2.address)).to.be.equal(withdrawAmount)
      expect(await l1Dai.balanceOf(l1Escrow.address)).to.be.equal(initialTotalL1Supply - withdrawAmount)
    })

    // pending withdrawals MUST success even if bridge is closed
    it('completes withdrawals even when closed')

    // if bridge is closed properly this shouldn't happen
    it('reverts when escrow access was revoked')

    it('reverts when withdrawing something different than DAI')

    it('reverts when called not by XDomainMessenger')

    it('reverts when called by XDomainMessenger but not relying message from l2Gateway')
  })

  describe('close()', () => {
    it('can be called by owner')

    it('can be called multiple times by the owner but nothing changes')

    it('reverts when called not by the owner')
  })
})

async function setupTest(signers: { inboxImpersonator: SignerWithAddress; user1: SignerWithAddress }) {
  const l2GatewayMock = await deployMock('L2Gateway')
  const inboxMock = await deployArbitrumContractMock(
    'Inbox',
    { address: await signers.inboxImpersonator.getAddress() }, // This allows us to use an ethers override {from: Inbox.address} to mock calls
  )
  const l1Escrow = await deploy<L1Escrow__factory>('L1Escrow')
  const l1Dai = await deploy<Dai__factory>('Dai')
  const l2Dai = await deploy<Dai__factory>('Dai')
  const l1Gateway = await deploy<L1Gateway__factory>('L1Gateway', [
    inboxMock.address,
    l1Escrow.address,
    l1Dai.address,
    l2GatewayMock.address,
    l2Dai.address,
  ])
  await l1Dai.mint(signers.user1.address, initialTotalL1Supply)
  await l1Escrow.approve(l1Dai.address, l1Gateway.address, ethers.constants.MaxUint256)

  return { l1Escrow, l1Dai, l1Gateway, inboxMock, l2GatewayMock, l2Dai }
}

async function setupWithdrawTest(signers: {
  inboxImpersonator: SignerWithAddress
  outboxImpersonator: SignerWithAddress
  bridgeImpersonator: SignerWithAddress
  user1: SignerWithAddress
}) {
  const contracts = await setupTest(signers)

  const bridgeMock = await deployArbitrumContractMock('Bridge', {
    address: await signers.bridgeImpersonator.getAddress(),
  })
  const outboxMock = await deployArbitrumContractMock('Outbox', {
    address: await signers.outboxImpersonator.getAddress(),
  })
  const allContracts = { ...contracts, bridgeMock, outboxMock }

  //ensure that outboxMock gets provided
  allContracts.inboxMock.smocked.bridge.will.return.with(bridgeMock.address)
  allContracts.bridgeMock.smocked.activeOutbox.will.return.with(outboxMock.address)

  // move all DAI to the escrow so withdrawals work
  await allContracts.l1Dai.connect(signers.user1).transfer(allContracts.l1Escrow.address, initialTotalL1Supply)

  return allContracts
}
