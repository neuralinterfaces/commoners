/**
 * @commoners/discovery
 *
 * Extension capability querying and requirement validation.
 *
 * Provides:
 * - query(filter) — find extensions by capabilities (provides, platforms, runtime)
 * - validate() — check that all extension requirements are satisfied
 * - list() — list all registered extensions with their capabilities
 *
 * Extension capability querying as an opt-in plugin.
 * Reads from commoners.EXTENSIONS (the extension registry on the global).
 */

export const capabilities = {
  provides: ['discovery', 'extension-query'],
  platforms: { web: true, desktop: true, mobile: true },
  runtime: 'browser' as const,
}

type ExtensionCapabilities = {
  provides?: string[]
  platforms?: Record<string, boolean | string>
  runtime?: string
  requires?: string[]
}

type ExtensionType = 'plugin' | 'service' | 'hybrid'

type ExtensionInfo = {
  type: ExtensionType
  capabilities?: ExtensionCapabilities
}

type ExtensionMatch = {
  type: ExtensionType
  capabilities: ExtensionCapabilities
}

function matchCapabilities(
  caps: ExtensionCapabilities | undefined,
  filter: Partial<ExtensionCapabilities>
): boolean {
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

export default function discovery() {
  return {
    capabilities,

    isSupported: {
      load: () => true,
    },

    load() {
      const commoners = (globalThis as any).commoners || {}
      const extensions: Record<string, ExtensionInfo> = commoners.EXTENSIONS || {}

      return {
        /**
         * Find extensions matching a capability filter.
         *
         * @example
         * // Find all Bluetooth-capable extensions
         * discovery.query({ provides: ['bluetooth'] })
         *
         * // Find all desktop services
         * discovery.query({ platforms: { desktop: true }, runtime: 'process' })
         */
        query(filter: Partial<ExtensionCapabilities>): Record<string, ExtensionMatch> {
          const results: Record<string, ExtensionMatch> = {}
          for (const [id, ext] of Object.entries(extensions)) {
            if (ext.capabilities && matchCapabilities(ext.capabilities, filter)) {
              results[id] = { type: ext.type, capabilities: ext.capabilities }
            }
          }
          return results
        },

        /**
         * Check that all extension requirements are satisfied.
         * Returns an array of { id, missing } for extensions with unmet dependencies.
         * Empty array means all requirements are met.
         */
        validate(): { id: string; missing: string[] }[] {
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
        },

        /**
         * List all registered extensions with their capabilities.
         */
        list(): Record<string, ExtensionInfo> {
          return { ...extensions }
        },

        /**
         * Get capabilities for a specific extension by ID.
         */
        get(id: string): ExtensionInfo | undefined {
          return extensions[id]
        },
      }
    },
  }
}
