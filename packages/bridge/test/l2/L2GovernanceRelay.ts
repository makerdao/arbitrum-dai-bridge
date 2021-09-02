import { assertPublicMutableMethods, simpleDeploy } from '@makerdao/hardhat-utils'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { expect } from 'chai'
import { ethers } from 'hardhat'

import { getL2SignerFromL1 } from '../../arbitrum-helpers/messaging'
import { BadSpell__factory, Dai__factory, L2GovernanceRelay__factory, TestDaiMintSpell__factory } from '../../typechain'

const errorMessages = {
  l1CounterpartMismatch: 'ONLY_COUNTERPART_GATEWAY',
  delegatecallError: 'L2GovernanceRelay/delegatecall-error',
  illegalStorageChange: 'L2GovernanceRelay/illegal-storage-change',
}

describe('L2GovernanceRelay', () => {
  describe('relay', () => {
    const depositAmount = 100

    it('mints new tokens', async () => {
      const [deployer, l1GovernanceRelayImpersonator, l1Dai, user1] = await ethers.getSigners()
      const { l2GovernanceRelay, l2Dai, l2daiMintSpell, l2GovernanceRelayImpersonator } = await setupTest({
        l1Dai,
        l1GovernanceRelay: l1GovernanceRelayImpersonator,
        deployer,
      })

      await l2GovernanceRelay
        .connect(l2GovernanceRelayImpersonator)
        .relay(
          l2daiMintSpell.address,
          l2daiMintSpell.interface.encodeFunctionData('mintDai', [l2Dai.address, user1.address, depositAmount]),
        )

      expect(await l2Dai.balanceOf(user1.address)).to.be.eq(depositAmount)
      expect(await l2Dai.totalSupply()).to.be.eq(depositAmount)
    })

    it('reverts when called not relying message from l1DaiGateway', async () => {
      const [deployer, l1GovernanceRelayImpersonator, l1Dai, randomAcc, user1] = await ethers.getSigners()
      const { l2GovernanceRelay, l2daiMintSpell, l2Dai } = await setupTest({
        l1Dai,
        l1GovernanceRelay: l1GovernanceRelayImpersonator,
        deployer,
      })

      await expect(
        l2GovernanceRelay
          .connect(randomAcc)
          .relay(
            l2daiMintSpell.address,
            l2daiMintSpell.interface.encodeFunctionData('mintDai', [l2Dai.address, user1.address, depositAmount]),
          ),
      ).to.be.revertedWith(errorMessages.l1CounterpartMismatch)
    })

    it('reverts when called directly by l1 counterpart', async () => {
      // this should fail b/c we require address translation
      const [deployer, l1GovernanceRelayImpersonator, l1Dai, user1] = await ethers.getSigners()
      const { l2GovernanceRelay, l2daiMintSpell, l2Dai } = await setupTest({
        l1Dai,
        l1GovernanceRelay: l1GovernanceRelayImpersonator,
        deployer,
      })

      await expect(
        l2GovernanceRelay
          .connect(l1GovernanceRelayImpersonator)
          .relay(
            l2daiMintSpell.address,
            l2daiMintSpell.interface.encodeFunctionData('mintDai', [l2Dai.address, user1.address, depositAmount]),
          ),
      ).to.be.revertedWith(errorMessages.l1CounterpartMismatch)
    })

    it('reverts when spell reverts', async () => {
      const [deployer, l1GovernanceRelayImpersonator, l1Dai] = await ethers.getSigners()
      const { l2GovernanceRelay, l2GovernanceRelayImpersonator } = await setupTest({
        l1Dai,
        l1GovernanceRelay: l1GovernanceRelayImpersonator,
        deployer,
      })
      const badSpell = await simpleDeploy<BadSpell__factory>('BadSpell', [])

      await expect(
        l2GovernanceRelay
          .connect(l2GovernanceRelayImpersonator)
          .relay(badSpell.address, badSpell.interface.encodeFunctionData('abort')),
      ).to.be.revertedWith(errorMessages.delegatecallError)
    })
  })

  describe('constructor', () => {
    it('assigns all variables properly', async () => {
      const [l1GovRelay] = await ethers.getSigners()

      const l2GovRelay = await simpleDeploy<L2GovernanceRelay__factory>('L2GovernanceRelay', [l1GovRelay.address])

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
  const l2Dai = await simpleDeploy<Dai__factory>('Dai', [])

  const l2GovernanceRelay = await simpleDeploy<L2GovernanceRelay__factory>('L2GovernanceRelay', [
    signers.l1GovernanceRelay.address,
  ])
  await l2Dai.rely(l2GovernanceRelay.address)
  await l2Dai.deny(signers.deployer.address)

  const l2daiMintSpell = await simpleDeploy<TestDaiMintSpell__factory>('TestDaiMintSpell', [])

  const l2GovernanceRelayImpersonator = await getL2SignerFromL1(signers.l1GovernanceRelay)
  await signers.deployer.sendTransaction({
    to: await l2GovernanceRelayImpersonator.getAddress(),
    value: ethers.utils.parseUnits('0.1', 'ether'),
  })

  return { l2Dai, l2GovernanceRelay, l2daiMintSpell, l2GovernanceRelayImpersonator }
}
