
import { AddressInfo } from 'node:net'

type ViteDevServer = import('vite').ViteDevServer

export function resolveServerUrl(server: ViteDevServer): string | void {
    const addressInfo = server.httpServer!.address()
    const isAddressInfo = (x: any): x is AddressInfo => x?.address
  
    if (isAddressInfo(addressInfo)) {
      const { port } = addressInfo
      const options = server.config.server
      const protocol = options.https ? 'https' : 'http'
      const devBase = server.config.base  
      return `${protocol}://localhost:${port}${devBase}`
    }
  }