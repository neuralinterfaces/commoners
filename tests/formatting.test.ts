import { expect, test, describe } from 'vitest'
import { format } from '@commoners/solidarity'

describe('API: Formatting Utilities', () => {
  describe('getTargetDisplayName', () => {
    test('should format web target', () => {
      const displayName = format.getTargetDisplayName('web')
      expect(displayName).toBe('Web')
    })

    test('should format pwa target', () => {
      const displayName = format.getTargetDisplayName('pwa')
      expect(displayName).toBe('PWA')
    })

    test('should format desktop target', () => {
      const displayName = format.getTargetDisplayName('desktop')
      expect(displayName).toBe('desktop')
    })

    test('should format electron target as Desktop', () => {
      const displayName = format.getTargetDisplayName('electron')
      expect(displayName).toBe('Desktop')
    })

    test('should format mobile target', () => {
      const displayName = format.getTargetDisplayName('mobile')
      expect(displayName).toBe('Mobile')
    })

    test('should format ios target', () => {
      const displayName = format.getTargetDisplayName('ios')
      expect(displayName).toBe('iOS')
    })

    test('should format ios-capacitor target', () => {
      const displayName = format.getTargetDisplayName('ios-capacitor')
      expect(displayName).toBe('iOS')
    })

    test('should format android target', () => {
      const displayName = format.getTargetDisplayName('android')
      expect(displayName).toBe('Android')
    })

    test('should format android-capacitor target', () => {
      const displayName = format.getTargetDisplayName('android-capacitor')
      expect(displayName).toBe('Android')
    })

    test('should format tauri target', () => {
      const displayName = format.getTargetDisplayName('tauri')
      expect(displayName).toBe('Tauri')
    })

    test('should format ios-tauri target', () => {
      const displayName = format.getTargetDisplayName('ios-tauri')
      expect(displayName).toBe('iOS (Tauri)')
    })

    test('should format android-tauri target', () => {
      const displayName = format.getTargetDisplayName('android-tauri')
      expect(displayName).toBe('Android (Tauri)')
    })

    test('should handle all valid targets', () => {
      const targets = ['web', 'pwa', 'electron', 'mobile', 'ios', 'android', 'tauri',
        'ios-capacitor', 'android-capacitor', 'ios-tauri', 'android-tauri']

      targets.forEach(target => {
        const displayName = format.getTargetDisplayName(target as any)
        expect(displayName).toBeTypeOf('string')
        expect(displayName.length).toBeGreaterThan(0)
      })
    })

    test('should preserve special casing for iOS and PWA', () => {
      expect(format.getTargetDisplayName('ios')).toBe('iOS')
      expect(format.getTargetDisplayName('pwa')).toBe('PWA')
    })

    test('should handle capitalization correctly', () => {
      expect(format.getTargetDisplayName('web')).toBe('Web')
      expect(format.getTargetDisplayName('mobile')).toBe('Mobile')
      expect(format.getTargetDisplayName('android')).toBe('Android')
      expect(format.getTargetDisplayName('electron')).toBe('Desktop')
    })
  })

  describe('Target Display Name Usage', () => {
    test('should be suitable for user-facing messages', () => {
      const target = 'electron'
      const displayName = format.getTargetDisplayName(target)

      const message = `Building ${displayName} application...`
      expect(message).toBe('Building Desktop application...')
    })

    test('should handle different targets in messages consistently', () => {
      const targets = [
        { input: 'web', expected: 'Building Web application...' },
        { input: 'pwa', expected: 'Building PWA application...' },
        { input: 'electron', expected: 'Building Desktop application...' },
        { input: 'mobile', expected: 'Building Mobile application...' },
        { input: 'ios', expected: 'Building iOS application...' },
        { input: 'android', expected: 'Building Android application...' },
        { input: 'ios-tauri', expected: 'Building iOS (Tauri) application...' },
        { input: 'android-tauri', expected: 'Building Android (Tauri) application...' },
      ]

      targets.forEach(({ input, expected }) => {
        const displayName = format.getTargetDisplayName(input as any)
        const message = `Building ${displayName} application...`
        expect(message).toBe(expected)
      })
    })

    test('should work in error messages', () => {
      const target = 'ios'
      const displayName = format.getTargetDisplayName(target)

      const error = `${displayName} build failed`
      expect(error).toBe('iOS build failed')
    })

    test('should work in success messages', () => {
      const target = 'pwa'
      const displayName = format.getTargetDisplayName(target)

      const success = `${displayName} built successfully`
      expect(success).toBe('PWA built successfully')
    })
  })

  describe('Formatting Edge Cases', () => {
    test('should handle target normalization in display', () => {
      // Electron displays as Desktop
      const displayName = format.getTargetDisplayName('electron')
      expect(displayName).toBe('Desktop')
    })

    test('should produce consistent output', () => {
      const target = 'web'
      const call1 = format.getTargetDisplayName(target)
      const call2 = format.getTargetDisplayName(target)

      expect(call1).toBe(call2)
    })

    test('should handle rapid successive calls', () => {
      const targets = ['web', 'pwa', 'mobile', 'electron']
      const results = targets.map(t => format.getTargetDisplayName(t as any))

      expect(results).toEqual(['Web', 'PWA', 'Mobile', 'Desktop'])
    })
  })
})
