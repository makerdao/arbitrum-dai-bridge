import { Signer } from 'ethers'
import { getContractAddress } from 'ethers/lib/utils'

export async function getAddressOfNextDeployedContract(signer: Signer, offset: number = 0): Promise<string> {
  return getContractAddress({
    from: await signer.getAddress(),
    nonce: (await signer.getTransactionCount()) + offset,
  })
}
