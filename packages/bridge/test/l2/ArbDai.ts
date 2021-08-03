import { expect } from 'chai'
import { ethers } from 'hardhat'

import { ArbDai__factory } from '../../typechain'
import { testAuth } from '../helpers/auth'
import { assertPublicMutableMethods, deploy, getRandomAddresses } from '../helpers/helpers'

describe('ArbDai', () => {
  describe('constructor', () => {
    it('assigns properties correctly', async () => {
      const [_deployer, l1Dai] = await ethers.getSigners()
      const l2DArbDai = await deploy<ArbDai__factory>('ArbDai', [l1Dai.address])

      expect(await l2DArbDai.l1Address()).to.be.eq(l1Dai.address)
    })
  })

  it('has correct public interface', async () => {
    await assertPublicMutableMethods('ArbDai', [
      'rely(address)',
      'deny(address)',
      'approve(address,uint256)',
      'burn(address,uint256)',
      'bridgeBurn(address,uint256)',
      'decreaseAllowance(address,uint256)',
      'increaseAllowance(address,uint256)',
      'mint(address,uint256)',
      'bridgeMint(address,uint256)',
      'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',
      'transfer(address,uint256)',
      'transferFrom(address,address,uint256)',
    ])
  })

  testAuth(
    'ArbDai',
    async () => [(await getRandomAddresses())[0]],
    [
      async (c) => {
        const [to] = await getRandomAddresses()
        return c.mint(to, 1)
      },
      async (c) => {
        const [to] = await getRandomAddresses()
        return c.bridgeMint(to, 1)
      },
    ],
    false,
  )
})
