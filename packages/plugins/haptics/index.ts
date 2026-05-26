/**
 * @commoners/haptics
 *
 * Cross-platform haptic feedback with intensity control.
 *
 * Backend per runtime:
 * - Mobile (Capacitor): @capacitor/haptics — native intensity (light/medium/heavy)
 * - Web: not supported (navigator.vibrate has no intensity control)
 * - Desktop: not supported (no haptic hardware)
 *
 * API: impact(style), vibrate(duration), selectionStart/Changed/End
 */

export type ImpactStyle = 'light' | 'medium' | 'heavy'

export type HapticsBackend = {
  /** Whether native haptics with intensity control is available. */
  available: boolean
  /** Trigger an impact haptic with the given intensity. */
  impact(style: ImpactStyle): Promise<void>
  /** Simple vibration (ms). Falls back to navigator.vibrate on web. */
  vibrate(duration: number): Promise<void>
  /** Selection feedback (iOS taptic engine). */
  selectionStart(): Promise<void>
  selectionChanged(): Promise<void>
  selectionEnd(): Promise<void>
}

const capacitorConfiguration = {
  name: 'Haptics',
  plugin: '@capacitor/haptics',
  // No special permissions needed for haptics on either platform
  plist: {},
  manifest: {
    'uses-permission': [{ 'android:name': 'android.permission.VIBRATE' }],
  },
}

export const capabilities = {
  provides: ['haptics', 'vibration'],
  platforms: { web: false, desktop: false, mobile: true },
  runtime: 'browser' as const,
}

export const isSupported = {
  capacitor: capacitorConfiguration,
  load: async ({ MOBILE }: { MOBILE?: boolean }) => {
    return !!MOBILE
  },
}

// --- Null backend: no haptics available ---

function createNullBackend(): HapticsBackend {
  const noop = async () => {}
  return {
    available: false,
    impact: noop,
    vibrate: noop,
    selectionStart: noop,
    selectionChanged: noop,
    selectionEnd: noop,
  }
}

// --- Mobile backend: Capacitor Haptics ---

function createCapacitorBackend(): HapticsBackend {
  let Haptics: any = null
  let ImpactStyle: any = null

  async function getPlugin() {
    if (!Haptics) {
      try {
        const mod = await import('@capacitor/haptics')
        Haptics = mod.Haptics
        ImpactStyle = mod.ImpactStyle
      } catch {
        return null
      }
    }
    return Haptics
  }

  const styleMap = {
    light: () => ImpactStyle?.Light ?? 'LIGHT',
    medium: () => ImpactStyle?.Medium ?? 'MEDIUM',
    heavy: () => ImpactStyle?.Heavy ?? 'HEAVY',
  }

  return {
    available: true,

    async impact(style: ImpactStyle): Promise<void> {
      const plugin = await getPlugin()
      if (!plugin) return
      await plugin.impact({ style: styleMap[style]() })
    },

    async vibrate(duration: number): Promise<void> {
      const plugin = await getPlugin()
      if (!plugin) return
      await plugin.vibrate({ duration })
    },

    async selectionStart(): Promise<void> {
      const plugin = await getPlugin()
      if (!plugin) return
      await plugin.selectionStart()
    },

    async selectionChanged(): Promise<void> {
      const plugin = await getPlugin()
      if (!plugin) return
      await plugin.selectionChanged()
    },

    async selectionEnd(): Promise<void> {
      const plugin = await getPlugin()
      if (!plugin) return
      await plugin.selectionEnd()
    },
  }
}

// --- Plugin export ---

export default function haptics() {
  return {
    capabilities,
    isSupported,

    load(): HapticsBackend {
      const { MOBILE } = (globalThis as any).commoners || {}

      if (MOBILE) return createCapacitorBackend()
      return createNullBackend()
    },
  }
}
