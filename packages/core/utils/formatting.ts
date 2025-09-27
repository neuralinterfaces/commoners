import { TargetType } from '../types.js'

// Target name normalization (no formatting, just data transformation)
export const getTargetDisplayName = (target: TargetType): string => {
  if (target === 'web') return 'Web'
  if (target === 'pwa') return 'PWA'
  if (target === 'electron') return 'Desktop'
  if (target === 'mobile') return 'Mobile'
  if (target === 'ios') return 'iOS'
  if (target === 'android') return 'Android'
  if (target === 'tauri') return 'Tauri'
  return target
}
