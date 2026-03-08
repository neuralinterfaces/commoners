import type { Plugin, ResolvedExtensions, ResolvedServices } from '../types.js'

// Extract plugins from the canonical extensions record
export function getPlugins(extensions: ResolvedExtensions): Record<string, Plugin> {
  const result: Record<string, Plugin> = {}
  for (const [id, ext] of Object.entries(extensions)) {
    if (ext.plugin) result[id] = ext.plugin
  }
  return result
}

// Extract resolved services from the canonical extensions record
export function getServices(extensions: ResolvedExtensions): ResolvedServices {
  const result: ResolvedServices = {}
  for (const [id, ext] of Object.entries(extensions)) {
    if (ext.service) result[id] = ext.service
  }
  return result
}
