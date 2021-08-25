import { assertPublicMutableMethods, getRandomAddresses, simpleDeploy, testAuth } from '@makerdao/hardhat-utils'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
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

describe('L1GovernanceRelay', () => {
  describe('relay()', () => {
    it('sends xchain message on relay', async () => {
      const [deployer, l2GovernanceRelay, l2spell] = await ethers.getSigners()
      const { l1GovernanceRelay, inboxMock } = await setupTest({
        l2GovernanceRelay,
      })

      await l1GovernanceRelay.connect(deployer).relay(l2spell.address, [], MAX_GAS, GAS_PRICE_BID, MAX_SUBMISSION_COST)
      const inboxCall = inboxMock.smocked.createRetryableTicket.calls[0]

      expect(inboxCall.destAddr).to.equal(l2GovernanceRelay.address)
      expect(inboxCall.l2CallValue).to.equal(0)
      expect(inboxCall.maxSubmissionCost).to.equal(MAX_SUBMISSION_COST)
      expect(inboxCall.excessFeeRefundAddress).to.equal(deployer.address)
      expect(inboxCall.callValueRefundAddress).to.equal(deployer.address)
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
        l1GovernanceRelay.connect(notAdmin).relay(l2spell.address, [], MAX_GAS, GAS_PRICE_BID, MAX_SUBMISSION_COST),
      ).to.be.revertedWith(errorMessages.notAuthed)
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
      'relay(address,bytes,uint256,uint256,uint256)',
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
        return c.relay(target, '0x', 0, 0, 0)
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
