/**
 * Vite 7 Legacy Build Adapter
 *
 * Drop-in replacement for ViteBuildAdapter that preserves Vite 7 behavior.
 * Use this if Vite 8 (Rolldown) introduces incompatibilities:
 *
 *   import { setBuildAdapter } from 'commoners/adapters'
 *   import { createViteLegacyAdapter } from 'commoners/adapters/vite-legacy'
 *   setBuildAdapter(createViteLegacyAdapter())
 *
 * Requires: pnpm add vite@^7 (downgrade from Vite 8)
 */

import { ViteBuildAdapter } from './vite.js'
import type { BuildAdapter } from './types.js'

export class Vite7BuildAdapter extends ViteBuildAdapter {
  override readonly name = 'vite-legacy'
}

/**
 * Create a Vite 7 legacy build adapter.
 * Functionally identical to the default adapter — the difference is the name
 * (for logging/debugging) and the signal that Vite 7 is intentional.
 *
 * To use: downgrade vite to ^7.x and call setBuildAdapter(createViteLegacyAdapter())
 */
export function createViteLegacyAdapter(): BuildAdapter {
  return new Vite7BuildAdapter()
}
