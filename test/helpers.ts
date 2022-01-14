import { smockit } from '@eth-optimism/smock'
import { expect } from 'chai'
import { ContractFactory, Wallet } from 'ethers'
import { FunctionFragment } from 'ethers/lib/utils'
import { ethers } from 'hardhat'

export async function deployMock<T extends ContractFactory>(
  name: string,
  opts: {
    provider?: any
    address?: string
  } = {},
): Promise<ReturnType<T['deploy']> & { smocked: any }> {
  const factory = (await ethers.getContractFactory(name)) as any
  return await smockit(factory, opts)
}

export async function deployAbstractMock<T extends ContractFactory>(
  name: string,
  opts: {
    provider?: any
    address?: string
  } = {},
): Promise<ReturnType<T['deploy']> & { smocked: any }> {
  opts.address = opts.address || Wallet.createRandom().address
  const contract = (await ethers.getContractAt(name, opts.address)) as any
  return await smockit(contract, opts)
}

export function addressToBytes32(addr: string): string {
  return ethers.utils.hexlify(ethers.utils.zeroPad(addr, 32))
}

export const MUTABLE_FUNCTION_FILTER = (f: FunctionFragment) => {
  return (
    !f.format().startsWith('c_0x') && // filter out instrumented methods
    (f.stateMutability === 'nonpayable' || f.stateMutability === 'payable')
  )
}

export const NON_MUTABLE_FUNCTION_FILTER = (f: FunctionFragment) => {
  return (
    !f.format().startsWith('c_0x') && // filter out instrumented methods
    f.stateMutability !== 'nonpayable' &&
    f.stateMutability !== 'payable'
  )
}

export async function assertPublicMethods(
  name: string,
  expectedPublicMethods: string[],
  filter: (f: FunctionFragment) => boolean = (f) => !f.format().startsWith('c_0x'),
) {
  const contract = await ethers.getContractFactory(name)
  const allModifiableFns = Object.values(contract.interface.functions)
    .filter(filter)
    .map((f) => f.format())
  expect(allModifiableFns.sort()).to.be.deep.eq(expectedPublicMethods.sort())
}
