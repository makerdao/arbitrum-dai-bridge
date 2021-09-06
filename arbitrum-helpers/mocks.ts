import { deployContractMock } from '@makerdao/hardhat-utils'
import { ethers } from 'ethers'
import { join } from 'path'

export function deployArbitrumContractMock(
  name: string,
  opts?: {
    provider?: ethers.providers.BaseProvider
    address?: string
  },
) {
  const abiPath = join(__dirname, `./abis/${name}.json`)

  return deployContractMock(abiPath, opts) as any
}
