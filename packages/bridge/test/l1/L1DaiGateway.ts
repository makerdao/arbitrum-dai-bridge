import { assertPublicMethods } from '../helpers/helpers'

const initialTotalL1Supply = 3000
const depositAmount = 100
const defaultGas = 0
const defaultData = '0x'

const errorMessages = {}

describe('L1DaiGateway', () => {
  describe('outboundTransfer()', () => {
    it('escrows funds and sends xchain message')
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

    it('sends funds from the escrow')
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
