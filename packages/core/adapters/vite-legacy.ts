/**
 * Vite 7 Legacy Build Adapter
 *
 * Drop-in replacement for the default adapter that preserves Vite 7 behavior.
 * Use this if Vite 8 (Rolldown) introduces incompatibilities:
 *
 *   import { setBuildAdapter } from 'commoners/adapters'
 *   import { createViteLegacyAdapter } from 'commoners/adapters/vite-legacy'
 *   setBuildAdapter(createViteLegacyAdapter())
 *
 * Requires: pnpm add vite@^7 (downgrade from Vite 8)
 */

import type { BuildAdapter } from './types.js'
import { createViteAdapter } from './vite.js'

/**
 * Create a Vite 7 legacy build adapter.
 * Functionally identical to the default adapter — the difference is the name
 * (for logging/debugging) and the signal that Vite 7 is intentional.
 *
 * To use: downgrade vite to ^7.x and call setBuildAdapter(createViteLegacyAdapter())
 */
export function createViteLegacyAdapter(): BuildAdapter {
  const adapter = createViteAdapter()
  return { ...adapter, name: 'vite-legacy' }
}
