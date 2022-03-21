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

type FunctionFilter = (f: FunctionFragment) => boolean

export const NON_INSTRUMENTED_FUNCTION_FILTER: FunctionFilter = (f) => !f.format().startsWith('c_0x')
export const NON_MUTABLE_FUNCTION_FILTER: FunctionFilter = (f) => {
  return (
    NON_INSTRUMENTED_FUNCTION_FILTER(f) && // filter out instrumented methods
    f.stateMutability !== 'nonpayable' &&
    f.stateMutability !== 'payable'
  )
}
export const MUTABLE_FUNCTION_FILTER: FunctionFilter = (f) => {
  return (
    NON_INSTRUMENTED_FUNCTION_FILTER(f) && // filter out instrumented methods
    (f.stateMutability === 'nonpayable' || f.stateMutability === 'payable')
  )
}

export async function assertPublicMethods(
  name: string,
  expectedPublicMethods: string[],
  filter: FunctionFilter = NON_INSTRUMENTED_FUNCTION_FILTER,
) {
  const contract = await ethers.getContractFactory(name)
  const allModifiableFns = Object.values(contract.interface.functions)
    .filter(filter)
    .map((f) => f.format())
  expect(allModifiableFns.sort()).to.be.deep.eq(expectedPublicMethods.sort())
}
