import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { ethers } from 'hardhat'

import { Dai__factory, L1Gateway__factory, L2Gateway__factory } from '../../typechain'
import { deploy, deployArbitrumContractMock, getRandomAddresses } from '../helpers'

const errorMessages = {
  invalidMessenger: 'OVM_XCHAIN: messenger contract unauthenticated',
  invalidXDomainMessageOriginator: 'OVM_XCHAIN: wrong sender of cross-domain message',
  alreadyInitialized: 'Contract has already been initialized',
  notInitialized: 'Contract has not yet been initialized',
  bridgeClosed: 'L2Gateway/closed',
  notOwner: 'L2Gateway/not-authorized',
  daiInsufficientAllowance: 'Dai/insufficient-allowance',
  daiInsufficientBalance: 'Dai/insufficient-balance',
  daiNotAuthorized: 'Dai/not-authorized',
}

describe('OVM_L2Gateway', () => {
  describe('initialize()', () => {
    it('initializes variables', async () => {
      const [l1Gateway, l1DAI, l2DAI] = await getRandomAddresses()
      const l2Gateway = await deploy<L2Gateway__factory>('L2Gateway')

      await l2Gateway.initialize(l1Gateway, l1DAI, l2DAI)

      expect(await l2Gateway.l1Gateway()).to.be.eq(l1Gateway)
      expect(await l2Gateway.l1DAI()).to.be.eq(l1DAI)
      expect(await l2Gateway.l2DAI()).to.be.eq(l2DAI)
    })

    it('reverts when tries to reinitialize', async () => {
      const [l1Gateway, l1DAI, l2DAI, l1Gateway2, l1DAI2, l2DAI2] = await getRandomAddresses()
      const l2Gateway = await deploy<L2Gateway__factory>('L2Gateway')

      await l2Gateway.initialize(l1Gateway, l1DAI, l2DAI)
      await expect(l2Gateway.initialize(l1Gateway2, l1DAI2, l2DAI2)).to.be.revertedWith('L2Gateway/already-initialized')
    })

    it('doesnt allow calls to onlyInitialized functions before initialization')
  })

  describe('mintFromL1()', () => {
    const depositAmount = 100
    it('mints new tokens', async () => {
      const [_, l1GatewayImpersonator, l1DAIImpersonator, user1] = await ethers.getSigners()
      const { l2Dai, l2Gateway } = await setupTest({
        l1GatewayImpersonator,
        l1DAIImpersonator,
        user1,
      })

      expect(await l2Dai.balanceOf(user1.address)).to.be.eq(0)
      expect(await l2Dai.totalSupply()).to.be.eq(0)
      await l2Gateway
        .connect(l1GatewayImpersonator)
        .mintFromL1(l1DAIImpersonator.address, user1.address, user1.address, depositAmount, '0x', '0x')

      expect(await l2Dai.balanceOf(user1.address)).to.be.eq(depositAmount)
      expect(await l2Dai.totalSupply()).to.be.eq(depositAmount)
    })

    // pending deposits MUST success even if bridge is closed
    it('completes deposits even when closed')
    // if bridge is closed properly this shouldn't happen
    it('reverts when DAI minting access was revoked')
    it('reverts when called with a diffrent token')
    it('reverts when called not by XDomainMessenger')
    it('reverts when called by XDomainMessenger but not relying message from l1ERC20Gateway')
  })

  describe('withdraw()', () => {
    const withdrawAmount = 100

    it('sends xchain message and burns tokens', async () => {
      const [_, l1GatewayImpersonator, l1DAIImpersonator, user1] = await ethers.getSigners()
      const { l2Dai, l2Gateway, arbSysMock } = await setupWithdrawTest({
        l1GatewayImpersonator,
        l1DAIImpersonator,
        user1,
      })

      await l2Gateway.connect(user1).withdraw(l1DAIImpersonator.address, user1.address, user1.address, withdrawAmount)
      const l2ToL1Call = arbSysMock.smocked.sendTxToL1.calls[0]

      expect(await l2Dai.balanceOf(user1.address)).to.equal(INITIAL_TOTAL_L1_SUPPLY - withdrawAmount)
      expect(await l2Dai.totalSupply()).to.equal(INITIAL_TOTAL_L1_SUPPLY - withdrawAmount)

      expect(l2ToL1Call.destAddr).to.equal(l1GatewayImpersonator.address)
      expect(l2ToL1Call.calldataForL1).to.equal(
        new L1Gateway__factory().interface.encodeFunctionData('withdrawFromL2', [
          0,
          l1DAIImpersonator.address,
          user1.address,
          withdrawAmount,
        ]),
      )
    })

    it('reverts when approval is too low')

    it('reverts when not enough funds')

    it('reverts when bridge is closed')
  })

  describe('withdrawTo', () => {
    it('sends xchain message and burns tokens')

    it('reverts when approval is too low')

    it('reverts when not enough funds')

    it('reverts when bridge is closed')
  })

  describe('close()', () => {
    it('can be called by owner')
    it('can be called multiple times by the owner but nothing changes')
    it('reverts when called not by the owner')
  })
})

async function setupTest(signers: {
  l1GatewayImpersonator: SignerWithAddress
  l1DAIImpersonator: SignerWithAddress
  user1: SignerWithAddress
}) {
  const l2Dai = await deploy<Dai__factory>('Dai', [])
  const l2Gateway = await deploy<L2Gateway__factory>('L2Gateway')
  await l2Gateway.initialize(signers.l1GatewayImpersonator.address, signers.l1DAIImpersonator.address, l2Dai.address)

  await l2Dai.rely(l2Gateway.address)

  return { l2Dai, l2Gateway }
}

const INITIAL_TOTAL_L1_SUPPLY = 3000

async function setupWithdrawTest(signers: {
  l1GatewayImpersonator: SignerWithAddress
  l1DAIImpersonator: SignerWithAddress
  user1: SignerWithAddress
}) {
  const contracts = await setupTest(signers)

  const arbSysMock = await deployArbitrumContractMock('ArbSys', {
    address: '0x0000000000000000000000000000000000000064',
  })

  await contracts.l2Dai.mint(signers.user1.address, INITIAL_TOTAL_L1_SUPPLY)
  await contracts.l2Dai.connect(signers.user1).approve(contracts.l2Gateway.address, ethers.constants.MaxUint256)

  return { ...contracts, arbSysMock }
}
