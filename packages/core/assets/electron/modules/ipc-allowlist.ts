/**
 * Capabilities-Driven IPC Allowlist
 *
 * Generates a fine-grained IPC channel allowlist from the resolved config.
 * Instead of allowing all `services:*` and `plugins:*` channels, only channels
 * for declared extensions are permitted.
 *
 * This mirrors Tauri's capabilities system where each plugin/service must
 * explicitly declare its IPC surface area.
 */

import { Commands, FRAMEWORK_CHANNELS } from './commands'

/**
 * IPC allowlist configuration.
 * Generated at startup from the resolved config.
 */
export interface IPCAllowlist {
  /** Exact framework channels that are always allowed */
  framework: readonly string[]
  /** Allowed service IDs — permits `services:<id>:*` channels */
  serviceIds: Set<string>
  /** Allowed plugin IDs — permits `plugins:<id>:*` channels */
  pluginIds: Set<string>
}

/**
 * Generate an IPC allowlist from the resolved plugin and service IDs.
 */
export function generateIPCAllowlist(
  pluginIds: string[],
  serviceIds: string[]
): IPCAllowlist {
  return {
    framework: FRAMEWORK_CHANNELS,
    serviceIds: new Set(serviceIds),
    pluginIds: new Set(pluginIds),
  }
}

/**
 * Validate a channel against the allowlist.
 * Returns null if allowed, or an error message if blocked.
 */
export function validateChannel(channel: string, allowlist: IPCAllowlist): string | null {
  // Framework channels are always allowed
  if (channel.startsWith('commoners:')) return null

  // Check scoped channels against declared IDs
  const scopedMatch = channel.match(/^(services|plugins):([^:]+):(.+)$/)
  if (!scopedMatch) return `Unrecognized channel format: ${channel}`

  const [, scope, id] = scopedMatch

  if (scope === 'services') {
    if (!allowlist.serviceIds.has(id)) {
      return `Blocked IPC for undeclared service "${id}". Declare it in config to enable IPC.`
    }
    return null
  }

  if (scope === 'plugins') {
    if (!allowlist.pluginIds.has(id)) {
      return `Blocked IPC for undeclared plugin "${id}". Declare it in config to enable IPC.`
    }
    return null
  }

  return `Unknown channel scope: ${scope}`
}

/**
 * Serialize allowlist for transfer to renderer (via additionalArguments or IPC).
 */
export function serializeAllowlist(allowlist: IPCAllowlist): string {
  return JSON.stringify({
    serviceIds: [...allowlist.serviceIds],
    pluginIds: [...allowlist.pluginIds],
  })
}

/**
 * Deserialize allowlist received in renderer.
 */
export function deserializeAllowlist(serialized: string): IPCAllowlist {
  const { serviceIds, pluginIds } = JSON.parse(serialized)
  return {
    framework: FRAMEWORK_CHANNELS,
    serviceIds: new Set(serviceIds),
    pluginIds: new Set(pluginIds),
  }
}
