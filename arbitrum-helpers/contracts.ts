import { ContractFactory, ethers } from 'ethers'
import { readFileSync } from 'fs'
import { join } from 'path'

export const arbitrumL2CoreContracts = {
  arbRetryableTx: '0x000000000000000000000000000000000000006E',
  nodeInterface: '0x00000000000000000000000000000000000000C8',
}

export function getArbitrumCoreContracts(l2: ethers.providers.BaseProvider) {
  return {
    arbRetryableTx: new ethers.Contract(
      arbitrumL2CoreContracts.arbRetryableTx,
      require('./abis/ArbRetryableTx.json').abi,
      l2,
    ),
    nodeInterface: new ethers.Contract(
      arbitrumL2CoreContracts.nodeInterface,
      require('./abis/NodeInterface.json').abi,
      l2,
    ),
  }
}

export function getArbitrumArtifactFactory<T extends ContractFactory>(name: string): T {
  const artifact = getArbitrumArtifact(name)

  return new ethers.ContractFactory(artifact.abi, artifact.bytecode) as any
}

export function getArbitrumArtifact(name: string): any {
  const artifactPath = join(__dirname, './artifacts', `${name}.json`)
  const artifactRaw = readFileSync(artifactPath, 'utf-8')
  const artifact = JSON.parse(artifactRaw)

  return artifact
}
