/*
 * Copyright 2019-2020, Offchain Labs, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-env node, mocha */
import { ethers } from 'hardhat'
import { assert, expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import { Contract, ContractFactory } from 'ethers'
import { getAddressOfNextDeployedContract } from '../test/helpers/address'

describe('Bridge peripherals end-to-end Dai gateway', () => {
  let accounts: SignerWithAddress[]

  let l1RouterTestBridge: Contract
  let l2RouterTestBridge: Contract
  let l1TestBridge: Contract
  let l2TestBridge: Contract
  let l1Dai: Contract
  let l2Dai: Contract

  const maxSubmissionCost = 0
  const maxGas = 1000000000
  const gasPrice = 0

  before(async function () {
    accounts = await ethers.getSigners()

    const TestDai: ContractFactory = await ethers.getContractFactory('Dai')

    l1Dai = await TestDai.deploy()
    l1Dai = await l1Dai.deployed()

    console.log('1')
    const L2Dai: ContractFactory = await ethers.getContractFactory('ArbDai')
    console.log('l1Dai.address', l1Dai.address)
    l2Dai = await L2Dai.deploy(l1Dai.address)
    await l2Dai.deployed()
    console.log('2')

    // l1 side deploy
    const L1RouterTestBridge: ContractFactory = await ethers.getContractFactory('L1GatewayRouter')
    l1RouterTestBridge = await L1RouterTestBridge.deploy()

    console.log('3')
    const L1TestBridge: ContractFactory = await ethers.getContractFactory('L1DaiGatewayTester')
    const futureAddressOfL2Bridge = await getAddressOfNextDeployedContract(accounts[0], 2)
    console.log('futureAddressOfL2Bridge', futureAddressOfL2Bridge)
    l1TestBridge = await L1TestBridge.deploy(
      futureAddressOfL2Bridge,
      l1RouterTestBridge.address,
      accounts[0].address, // inbox
      l1Dai.address,
      l2Dai.address,
      accounts[1].address, // escrow
    )
    console.log('4')

    const L2RouterTestBridge: ContractFactory = await ethers.getContractFactory('L2GatewayRouter')
    l2RouterTestBridge = await L2RouterTestBridge.deploy()

    // l2 side deploy

    const L2TestBridge: ContractFactory = await ethers.getContractFactory('L2DaiGatewayTester')
    l2TestBridge = await L2TestBridge.deploy(
      l1TestBridge.address,
      l2RouterTestBridge.address,
      l1Dai.address,
      l2Dai.address,
    )
    console.log('futureAddressOfL2Bridge', l2TestBridge.address)
    console.log('5')

    await l2Dai.rely(l2TestBridge.address)
    await l1Dai.connect(accounts[1]).approve(l1TestBridge.address, 1000000)

    await l1RouterTestBridge.functions.initialize(
      accounts[0].address,
      l1TestBridge.address, // defaultGateway
      '0x0000000000000000000000000000000000000000', // no whitelist
      l2RouterTestBridge.address, // counterparty
      accounts[0].address, // inbox
    )

    const l2DefaultGateway = await l1TestBridge.counterpartGateway()
    await l2RouterTestBridge.functions.initialize(l1RouterTestBridge.address, l2DefaultGateway)
  })

  it('should deposit tokens', async function () {
    // send escrowed tokens to bridge
    const tokenAmount = 100
    await l1Dai.mint(accounts[0].address, tokenAmount)

    const initialDepositTokens = await l1Dai.balanceOf(accounts[0].address)
    assert.equal(initialDepositTokens, tokenAmount, 'Tokens not deposited')

    await l1Dai.approve(l1TestBridge.address, tokenAmount)

    const data = ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [maxSubmissionCost, '0x'])

    const expectedRouter = await l1RouterTestBridge.getGateway(l1Dai.address)
    assert.equal(expectedRouter, l1TestBridge.address, 'Router not setup correctly')

    const l2ExpectedAddress = await l1RouterTestBridge.calculateL2TokenAddress(l1Dai.address)
    assert.equal(l2ExpectedAddress, l2Dai.address, 'Not expected l2 Dai address')

    const tx = await l1RouterTestBridge.outboundTransfer(
      l1Dai.address,
      accounts[0].address,
      tokenAmount,
      maxGas,
      gasPrice,
      data,
    )

    const escrowedTokens = await l1Dai.balanceOf(accounts[1].address)
    assert.equal(escrowedTokens, 100, 'Tokens not escrowed')

    const l2TokenAddress = await l2RouterTestBridge.calculateL2TokenAddress(l1Dai.address)
    assert.equal(l2TokenAddress, l2Dai.address, 'Token Pair not correct')
    const l2Balance = await l2Dai.balanceOf(accounts[0].address)
    assert.equal(l2Balance, tokenAmount, 'Tokens not minted')
  })

  it('should withdraw tokens', async function () {
    const tokenAmount = 100
    await l1Dai.mint(accounts[0].address, tokenAmount)

    const initialDepositTokens = await l1Dai.balanceOf(accounts[0].address)
    assert.equal(initialDepositTokens, tokenAmount, 'Tokens not deposited')

    await l1Dai.approve(l1TestBridge.address, tokenAmount)

    const data = ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [maxSubmissionCost, '0x'])

    const expectedRouter = await l1RouterTestBridge.getGateway(l1Dai.address)
    assert.equal(expectedRouter, l1TestBridge.address, 'Router not setup correctly')

    const l2ExpectedAddress = await l1RouterTestBridge.calculateL2TokenAddress(l1Dai.address)
    assert.equal(l2ExpectedAddress, l2Dai.address, 'Not expected l2 Dai address')

    const tx = await l1RouterTestBridge.outboundTransfer(
      l1Dai.address,
      accounts[0].address,
      tokenAmount,
      maxGas,
      gasPrice,
      data,
    )

    const prevUserBalance = await l1Dai.balanceOf(accounts[0].address)

    await l2Dai.approve(l2TestBridge.address, tokenAmount)

    const withdrawTx = await l2TestBridge.functions['outboundTransfer(address,address,uint256,bytes)'](
      l1Dai.address,
      accounts[0].address,
      tokenAmount,
      '0x',
    )

    const postUserBalance = await l1Dai.balanceOf(accounts[0].address)

    assert.equal(prevUserBalance.toNumber() + tokenAmount, postUserBalance.toNumber(), 'Tokens not escrowed')
  })

  // skip b/c dai is always deployed
  it.skip('should withdraw tokens if no token is deployed', async function () {
    const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
    // set L2 Dai to address zero to test if force withdraw is triggered when
    // no contract is deployed
    await l2TestBridge.setL2DaiAddress(ZERO_ADDR)

    // send escrowed tokens to bridge
    const tokenAmount = 100
    await l1Dai.deposit({ value: tokenAmount })
    await l1Dai.approve(l1TestBridge.address, tokenAmount)

    const prevUserBalance = await l1Dai.balanceOf(accounts[0].address)
    const prevAllowance = await l1Dai.allowance(accounts[0].address, l1TestBridge.address)

    const data = ethers.utils.defaultAbiCoder.encode(['uint256', 'bytes'], [maxSubmissionCost, '0x'])

    await l1RouterTestBridge.outboundTransfer(l1Dai.address, accounts[0].address, tokenAmount, maxGas, gasPrice, data)

    const postUserBalance = await l1Dai.balanceOf(accounts[0].address)
    const postAllowance = await l1Dai.allowance(accounts[0].address, l1TestBridge.address)

    assert.equal(prevUserBalance.toNumber(), postUserBalance.toNumber(), 'Tokens not withdrawn')

    assert.equal(prevAllowance.toNumber() - tokenAmount, postAllowance.toNumber(), 'Tokens not spent in allowance')
    // unset the custom l2 address as to not affect other tests
    await l2TestBridge.setL2DaiAddress(l2Dai.address)
  })
})
