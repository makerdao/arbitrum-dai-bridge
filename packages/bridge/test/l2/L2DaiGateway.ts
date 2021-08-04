import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { ethers } from 'hardhat'

import { ArbDai__factory, L1DaiGateway__factory, L2DaiGateway__factory } from '../../typechain'
import { testAuth } from '../helpers/auth'
import {
  assertPublicMutableMethods,
  assertPublicNotMutableMethods,
  deploy,
  deployArbitrumContractMock,
  getRandomAddresses,
} from '../helpers/helpers'

const initialTotalL2Supply = 3000
const errorMessages = {
  closed: 'L2DaiGateway/closed',
  tokenMismatch: 'L2DaiGateway/token-not-dai',
  insufficientAllowance: 'Dai/insufficient-allowance',
  insufficientFunds: 'Dai/insufficient-balance',
  notOwner: 'L2DaiGateway/not-authorized',
  notOwnerOfDai: 'Dai/not-authorized',
  l1CounterpartMismatch: 'ONLY_COUNTERPART_GATEWAY',
  inboundEscrowAndCallGuard: 'Mint can only be called by self',
  postUpgradeInitGuard: 'ALREADY_INIT',
}

describe('L2DaiGateway', () => {
  describe('finalizeInboundTransfer', () => {
    const depositAmount = 100
    const defaultData = ethers.utils.defaultAbiCoder.encode(['bytes', 'bytes'], ['0x12', '0x'])

    it('mints tokens', async () => {
      const [sender, l1Dai, router] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: sender, router })
      const receiverAddress = sender.address

      const tx = await l2DaiGateway.finalizeInboundTransfer(
        l1Dai.address,
        sender.address,
        receiverAddress,
        depositAmount,
        defaultData,
      )

      expect(await l2Dai.balanceOf(receiverAddress)).to.be.eq(depositAmount)
      expect(await l2Dai.totalSupply()).to.be.eq(depositAmount)
      await expect(tx)
        .to.emit(l2DaiGateway, 'InboundTransferFinalized')
        .withArgs(l1Dai.address, sender.address, receiverAddress, l2Dai.address, depositAmount, defaultData)
      // todo assert TransferAndCallTriggered was NOT called
    })

    it('mints tokens for a 3rd party', async () => {
      const [sender, receiver, l1Dai, router] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: sender, router })

      const tx = await l2DaiGateway.finalizeInboundTransfer(
        l1Dai.address,
        sender.address,
        receiver.address,
        depositAmount,
        defaultData,
      )

      expect(await l2Dai.balanceOf(receiver.address)).to.be.eq(depositAmount)
      expect(await l2Dai.totalSupply()).to.be.eq(depositAmount)
      await expect(tx)
        .to.emit(l2DaiGateway, 'InboundTransferFinalized')
        .withArgs(l1Dai.address, sender.address, receiver.address, l2Dai.address, depositAmount, defaultData)
      // todo assert TransferAndCallTriggered was NOT called
    })

    it('calls receiver with data when present', async () => {
      const [sender, l1Dai, router] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: sender, router })
      const callHookData = ethers.utils.defaultAbiCoder.encode(['uint256'], [42])
      const data = ethers.utils.defaultAbiCoder.encode(['bytes', 'bytes'], ['0x', callHookData])
      const receiverMock = await deployArbitrumContractMock('IERC677Receiver')
      receiverMock.smocked.onTokenTransfer.will.return.with()

      const tx = await l2DaiGateway.finalizeInboundTransfer(
        l1Dai.address,
        sender.address,
        receiverMock.address,
        depositAmount,
        data,
      )
      const onDepositMessengerCall = receiverMock.smocked.onTokenTransfer.calls[0]

      expect(await l2Dai.balanceOf(receiverMock.address)).to.be.eq(depositAmount)
      expect(await l2Dai.totalSupply()).to.be.eq(depositAmount)
      expect(onDepositMessengerCall._sender).to.be.eq(sender.address)
      expect(onDepositMessengerCall._value).to.be.eq(depositAmount)
      expect(onDepositMessengerCall.data).to.be.eq(callHookData)
      await expect(tx)
        .to.emit(l2DaiGateway, 'InboundTransferFinalized')
        .withArgs(l1Dai.address, sender.address, receiverMock.address, l2Dai.address, depositAmount, data)
      await expect(tx)
        .to.emit(l2DaiGateway, 'TransferAndCallTriggered')
        .withArgs(true, sender.address, receiverMock.address, depositAmount, callHookData)
    })

    it('calls receiver with data when present and works even if receiver reverts', async () => {
      const [sender, l1Dai, router] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: sender, router })
      const callHookData = ethers.utils.defaultAbiCoder.encode(['uint256'], [42])
      const data = ethers.utils.defaultAbiCoder.encode(['bytes', 'bytes'], ['0x', callHookData])
      const receiverMock = await deployArbitrumContractMock('IERC677Receiver')
      receiverMock.smocked.onTokenTransfer.will.revert.with()

      const tx = await l2DaiGateway.finalizeInboundTransfer(
        l1Dai.address,
        sender.address,
        receiverMock.address,
        depositAmount,
        data,
      )
      const onWithdrawalMessengerCall = receiverMock.smocked.onTokenTransfer.calls[0]

      expect(await l2Dai.balanceOf(sender.address)).to.be.eq(depositAmount) // if reverted, sender gets deposited
      expect(await l2Dai.totalSupply()).to.be.eq(depositAmount)
      expect(onWithdrawalMessengerCall._sender).to.be.eq(sender.address)
      expect(onWithdrawalMessengerCall._value).to.be.eq(depositAmount)
      expect(onWithdrawalMessengerCall.data).to.be.eq(callHookData)
      await expect(tx)
        .to.emit(l2DaiGateway, 'InboundTransferFinalized')
        .withArgs(l1Dai.address, sender.address, receiverMock.address, l2Dai.address, depositAmount, data)
      await expect(tx)
        .to.emit(l2DaiGateway, 'TransferAndCallTriggered')
        .withArgs(false, sender.address, receiverMock.address, depositAmount, callHookData)
    })

    it('fails when receiver is not a contract but withdraw was called with callHookData', async () => {
      const [sender, l1Dai, router, receiverEOA] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: sender, router })
      const callHookData = ethers.utils.defaultAbiCoder.encode(['uint256'], [42])
      const data = ethers.utils.defaultAbiCoder.encode(['bytes', 'bytes'], ['0x', callHookData])

      const tx = await l2DaiGateway.finalizeInboundTransfer(
        l1Dai.address,
        sender.address,
        receiverEOA.address,
        depositAmount,
        data,
      )

      expect(await l2Dai.balanceOf(sender.address)).to.be.eq(depositAmount) // if reverted, sender gets deposited
      expect(await l2Dai.totalSupply()).to.be.eq(depositAmount)
      await expect(tx)
        .to.emit(l2DaiGateway, 'InboundTransferFinalized')
        .withArgs(l1Dai.address, sender.address, receiverEOA.address, l2Dai.address, depositAmount, data)
      await expect(tx)
        .to.emit(l2DaiGateway, 'TransferAndCallTriggered')
        .withArgs(false, sender.address, receiverEOA.address, depositAmount, callHookData)
    })

    it('mints tokens even when closed', async () => {
      const [sender, l1Dai, router] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: sender, router })
      const receiverAddress = sender.address

      await l2DaiGateway.close()
      const tx = await l2DaiGateway.finalizeInboundTransfer(
        l1Dai.address,
        sender.address,
        receiverAddress,
        depositAmount,
        defaultData,
      )

      expect(await l2Dai.balanceOf(receiverAddress)).to.be.eq(depositAmount)
      expect(await l2Dai.totalSupply()).to.be.eq(depositAmount)
      await expect(tx)
        .to.emit(l2DaiGateway, 'InboundTransferFinalized')
        .withArgs(l1Dai.address, sender.address, receiverAddress, l2Dai.address, depositAmount, defaultData)
    })

    it('reverts when withdrawing not supported tokens', async () => {
      const [sender, l1Dai, router, dummyAcc] = await ethers.getSigners()
      const { l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: sender, router })
      const receiverAddress = sender.address

      await expect(
        l2DaiGateway.finalizeInboundTransfer(
          dummyAcc.address,
          sender.address,
          receiverAddress,
          depositAmount,
          defaultData,
        ),
      ).to.be.revertedWith(errorMessages.tokenMismatch)
    })

    it('reverts when DAI minting access was revoked', async () => {
      const [sender, l1Dai, router] = await ethers.getSigners()
      const { l2DaiGateway, l2Dai } = await setupTest({ l1Dai, l1DaiBridge: sender, router })
      const receiverAddress = sender.address

      await l2Dai.deny(l2DaiGateway.address)

      await expect(
        l2DaiGateway.finalizeInboundTransfer(
          l1Dai.address,
          sender.address,
          receiverAddress,
          depositAmount,
          defaultData,
        ),
      ).to.be.revertedWith(errorMessages.notOwnerOfDai)
    })

    // not implemented yet
    it.skip('SKIP reverts when called not by inbox', async () => {
      const [sender, l1Dai, router, dummyAcc] = await ethers.getSigners()
      const { l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: sender, router })
      const receiverAddress = sender.address

      await expect(
        l2DaiGateway
          .connect(dummyAcc)
          .finalizeInboundTransfer(l1Dai.address, sender.address, receiverAddress, depositAmount, defaultData),
      ).to.be.revertedWith(errorMessages.notOwner)
    })
    // double check this
    it('reverts when called by inbox but not relying message from l1DaiGateway', async () => {
      const [sender, l1Dai, router, dummyAcc] = await ethers.getSigners()
      const { l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: dummyAcc, router })

      await expect(
        l2DaiGateway.finalizeInboundTransfer(
          dummyAcc.address,
          sender.address,
          sender.address,
          depositAmount,
          defaultData,
        ),
      ).to.be.revertedWith(errorMessages.l1CounterpartMismatch)
    })
  })

  describe('outboundTransfer(address,address,uint256,bytes)', () => {
    const withdrawAmount = 100
    const defaultData = '0x'
    const expectedWithdrawalId = 0

    it('sends xchain message and burns tokens', async () => {
      const [_deployer, l1DaiBridge, l1Dai, router, sender] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway, arbSysMock } = await setupWithdrawalTest({
        l1Dai,
        l1DaiBridge,
        router,
        user1: sender,
      })

      const tx = await l2DaiGateway
        .connect(sender)
        ['outboundTransfer(address,address,uint256,bytes)'](l1Dai.address, sender.address, withdrawAmount, defaultData)
      const withdrawCrossChainCall = arbSysMock.smocked.sendTxToL1.calls[0]

      expect(await l2Dai.balanceOf(sender.address)).to.be.eq(initialTotalL2Supply - withdrawAmount)
      expect(await l2Dai.totalSupply()).to.be.eq(initialTotalL2Supply - withdrawAmount)
      await expect(tx)
        .to.emit(l2DaiGateway, 'OutboundTransferInitiated')
        .withArgs(l1Dai.address, sender.address, sender.address, expectedWithdrawalId, withdrawAmount, defaultData)
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

    it('sends xchain message and burns tokens for 3rd party', async () => {
      const [_deployer, l1DaiBridge, l1Dai, router, sender, receiver] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway, arbSysMock } = await setupWithdrawalTest({
        l1Dai,
        l1DaiBridge,
        router,
        user1: sender,
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
        .to.emit(l2DaiGateway, 'OutboundTransferInitiated')
        .withArgs(l1Dai.address, sender.address, receiver.address, expectedWithdrawalId, withdrawAmount, defaultData)
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

    it('reverts when bridge closed', async () => {
      const [sender, l1DaiBridge, l1Dai, router] = await ethers.getSigners()
      const { l2DaiGateway } = await setupWithdrawalTest({
        l1Dai,
        l1DaiBridge,
        router,
        user1: sender,
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

    it('sends xchain message and burns tokens', async () => {
      const [_deployer, l1DaiBridge, l1Dai, router, sender] = await ethers.getSigners()
      const { l2Dai, l2DaiGateway, arbSysMock } = await setupWithdrawalTest({
        l1Dai,
        l1DaiBridge,
        router,
        user1: sender,
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
        .to.emit(l2DaiGateway, 'OutboundTransferInitiated')
        .withArgs(l1Dai.address, sender.address, sender.address, expectedWithdrawalId, withdrawAmount, defaultData)
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
      const { l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: owner, router })

      expect(await l2DaiGateway.isOpen()).to.be.eq(1)
      const closeTx = await l2DaiGateway.connect(owner).close()

      await expect(closeTx).to.emit(l2DaiGateway, 'Closed')

      expect(await l2DaiGateway.isOpen()).to.be.eq(0)
    })

    it('can be called multiple times by the owner but nothing changes', async () => {
      const [owner, l1Dai, router] = await ethers.getSigners()
      const { l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: owner, router })

      await l2DaiGateway.connect(owner).close()
      expect(await l2DaiGateway.isOpen()).to.be.eq(0)

      await l2DaiGateway.connect(owner).close()
      expect(await l2DaiGateway.isOpen()).to.be.eq(0)
    })

    it('reverts when called not by the owner', async () => {
      const [owner, l1Dai, router, user1] = await ethers.getSigners()
      const { l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: owner, router })

      await expect(l2DaiGateway.connect(user1).close()).to.be.revertedWith(errorMessages.notOwner)
    })
  })

  describe('constructor', () => {
    it('assigns all variables properly', async () => {
      const [l1Counterpart, router, l1Dai, l2Dai] = await getRandomAddresses()

      const l2DaiGateway = await deploy<L2DaiGateway__factory>('L2DaiGateway', [l1Counterpart, router, l1Dai, l2Dai])

      expect(await l2DaiGateway.counterpartGateway()).to.be.eq(l1Counterpart)
      expect(await l2DaiGateway.router()).to.be.eq(router)
      expect(await l2DaiGateway.l1Dai()).to.be.eq(l1Dai)
      expect(await l2DaiGateway.l2Dai()).to.be.eq(l2Dai)
      expect(await l2DaiGateway.isOpen()).to.be.eq(1)
    })
  })

  describe('inboundEscrowAndCall', () => {
    it("can't be called from the outside", async () => {
      const [owner, l1Dai, router] = await ethers.getSigners()
      const { l2DaiGateway, l2Dai } = await setupTest({ l1Dai, l1DaiBridge: owner, router })

      await expect(
        l2DaiGateway.inboundEscrowAndCall(l2Dai.address, 100, owner.address, owner.address, '0x'),
      ).to.be.revertedWith(errorMessages.inboundEscrowAndCallGuard)
    })
  })

  describe('postUpgradeInit', () => {
    it("can't be called from the outside", async () => {
      const [owner, l1Dai, router] = await ethers.getSigners()
      const { l2DaiGateway } = await setupTest({ l1Dai, l1DaiBridge: owner, router })

      await expect(l2DaiGateway.postUpgradeInit()).to.be.revertedWith(errorMessages.postUpgradeInitGuard)
    })
  })

  it('has correct public interface', async () => {
    await assertPublicMutableMethods('L2DaiGateway', [
      'finalizeInboundTransfer(address,address,address,uint256,bytes)', // finalize deposit
      'outboundTransfer(address,address,uint256,bytes)', // withdraw
      'outboundTransfer(address,address,uint256,uint256,uint256,bytes)', // withdrawTo
      'inboundEscrowAndCall(address,uint256,address,address,bytes)', // not really public
      'postUpgradeInit()', // @todo not sure why this one is needed
      'close()',
      'rely(address)',
      'deny(address)',
    ])
    await assertPublicNotMutableMethods('L2DaiGateway', [
      'calculateL2TokenAddress(address)',
      'gasReserveIfCallRevert()', // @todo test this
      'getOutboundCalldata(address,address,address,uint256,bytes)',

      // ęxposed contract state
      'counterpartGateway()',
      'isOpen()',
      'exitNum()',
      'l1Dai()',
      'l2Dai()',
      'router()',
      'wards(address)',
    ])
  })

  testAuth(
    'L2DaiGateway',
    async () => {
      const [l1Counterpart, router, l1Dai, l2Dai] = await getRandomAddresses()

      return [l1Counterpart, router, l1Dai, l2Dai]
    },
    [(c) => c.close()],
  )
})

async function setupTest(signers: {
  l1Dai: SignerWithAddress
  l1DaiBridge: SignerWithAddress
  router: SignerWithAddress
}) {
  const l2Dai = await deploy<ArbDai__factory>('ArbDai', [signers.l1Dai.address])
  const l2DaiGateway = await deploy<L2DaiGateway__factory>('L2DaiGateway', [
    signers.l1DaiBridge.address,
    signers.router.address,
    signers.l1Dai.address,
    l2Dai.address,
  ])
  await l2Dai.rely(l2DaiGateway.address)

  return {
    l2Dai,
    l2DaiGateway,
  }
}

async function setupWithdrawalTest(signers: {
  l1Dai: SignerWithAddress
  l1DaiBridge: SignerWithAddress
  router: SignerWithAddress
  user1: SignerWithAddress
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
