import { defaultAbiCoder } from '@ethersproject/abi'
import {
  assertPublicMutableMethods,
  assertPublicNotMutableMethods,
  getRandomAddress,
  getRandomAddresses,
  simpleDeploy,
  testAuth,
} from '@makerdao/hardhat-utils'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers } from 'hardhat'

import { getL2SignerFromL1 } from '../../arbitrum-helpers/messaging'
import { deployArbitrumContractMock } from '../../arbitrum-helpers/mocks'
import { Dai__factory, L1DaiGateway__factory, L2DaiGateway__factory } from '../../typechain'

const initialTotalL2Supply = 3000
const errorMessages = {
  closed: 'L2DaiGateway/closed',
  tokenMismatch: 'L2DaiGateway/token-not-dai',
  callHookDataNotAllowed: 'L2DaiGateway/call-hook-data-not-allowed',
  insufficientAllowance: 'Dai/insufficient-allowance',
  insufficientFunds: 'Dai/insufficient-balance',
  notOwner: 'L2DaiGateway/not-authorized',
  notOwnerOfDai: 'Dai/not-authorized',
  l1CounterpartMismatch: 'ONLY_COUNTERPART_GATEWAY',
  inboundEscrowAndCallGuard: 'Mint can only be called by self',
}

describe('L2DaiGateway', () => {
  describe('finalizeInboundTransfer', () => {
    const depositAmount = 100
    const defaultData = ethers.utils.defaultAbiCoder.encode(['bytes', 'bytes'], ['0x12', '0x'])

    it('mints tokens', async () => {
      const [sender, l1Dai, router] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway, l2Deployer } = await setupTest({
        l1Dai,
        l1DaiBridge: sender,
        router,
        deployer: sender,
      })
      const receiverAddress = sender.address

      const tx = await l2DaiGateway
        .connect(l2Deployer)
        .finalizeInboundTransfer(l1Dai.address, sender.address, receiverAddress, depositAmount, defaultData)

      expect(await l2Dai.balanceOf(receiverAddress)).to.be.eq(depositAmount)
      expect(await l2Dai.totalSupply()).to.be.eq(depositAmount)
      await expect(tx)
        .to.emit(l2DaiGateway, 'DepositFinalized')
        .withArgs(l1Dai.address, sender.address, receiverAddress, depositAmount)
      // await expect(tx).not.to.emit(l2DaiGateway, 'TransferAndCallTriggered')
    })

    it('mints tokens for a 3rd party', async () => {
      const [sender, receiver, l1Dai, router] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway, l2Deployer } = await setupTest({
        l1Dai,
        l1DaiBridge: sender,
        router,
        deployer: sender,
      })

      const tx = await l2DaiGateway
        .connect(l2Deployer)
        .finalizeInboundTransfer(l1Dai.address, sender.address, receiver.address, depositAmount, defaultData)

      expect(await l2Dai.balanceOf(receiver.address)).to.be.eq(depositAmount)
      expect(await l2Dai.totalSupply()).to.be.eq(depositAmount)
      await expect(tx)
        .to.emit(l2DaiGateway, 'DepositFinalized')
        .withArgs(l1Dai.address, sender.address, receiver.address, depositAmount)
      // await expect(tx).not.to.emit(l2DaiGateway, 'TransferAndCallTriggered')
    })

    it('mints tokens even when closed', async () => {
      const [sender, l1Dai, router] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway, l2Deployer } = await setupTest({
        l1Dai,
        l1DaiBridge: sender,
        router,
        deployer: sender,
      })
      const receiverAddress = sender.address

      await l2DaiGateway.close()
      const tx = await l2DaiGateway
        .connect(l2Deployer)
        .finalizeInboundTransfer(l1Dai.address, sender.address, receiverAddress, depositAmount, defaultData)

      expect(await l2Dai.balanceOf(receiverAddress)).to.be.eq(depositAmount)
      expect(await l2Dai.totalSupply()).to.be.eq(depositAmount)
      await expect(tx)
        .to.emit(l2DaiGateway, 'DepositFinalized')
        .withArgs(l1Dai.address, sender.address, receiverAddress, depositAmount)
    })

    it('reverts when withdrawing not supported tokens', async () => {
      const [sender, l1Dai, router, dummyAcc] = await ethers.getSigners()
      const { l2DaiGateway, l2Deployer } = await setupTest({ l1Dai, l1DaiBridge: sender, router, deployer: sender })
      const receiverAddress = sender.address

      await expect(
        l2DaiGateway
          .connect(l2Deployer)
          .finalizeInboundTransfer(dummyAcc.address, sender.address, receiverAddress, depositAmount, defaultData),
      ).to.be.revertedWith(errorMessages.tokenMismatch)
    })

    it('reverts when DAI minting access was revoked', async () => {
      const [sender, l1Dai, router] = await ethers.getSigners()
      const { l2DaiGateway, l2Dai, l2Deployer } = await setupTest({
        l1Dai,
        l1DaiBridge: sender,
        router,
        deployer: sender,
      })
      const receiverAddress = sender.address

      await l2Dai.deny(l2DaiGateway.address)

      await expect(
        l2DaiGateway
          .connect(l2Deployer)
          .finalizeInboundTransfer(l1Dai.address, sender.address, receiverAddress, depositAmount, defaultData),
      ).to.be.revertedWith(errorMessages.notOwnerOfDai)
    })

    it('reverts when called not relying message from l1DaiGateway', async () => {
      const [sender, l1Dai, router, dummyAcc] = await ethers.getSigners()
      const { l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: sender, router, deployer: sender })

      await expect(
        l2DaiGateway
          .connect(dummyAcc)
          .finalizeInboundTransfer(dummyAcc.address, sender.address, sender.address, depositAmount, defaultData),
      ).to.be.revertedWith(errorMessages.l1CounterpartMismatch)
    })

    it('reverts when called directly by l1 counterpart', async () => {
      // this should fail b/c we require address translation
      const [sender, l1Dai, router] = await ethers.getSigners()
      const { l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: sender, router, deployer: sender })
      const receiverAddress = sender.address

      await expect(
        l2DaiGateway.finalizeInboundTransfer(
          l1Dai.address,
          sender.address,
          receiverAddress,
          depositAmount,
          defaultData,
        ),
      ).to.be.revertedWith(errorMessages.l1CounterpartMismatch)
    })
  })

  describe('outboundTransfer(address,address,uint256,bytes)', () => {
    const withdrawAmount = 100
    const defaultData = '0x'
    const defaultDataWithNotEmptyCallHookData = '0x12'
    const expectedWithdrawalId = 0

    it('sends xdomain message and burns tokens', async () => {
      const [deployer, l1DaiBridge, l1Dai, router, sender] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway, arbSysMock } = await setupWithdrawalTest({
        l1Dai,
        l1DaiBridge,
        router,
        user1: sender,
        deployer,
      })

      const tx = await l2DaiGateway
        .connect(sender)
        ['outboundTransfer(address,address,uint256,bytes)'](l1Dai.address, sender.address, withdrawAmount, defaultData)
      const withdrawCrossChainCall = arbSysMock.smocked.sendTxToL1.calls[0]

      expect(await l2Dai.balanceOf(sender.address)).to.be.eq(initialTotalL2Supply - withdrawAmount)
      expect(await l2Dai.totalSupply()).to.be.eq(initialTotalL2Supply - withdrawAmount)
      await expect(tx)
        .to.emit(l2DaiGateway, 'WithdrawalInitiated')
        .withArgs(
          l1Dai.address,
          sender.address,
          sender.address,
          expectedWithdrawalId,
          expectedWithdrawalId,
          withdrawAmount,
        )
      expect(withdrawCrossChainCall.destAddr).to.eq(l1DaiBridge.address)
      expect(withdrawCrossChainCall.calldataForL1).to.eq(
        new L1DaiGateway__factory().interface.encodeFunctionData('finalizeInboundTransfer', [
          l1Dai.address,
          sender.address,
          sender.address,
          withdrawAmount,
          ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [expectedWithdrawalId, defaultData]),
        ]),
      )
    })

    it('sends xdomain message and burns tokens for 3rd party', async () => {
      const [deployer, , l1DaiBridge, l1Dai, router, sender, receiver] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway, arbSysMock } = await setupWithdrawalTest({
        l1Dai,
        l1DaiBridge,
        router,
        user1: sender,
        deployer,
      })

      const tx = await l2DaiGateway
        .connect(sender)
        ['outboundTransfer(address,address,uint256,bytes)'](
          l1Dai.address,
          receiver.address,
          withdrawAmount,
          defaultData,
        )
      const withdrawCrossChainCall = arbSysMock.smocked.sendTxToL1.calls[0]

      expect(await l2Dai.balanceOf(sender.address)).to.be.eq(initialTotalL2Supply - withdrawAmount)
      expect(await l2Dai.balanceOf(receiver.address)).to.be.eq(0)
      expect(await l2Dai.totalSupply()).to.be.eq(initialTotalL2Supply - withdrawAmount)
      await expect(tx)
        .to.emit(l2DaiGateway, 'WithdrawalInitiated')
        .withArgs(
          l1Dai.address,
          sender.address,
          receiver.address,
          expectedWithdrawalId,
          expectedWithdrawalId,
          withdrawAmount,
        )
      expect(withdrawCrossChainCall.destAddr).to.eq(l1DaiBridge.address)
      expect(withdrawCrossChainCall.calldataForL1).to.eq(
        new L1DaiGateway__factory().interface.encodeFunctionData('finalizeInboundTransfer', [
          l1Dai.address,
          sender.address,
          receiver.address,
          withdrawAmount,
          ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [expectedWithdrawalId, defaultData]),
        ]),
      )
    })

    it('sends xdomain message and burns tokens when called through router', async () => {
      const [deployer, , l1DaiBridge, l1Dai, router, sender, receiver] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway, arbSysMock } = await setupWithdrawalTest({
        l1Dai,
        l1DaiBridge,
        router,
        user1: sender,
        deployer,
      })
      const routerEncodedData = defaultAbiCoder.encode(['address', 'bytes'], [sender.address, defaultData])

      const tx = await l2DaiGateway
        .connect(router)
        ['outboundTransfer(address,address,uint256,bytes)'](
          l1Dai.address,
          receiver.address,
          withdrawAmount,
          routerEncodedData,
        )
      const withdrawCrossChainCall = arbSysMock.smocked.sendTxToL1.calls[0]

      expect(await l2Dai.balanceOf(sender.address)).to.be.eq(initialTotalL2Supply - withdrawAmount)
      expect(await l2Dai.balanceOf(receiver.address)).to.be.eq(0)
      expect(await l2Dai.totalSupply()).to.be.eq(initialTotalL2Supply - withdrawAmount)
      await expect(tx)
        .to.emit(l2DaiGateway, 'WithdrawalInitiated')
        .withArgs(
          l1Dai.address,
          sender.address,
          receiver.address,
          expectedWithdrawalId,
          expectedWithdrawalId,
          withdrawAmount,
        )
      expect(withdrawCrossChainCall.destAddr).to.eq(l1DaiBridge.address)
      expect(withdrawCrossChainCall.calldataForL1).to.eq(
        new L1DaiGateway__factory().interface.encodeFunctionData('finalizeInboundTransfer', [
          l1Dai.address,
          sender.address,
          receiver.address,
          withdrawAmount,
          ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [expectedWithdrawalId, defaultData]),
        ]),
      )
    })

    it('reverts when called with a different token', async () => {
      const [sender, l1DaiBridge, l1Dai, router] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway } = await setupWithdrawalTest({
        l1Dai,
        l1DaiBridge,
        router,
        user1: sender,
        deployer: sender,
      })

      await expect(
        l2DaiGateway['outboundTransfer(address,address,uint256,bytes)'](
          l2Dai.address,
          sender.address,
          withdrawAmount,
          defaultData,
        ),
      ).to.be.revertedWith(errorMessages.tokenMismatch)
    })

    it('reverts when called with callHookData', async () => {
      const [sender, l1DaiBridge, l1Dai, router] = await ethers.getSigners()
      const { l2DaiGateway } = await setupWithdrawalTest({
        l1Dai,
        l1DaiBridge,
        router,
        user1: sender,
        deployer: sender,
      })

      await expect(
        l2DaiGateway['outboundTransfer(address,address,uint256,bytes)'](
          l1Dai.address,
          sender.address,
          withdrawAmount,
          defaultDataWithNotEmptyCallHookData,
        ),
      ).to.be.revertedWith(errorMessages.callHookDataNotAllowed)
    })

    it('reverts when bridge closed', async () => {
      const [sender, l1DaiBridge, l1Dai, router] = await ethers.getSigners()
      const { l2DaiGateway } = await setupWithdrawalTest({
        l1Dai,
        l1DaiBridge,
        router,
        user1: sender,
        deployer: sender,
      })

      await l2DaiGateway.connect(sender).close()

      await expect(
        l2DaiGateway['outboundTransfer(address,address,uint256,bytes)'](
          l1Dai.address,
          sender.address,
          withdrawAmount,
          defaultData,
        ),
      ).to.be.revertedWith(errorMessages.closed)
    })

    it('reverts when bridge doesnt have burn permissions on DAI', async () => {
      const [sender, l1DaiBridge, l1Dai, router] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway } = await setupWithdrawalTest({
        l1Dai,
        l1DaiBridge,
        router,
        user1: sender,
        deployer: sender,
      })

      // remove burn permissions
      await l2Dai.deny(l2DaiGateway.address)

      await expect(
        l2DaiGateway['outboundTransfer(address,address,uint256,bytes)'](
          l1Dai.address,
          sender.address,
          withdrawAmount,
          defaultData,
        ),
      ).to.be.revertedWith(errorMessages.insufficientAllowance)
    })

    it('reverts when user funds too low', async () => {
      const [sender, l1DaiBridge, l1Dai, router, user2] = await ethers.getSigners()
      const { l2DaiGateway } = await setupWithdrawalTest({
        l1Dai,
        l1DaiBridge,
        router,
        user1: sender,
        deployer: sender,
      })

      await expect(
        l2DaiGateway
          .connect(user2)
          ['outboundTransfer(address,address,uint256,bytes)'](
            l1Dai.address,
            sender.address,
            withdrawAmount,
            defaultData,
          ),
      ).to.be.revertedWith(errorMessages.insufficientFunds)
    })
  })

  describe('outboundTransfer(address,address,uint256,uint256,uint256,bytes)', () => {
    const withdrawAmount = 100
    const defaultData = '0x'
    const expectedWithdrawalId = 0
    const maxGas = 100
    const gasPriceBid = 200

    it('sends xdomain message and burns tokens', async () => {
      const [deployer, l1DaiBridge, l1Dai, router, sender] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway, arbSysMock } = await setupWithdrawalTest({
        l1Dai,
        l1DaiBridge,
        router,
        user1: sender,
        deployer,
      })

      const tx = await l2DaiGateway
        .connect(sender)
        ['outboundTransfer(address,address,uint256,uint256,uint256,bytes)'](
          l1Dai.address,
          sender.address,
          withdrawAmount,
          maxGas,
          gasPriceBid,
          defaultData,
        )
      const withdrawCrossChainCall = arbSysMock.smocked.sendTxToL1.calls[0]

      expect(await l2Dai.balanceOf(sender.address)).to.be.eq(initialTotalL2Supply - withdrawAmount)
      expect(await l2Dai.totalSupply()).to.be.eq(initialTotalL2Supply - withdrawAmount)
      await expect(tx)
        .to.emit(l2DaiGateway, 'WithdrawalInitiated')
        .withArgs(
          l1Dai.address,
          sender.address,
          sender.address,
          expectedWithdrawalId,
          expectedWithdrawalId,
          withdrawAmount,
        )
      expect(withdrawCrossChainCall.destAddr).to.eq(l1DaiBridge.address)
      expect(withdrawCrossChainCall.calldataForL1).to.eq(
        new L1DaiGateway__factory().interface.encodeFunctionData('finalizeInboundTransfer', [
          l1Dai.address,
          sender.address,
          sender.address,
          withdrawAmount,
          ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [expectedWithdrawalId, defaultData]),
        ]),
      )
    })
  })

  describe('close', () => {
    it('can be called by owner', async () => {
      const [owner, l1Dai, router] = await ethers.getSigners()
      const { l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: owner, router, deployer: owner })

      expect(await l2DaiGateway.isOpen()).to.be.eq(1)
      const closeTx = await l2DaiGateway.connect(owner).close()

      await expect(closeTx).to.emit(l2DaiGateway, 'Closed')

      expect(await l2DaiGateway.isOpen()).to.be.eq(0)
    })

    it('can be called multiple times by the owner but nothing changes', async () => {
      const [owner, l1Dai, router] = await ethers.getSigners()
      const { l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: owner, router, deployer: owner })

      await l2DaiGateway.connect(owner).close()
      expect(await l2DaiGateway.isOpen()).to.be.eq(0)

      await l2DaiGateway.connect(owner).close()
      expect(await l2DaiGateway.isOpen()).to.be.eq(0)
    })

    it('reverts when called not by the owner', async () => {
      const [owner, l1Dai, router, user1] = await ethers.getSigners()
      const { l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: owner, router, deployer: owner })

      await expect(l2DaiGateway.connect(user1).close()).to.be.revertedWith(errorMessages.notOwner)
    })
  })

  describe('calculateL2TokenAddress', () => {
    it('return l2Dai address when asked about dai', async () => {
      const [owner, l1Dai, router] = await ethers.getSigners()
      const { l2DaiGateway, l2Dai } = await setupTest({ l1Dai, l1DaiBridge: owner, router, deployer: owner })

      expect(await l2DaiGateway.calculateL2TokenAddress(l1Dai.address)).to.eq(l2Dai.address)
    })

    it('returns zero address for unknown tokens', async () => {
      const [owner, l1Dai, router] = await ethers.getSigners()
      const randomToken = await getRandomAddress()
      const { l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: owner, router, deployer: owner })

      expect(await l2DaiGateway.calculateL2TokenAddress(randomToken)).to.eq(ethers.constants.AddressZero)
    })
  })

  describe('constructor', () => {
    it('assigns all variables properly', async () => {
      const [l1Counterpart, router, l1Dai, l2Dai] = await getRandomAddresses()

      const l2DaiGateway = await simpleDeploy<L2DaiGateway__factory>('L2DaiGateway', [
        l1Counterpart,
        router,
        l1Dai,
        l2Dai,
      ])

      expect(await l2DaiGateway.l1Counterpart()).to.be.eq(l1Counterpart)
      expect(await l2DaiGateway.l2Router()).to.be.eq(router)
      expect(await l2DaiGateway.l1Dai()).to.be.eq(l1Dai)
      expect(await l2DaiGateway.l2Dai()).to.be.eq(l2Dai)
      expect(await l2DaiGateway.isOpen()).to.be.eq(1)
    })
  })

  it('has correct public interface', async () => {
    await assertPublicMutableMethods('L2DaiGateway', [
      'finalizeInboundTransfer(address,address,address,uint256,bytes)', // finalize deposit
      'outboundTransfer(address,address,uint256,bytes)', // withdraw
      'outboundTransfer(address,address,uint256,uint256,uint256,bytes)', // withdrawTo
      'close()',
      'rely(address)',
      'deny(address)',
    ])
    await assertPublicNotMutableMethods('L2DaiGateway', [
      'getOutboundCalldata(address,address,address,uint256,bytes)',
      'calculateL2TokenAddress(address)',

      // storage variables:
      'l1Counterpart()',
      'isOpen()',
      'l1Dai()',
      'l2Dai()',
      'l2Router()',
      'wards(address)',
      'counterpartGateway()',
    ])
  })

  testAuth({
    name: 'L2DaiGateway',
    getDeployArgs: async () => {
      const [l1Counterpart, router, l1Dai, l2Dai] = await getRandomAddresses()

      return [l1Counterpart, router, l1Dai, l2Dai]
    },
    authedMethods: [(c) => c.close()],
  })
})

async function setupTest(signers: {
  l1Dai: SignerWithAddress
  l1DaiBridge: SignerWithAddress
  router: SignerWithAddress
  deployer: SignerWithAddress
}) {
  const l2Dai = await simpleDeploy<Dai__factory>('Dai', [])
  const l2DaiGateway = await simpleDeploy<L2DaiGateway__factory>('L2DaiGateway', [
    signers.l1DaiBridge.address,
    signers.router.address,
    signers.l1Dai.address,
    l2Dai.address,
  ])
  await l2Dai.rely(l2DaiGateway.address)

  const l2Deployer = await getL2SignerFromL1(signers.deployer)
  await signers.deployer.sendTransaction({
    to: await l2Deployer.getAddress(),
    value: ethers.utils.parseUnits('0.1', 'ether'),
  })

  return {
    l2Dai,
    l2DaiGateway,
    l2Deployer,
  }
}

async function setupWithdrawalTest(signers: {
  l1Dai: SignerWithAddress
  l1DaiBridge: SignerWithAddress
  router: SignerWithAddress
  user1: SignerWithAddress
  deployer: SignerWithAddress
}) {
  const harness = await setupTest(signers)
  const arbSysMock = await deployArbitrumContractMock('ArbSys', {
    address: '0x0000000000000000000000000000000000000064',
  })
  await harness.l2Dai.mint(signers.user1.address, initialTotalL2Supply)

  return {
    ...harness,
    arbSysMock,
  }
}
