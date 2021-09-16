import { ContractFactory, Signer } from 'ethers'
import { ethers } from 'hardhat'
import { isEmpty } from 'lodash'

import { waitForTx } from '.'

export async function deployUsingFactory<T extends ContractFactory>(
  signer: Signer,
  factory: T,
  args: Parameters<T['deploy']>,
): Promise<ReturnType<T['deploy']>> {
  const contractFactory = new ethers.ContractFactory(factory.interface, factory.bytecode, signer)
  const contractDeployedCode = contractFactory.getDeployTransaction(...(args as any))
  const deployTx = signer.sendTransaction(contractDeployedCode)
  const minedTx = await waitForTx(deployTx)

  const contractDeployed = contractFactory.attach(minedTx.contractAddress)

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
