import { TargetType } from '../types.js'

// Target name normalization (no formatting, just data transformation)
export const getTargetDisplayName = (target: TargetType): string => {
  if (target === 'web') return 'Web'
  if (target === 'pwa') return 'PWA'
  if (target === 'electron') return 'Desktop'
  if (target === 'mobile') return 'Mobile'
  if (target === 'ios' || target === 'ios-capacitor') return 'iOS'
  if (target === 'android' || target === 'android-capacitor') return 'Android'
  if (target === 'tauri') return 'Tauri'
  if (target === 'ios-tauri') return 'iOS (Tauri)'
  if (target === 'android-tauri') return 'Android (Tauri)'
  return target
}
