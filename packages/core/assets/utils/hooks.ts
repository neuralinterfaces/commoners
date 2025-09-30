import { HooksInterface } from "../../types.js"

export const createNoOpHooks = (): HooksInterface => ({ emit: () => {}, on: () => () => {} })

export async function resolveHooks(...priority) {
  const filtered = priority.filter(hook => hook) // Remove falsy values
  for (let hook of filtered) {
    if (typeof hook === 'function') hook = await hook()
    if (hook) return hook
  }

  return createNoOpHooks()
}
