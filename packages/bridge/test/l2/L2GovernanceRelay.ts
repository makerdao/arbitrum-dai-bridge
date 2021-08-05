import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { ethers } from 'hardhat'

import {
  ArbDai__factory,
  BadSpell__factory,
  L2GovernanceRelay__factory,
  TestDaiMintSpell__factory,
} from '../../typechain'
import { assertPublicMutableMethods, deploy } from '../helpers/helpers'

const errorMessages = {
  invalidMessenger: 'OVM_XCHAIN: messenger contract unauthenticated',
  invalidXDomainMessageOriginator: 'OVM_XCHAIN: wrong sender of cross-domain message',
  delegatecallError: 'L2GovernanceRelay/delegatecall-error',
  illegalStorageChange: 'L2GovernanceRelay/illegal-storage-change',
}

describe('L2GovernanceRelay', () => {
  describe('relay', () => {
    const depositAmount = 100

    it('mints new tokens', async () => {
      const [deployer, l1GovernanceRelayImpersonator, l1Dai, user1] = await ethers.getSigners()
      const { l2GovernanceRelay, l2Dai, l2daiMintSpell } = await setupTest({
        l1Dai,
        l1GovernanceRelay: l1GovernanceRelayImpersonator,
        deployer,
      })

      await l2GovernanceRelay
        .connect(l1GovernanceRelayImpersonator)
        .relay(
          l2daiMintSpell.address,
          l2daiMintSpell.interface.encodeFunctionData('mintDai', [l2Dai.address, user1.address, depositAmount]),
        )

      expect(await l2Dai.balanceOf(user1.address)).to.be.eq(depositAmount)
      expect(await l2Dai.totalSupply()).to.be.eq(depositAmount)
    })

    it.skip('[SKIP NOT IMPLEMENTED YET] reverts when called not by XDomainMessenger')

    it('reverts when spell reverts', async () => {
      const [deployer, l1GovernanceRelayImpersonator, l1Dai] = await ethers.getSigners()
      const { l2GovernanceRelay } = await setupTest({
        l1Dai,
        l1GovernanceRelay: l1GovernanceRelayImpersonator,
        deployer,
      })
      const badSpell = await deploy<BadSpell__factory>('BadSpell', [])

      await expect(
        l2GovernanceRelay
          .connect(l1GovernanceRelayImpersonator)
          .relay(badSpell.address, badSpell.interface.encodeFunctionData('abort')),
      ).to.be.revertedWith(errorMessages.delegatecallError)
    })
  })

  describe('constructor', () => {
    it('assigns all variables properly', async () => {
      const [l1GovRelay] = await ethers.getSigners()

      const l2GovRelay = await deploy<L2GovernanceRelay__factory>('L2GovernanceRelay', [l1GovRelay.address])

      expect(await l2GovRelay.l1GovernanceRelay()).to.eq(l1GovRelay.address)
    })
  })

  it('has correct public interface', async () => {
    await assertPublicMutableMethods('L2GovernanceRelay', ['relay(address,bytes)'])
  })
})

async function setupTest(signers: {
  l1Dai: SignerWithAddress
  l1GovernanceRelay: SignerWithAddress
  deployer: SignerWithAddress
}) {
  const l2Dai = await deploy<ArbDai__factory>('ArbDai', [signers.l1Dai.address])

  const l2GovernanceRelay = await deploy<L2GovernanceRelay__factory>('L2GovernanceRelay', [
    signers.l1GovernanceRelay.address,
  ])
  await l2Dai.rely(l2GovernanceRelay.address)
  await l2Dai.deny(signers.deployer.address)

  const l2daiMintSpell = await deploy<TestDaiMintSpell__factory>('TestDaiMintSpell', [])

  return { l2Dai, l2GovernanceRelay, l2daiMintSpell }
}
