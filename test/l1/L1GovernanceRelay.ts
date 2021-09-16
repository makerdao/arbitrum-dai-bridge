import {
  assertPublicMutableMethods,
  getRandomAddress,
  getRandomAddresses,
  simpleDeploy,
  testAuth,
} from '@makerdao/hardhat-utils'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { parseUnits } from 'ethers/lib/utils'
import { ethers } from 'hardhat'

import { deployArbitrumContractMock } from '../../arbitrum-helpers/mocks'
import { L1GovernanceRelay__factory, L2GovernanceRelay__factory } from '../../typechain'

const errorMessages = {
  invalidMessenger: 'OVM_XCHAIN: messenger contract unauthenticated',
  invalidXDomainMessageOriginator: 'OVM_XCHAIN: wrong sender of cross-domain message',
  notAuthed: 'L1GovernanceRelay/not-authorized',
}

const MAX_GAS = 5000000
const GAS_PRICE_BID = 42
const MAX_SUBMISSION_COST = 69
const defaultEthValue = parseUnits('0.1', 'ether')

describe('L1GovernanceRelay', () => {
  describe('relay()', () => {
    it('sends xchain message with eth passed in tx', async () => {
      const [deployer, l2GovernanceRelay, l2spell] = await ethers.getSigners()
      const { l1GovernanceRelay, inboxMock } = await setupTest({
        l2GovernanceRelay,
      })

      await l1GovernanceRelay
        .connect(deployer)
        .relay(l2spell.address, [], defaultEthValue, MAX_GAS, GAS_PRICE_BID, MAX_SUBMISSION_COST, {
          value: defaultEthValue,
        })
      const inboxCall = inboxMock.smocked.createRetryableTicketNoRefundAliasRewrite.calls[0]

      expect(await deployer.provider?.getBalance(inboxMock.address)).to.equal(defaultEthValue)
      expect(inboxCall.destAddr).to.equal(l2GovernanceRelay.address)
      expect(inboxCall.l2CallValue).to.equal(0)
      expect(inboxCall.maxSubmissionCost).to.equal(MAX_SUBMISSION_COST)
      expect(inboxCall.excessFeeRefundAddress).to.equal(l2GovernanceRelay.address)
      expect(inboxCall.callValueRefundAddress).to.equal(l2GovernanceRelay.address)
      expect(inboxCall.maxGas).to.equal(MAX_GAS)
      expect(inboxCall.gasPriceBid).to.equal(GAS_PRICE_BID)
      expect(inboxCall.data).to.equal(
        new L2GovernanceRelay__factory().interface.encodeFunctionData('relay', [l2spell.address, []]),
      )
    })

    it('sends xchain message on relay with eth send before', async () => {
      const [deployer, l2GovernanceRelay, l2spell] = await ethers.getSigners()
      const { l1GovernanceRelay, inboxMock } = await setupTest({
        l2GovernanceRelay,
      })
      await deployer.sendTransaction({ to: l1GovernanceRelay.address, value: defaultEthValue })

      await l1GovernanceRelay
        .connect(deployer)
        .relay(l2spell.address, [], defaultEthValue, MAX_GAS, GAS_PRICE_BID, MAX_SUBMISSION_COST)
      const inboxCall = inboxMock.smocked.createRetryableTicketNoRefundAliasRewrite.calls[0]

      expect(await deployer.provider?.getBalance(inboxMock.address)).to.equal(defaultEthValue)
      expect(inboxCall.destAddr).to.equal(l2GovernanceRelay.address)
      expect(inboxCall.l2CallValue).to.equal(0)
      expect(inboxCall.maxSubmissionCost).to.equal(MAX_SUBMISSION_COST)
      expect(inboxCall.excessFeeRefundAddress).to.equal(l2GovernanceRelay.address)
      expect(inboxCall.callValueRefundAddress).to.equal(l2GovernanceRelay.address)
      expect(inboxCall.maxGas).to.equal(MAX_GAS)
      expect(inboxCall.gasPriceBid).to.equal(GAS_PRICE_BID)
      expect(inboxCall.data).to.equal(
        new L2GovernanceRelay__factory().interface.encodeFunctionData('relay', [l2spell.address, []]),
      )
    })

    it('reverts when not authed', async () => {
      const [_deployer, l2GovernanceRelay, l2spell, notAdmin] = await ethers.getSigners()
      const { l1GovernanceRelay } = await setupTest({
        l2GovernanceRelay,
      })

      await expect(
        l1GovernanceRelay
          .connect(notAdmin)
          .relay(l2spell.address, [], defaultEthValue, MAX_GAS, GAS_PRICE_BID, MAX_SUBMISSION_COST),
      ).to.be.revertedWith(errorMessages.notAuthed)
    })
  })

  describe('reclaim', () => {
    it('allows sending out eth from the balance', async () => {
      const [deployer, l2GovernanceRelay] = await ethers.getSigners()
      const provider = deployer.provider!
      const randomReceiver = await getRandomAddress()
      const { l1GovernanceRelay } = await setupTest({
        l2GovernanceRelay,
      })
      await deployer.sendTransaction({ to: l1GovernanceRelay.address, value: defaultEthValue })

      await l1GovernanceRelay.connect(deployer).reclaim(randomReceiver, defaultEthValue)

      expect(await provider.getBalance(randomReceiver)).to.eq(defaultEthValue)
    })

    it('reverts when not authed', async () => {
      const [deployer, l2GovernanceRelay, other] = await ethers.getSigners()
      const randomReceiver = await getRandomAddress()
      const { l1GovernanceRelay } = await setupTest({
        l2GovernanceRelay,
      })
      await deployer.sendTransaction({ to: l1GovernanceRelay.address, value: defaultEthValue })

      await expect(l1GovernanceRelay.connect(other).reclaim(randomReceiver, defaultEthValue)).to.be.revertedWith(
        errorMessages.notAuthed,
      )
    })
  })

  describe('receives', () => {
    it('receives eth', async () => {
      const [deployer, l2GovernanceRelay, other] = await ethers.getSigners()
      const provider = deployer.provider!
      const { l1GovernanceRelay } = await setupTest({
        l2GovernanceRelay,
      })

      await other.sendTransaction({ to: l1GovernanceRelay.address, value: defaultEthValue })

      expect(await provider.getBalance(l1GovernanceRelay.address)).to.eq(defaultEthValue)
    })
  })

  describe('constructor', () => {
    it('assigns all variables properly', async () => {
      const [l2GovernanceRelay, inbox] = await ethers.getSigners()

      const l1GovRelay = await simpleDeploy<L1GovernanceRelay__factory>('L1GovernanceRelay', [
        inbox.address,
        l2GovernanceRelay.address,
      ])

      expect(await l1GovRelay.l2GovernanceRelay()).to.eq(l2GovernanceRelay.address)
      expect(await l1GovRelay.inbox()).to.eq(inbox.address)
    })
  })

  it('has correct public interface', async () => {
    await assertPublicMutableMethods('L1GovernanceRelay', [
      'rely(address)',
      'deny(address)',
      'reclaim(address,uint256)',
      'relay(address,bytes,uint256,uint256,uint256,uint256)',
    ])
  })

  testAuth({
    name: 'L1GovernanceRelay',
    getDeployArgs: async () => {
      const [l2GovernanceRelay, l1CrossDomainMessengerMock] = await getRandomAddresses()

      return [l2GovernanceRelay, l1CrossDomainMessengerMock]
    },
    authedMethods: [
      async (c) => {
        const [target] = await getRandomAddresses()
        return c.relay(target, '0x', 0, 0, 0, 0)
      },
      async (c) => {
        const [target] = await getRandomAddresses()
        return c.reclaim(target, '100')
      },
    ],
  })
})

async function setupTest(signers: { l2GovernanceRelay: SignerWithAddress }) {
  const inboxMock = await deployArbitrumContractMock('Inbox')
  const l1GovernanceRelay = await simpleDeploy<L1GovernanceRelay__factory>('L1GovernanceRelay', [
    inboxMock.address,
    signers.l2GovernanceRelay.address,
  ])

  return { l1GovernanceRelay, inboxMock }
}
