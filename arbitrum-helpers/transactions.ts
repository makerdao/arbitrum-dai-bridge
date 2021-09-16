import { ContractTransaction, providers } from 'ethers'

import { delay } from './networks/RetryProvider'

export async function waitForTx(
  tx: Promise<ContractTransaction>,
  _confirmations?: number,
): Promise<providers.TransactionReceipt> {
  const resolvedTx = await tx
  const confirmations = _confirmations ?? chainIdToConfirmationsNeededForFinalization(resolvedTx.chainId)

  // there's a tmp bug on arbitrum testnet
  if (resolvedTx.chainId === 421611) {
    console.log('Waiting for arbitrum tx to finalize...')
    await delay(60000)
    console.log('Waiting for arbitrum tx to finalize... DONE')
  }
  // we retry .wait b/c sometimes it fails for the first time
  try {
    return await resolvedTx.wait(confirmations)
  } catch (e) {}
  return await resolvedTx.wait(confirmations)
}

function chainIdToConfirmationsNeededForFinalization(chainId: number): number {
  const defaultWhenReorgsPossible = 3
  const defaultForInstantFinality = 0

  // covers mainnet and public testnets
  if (chainId < 6) {
    return defaultWhenReorgsPossible
  } else {
    return defaultForInstantFinality
  }
}
