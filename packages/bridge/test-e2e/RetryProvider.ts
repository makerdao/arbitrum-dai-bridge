import { providers, utils } from 'ethers'

export class RetryProvider extends providers.JsonRpcProvider {
  public attempts: number

  constructor(attempts: number, url?: utils.ConnectionInfo | string, network?: string) {
    super(url, network)
    this.attempts = attempts
  }

  public perform(method: string, params: any) {
    let attempts = 0
    return utils.poll(() => {
      attempts++
      return super.perform(method, params).then(
        (result) => {
          return result
        },
        (error: any) => {
          if (error.statusCode !== 429 || attempts >= this.attempts) {
            return Promise.reject(error)
          } else {
            return Promise.resolve(undefined)
          }
        },
      )
    })
  }
}
