import { URL } from 'node:url'

export const isValidURL = s => {
  try {
    new URL(s)
    return true
  } catch {
    return false
  }
}
