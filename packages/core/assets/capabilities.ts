import { ExtensionCapabilities } from '../types.js'

type ExtensionType = 'plugin' | 'service' | 'hybrid'

type ExtensionMatch = {
  type: ExtensionType
  capabilities: ExtensionCapabilities
}

type ExposedExtension = {
  type: ExtensionType
  capabilities?: ExtensionCapabilities
}

const match = (caps: ExtensionCapabilities | undefined, filter: Partial<ExtensionCapabilities>): boolean => {
  if (!caps) return false

  if (filter.provides?.length) {
    if (!caps.provides?.length) return false
    if (!filter.provides.every(p => caps.provides!.includes(p))) return false
  }

  if (filter.runtime && caps.runtime !== filter.runtime) return false

  if (filter.platforms) {
    if (!caps.platforms) return false
    for (const [platform, value] of Object.entries(filter.platforms)) {
      if (value && !caps.platforms[platform]) return false
    }
  }

  return true
}

export function queryExtensions(
  extensions: Record<string, ExposedExtension>,
  filter: Partial<ExtensionCapabilities>
): Record<string, ExtensionMatch> {
  const results: Record<string, ExtensionMatch> = {}

  for (const [id, ext] of Object.entries(extensions)) {
    if (ext.capabilities && match(ext.capabilities, filter)) {
      results[id] = { type: ext.type, capabilities: ext.capabilities }
    }
  }

  return results
}

export function validateRequirements(
  extensions: Record<string, ExposedExtension>
): { id: string; missing: string[] }[] {
  const errors: { id: string; missing: string[] }[] = []
  const allProvided = new Set<string>()

  for (const ext of Object.values(extensions)) {
    if (ext.capabilities?.provides) {
      ext.capabilities.provides.forEach(p => allProvided.add(p))
    }
  }

  for (const [id, ext] of Object.entries(extensions)) {
    if (ext.capabilities?.requires) {
      const missing = ext.capabilities.requires.filter(r => !allProvided.has(r))
      if (missing.length) errors.push({ id, missing })
    }
  }

  return errors
}
