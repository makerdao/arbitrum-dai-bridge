import { assert } from 'ts-essentials'
import { ContractFactory, ethers, providers, Signer, Wallet } from 'ethers'
import { readFileSync } from 'fs'
import { artifacts as hhArtifacts } from 'hardhat'
import hh from 'hardhat'
import { isEmpty } from 'lodash'
import { join } from 'path'

import { connectWallets, getAdminWallet, getRandomWallets } from './wallets'

export function q18(n: number) {
  return ethers.BigNumber.from(10).pow(18).mul(n).toString()
}

export const MAX_UINT256 = ethers.BigNumber.from(2).pow(256).sub(1)

export const DUMMY_ADDRESS = '0x' + '1234'.repeat(10)

export const ZERO_GAS_OPTS = { gasPrice: 0 }

// export async function waitToRelayTxsToL2(l1OriginatingTx: Promise<any>, watcher: any) {
//   console.log('Using watcher to wait for L1->L2 relay...')
//   const res = await l1OriginatingTx
//   await res.wait()

//   const [l2ToL1XDomainMsgHash] = await watcher.getMessageHashesFromL1Tx(res.hash)
//   console.log(`Found cross-domain message ${l2ToL1XDomainMsgHash} in L1 tx.  Waiting for relay to L2...`)
//   await watcher.getL2TransactionReceipt(l2ToL1XDomainMsgHash)
// }

// uses eth-optimism watcher tool to pick up events on both chains
// export async function waitToRelayMessageToL1(l2OriginatingTx: Promise<any>, watcher: any) {
//   console.log('Using watcher to wait for L2->L1 relay...')
//   const res = await l2OriginatingTx
//   await res.wait()

//   const [l2ToL1XDomainMsgHash] = await watcher.getMessageHashesFromL2Tx(res.hash)
//   console.log(`Found cross-domain message ${l2ToL1XDomainMsgHash} in L2 tx.  Waiting for relay to L1...`)
//   await watcher.getL1TransactionReceipt(l2ToL1XDomainMsgHash)
// }

// export async function printRollupStatus(l1Provider: providers.BaseProvider) {
//   const CTC = new ethers.Contract(
//     optimismConfig.OVM_CanonicalTransactionChain,
//     artifacts.l1.canonicalTxChain.abi,
//     l1Provider,
//   )
//   const STC = new ethers.Contract(
//     optimismConfig.OVM_StateCommitmentChain,
//     artifacts.l1.stateCommitmentChain.abi,
//     l1Provider,
//   )

//   const ctcAllElements = await CTC.getTotalElements()
//   const ctcQueuedElement = await CTC.getNumPendingQueueElements()
//   const stcAllElements = await STC.getTotalElements()

//   console.log('Canonical Tx Chain all elements: ', ctcAllElements.toString())
//   console.log('Canonical Tx Chain queued elements: ', ctcQueuedElement.toString())
//   console.log('State Commitment Chain all elements: ', stcAllElements.toString())
// }

export async function deployUsingFactory<T extends ContractFactory>(
  signer: Signer,
  factory: T,
  args: Parameters<T['deploy']>,
): Promise<ReturnType<T['deploy']>> {
  const contractFactory = new ethers.ContractFactory(factory.interface, factory.bytecode, signer)
  const contractDeployed = await contractFactory.deploy(...(args as any))

  await contractDeployed.deployed()

  return contractDeployed as any
}

export async function deployUsingFactoryAndVerify<T extends ContractFactory>(
  signer: Signer,
  factory: T,
  args: Parameters<T['deploy']>,
): Promise<ReturnType<T['deploy']>> {
  const contractDeployed = await deployUsingFactory(signer, factory, args)

  console.log(
    `npx hardhat verify ${contractDeployed.address} ${args
      .filter((a: any) => a.gasPrice === undefined && !isEmpty(a))
      .join(' ')}`,
  )

  return contractDeployed as any
}

export async function waitForTx(tx: Promise<any>): Promise<providers.TransactionReceipt> {
  const resolvedTx = await tx
  return await resolvedTx.wait()
}

export function getRequiredEnv(key: string): string {
  const value = process.env[key]
  assert(value, `Please provide ${key} in .env file`)

  return value
}

export function getOptionalEnv(key: string): string | undefined {
  return process.env[key]
}
