import { createRequire } from 'node:module'

import { isMobile } from './globals.js'
import { getLocalIP } from './assets/services/ip.js'
import type { TargetType } from './types.js'

// The dev websocket carries plugin calls from the page to Node. It listens on
// loopback unless the page runs on another device (mobile) or the app is
// explicitly `public`.

type DevWebsocketConfig = { target: TargetType; public?: boolean }

const LOOPBACK = '127.0.0.1'
const ALL_INTERFACES = '0.0.0.0'

const isNetworkReachable = ({ target, public: isPublic }: DevWebsocketConfig) =>
  Boolean(isPublic) || isMobile(target)

export const getDevWebsocketBindHost = (config: DevWebsocketConfig) =>
  isNetworkReachable(config) ? ALL_INTERFACES : LOOPBACK

export const getDevWebsocketURL = (config: DevWebsocketConfig, port: number | string) =>
  `ws://${isNetworkReachable(config) ? getLocalIP() : LOOPBACK}:${port}`

export const createDevWebsocketServer = (config: DevWebsocketConfig, port: number | string) => {
  const require = createRequire(import.meta.url) // Load ws at runtime to avoid bundling it
  const { Server } = require('ws')
  return new Server({ port: Number(port), host: getDevWebsocketBindHost(config) })
}
