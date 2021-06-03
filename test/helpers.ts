import { smockit } from '@eth-optimism/smock'
import { ContractFactory, Wallet } from 'ethers'
import { readFileSync } from 'fs'
import { ethers } from 'hardhat'
import { join } from 'path'

export const makeHexString = (byte: string, len: number): string => {
  return '0x' + byte.repeat(len)
}

export const makeAddress = (byte: string): string => {
  return makeHexString(byte, 20)
}

export const MAX_UINT256 = ethers.BigNumber.from(2).pow(256).sub(1)
export const ZERO_ADDRESS = makeAddress('00')
export const NON_ZERO_ADDRESS = makeAddress('11')
export async function getRandomAddress(): Promise<string> {
  return await Wallet.createRandom().getAddress()
}
export async function getRandomAddresses(n: number = 10): Promise<string[]> {
  const arr = [...Array(n).keys()]

  return await Promise.all(arr.map(getRandomAddress))
}

export function q18(n: number) {
  return ethers.BigNumber.from(10).pow(18).mul(n).toString()
}

export async function deploy<T extends ContractFactory>(
  name: string,
  args?: Parameters<T['deploy']>,
): Promise<ReturnType<T['deploy']>> {
  const factory = (await ethers.getContractFactory(name)) as any
  return factory.deploy(...(args || []))
}

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

export async function deployArbitrumContractMock<T extends ContractFactory>(
  name: string,
  opts: {
    provider?: any
    address?: string
  } = {},
): Promise<ReturnType<T['deploy']> & { smocked: any }> {
  const artifact = JSON.parse(readFileSync(join(__dirname, `./test-artifacts/${name}.json`), 'utf-8'))
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode) as any
  return await smockit(factory, opts)
}
