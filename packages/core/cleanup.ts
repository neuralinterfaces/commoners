const callbacks = []
export const onCleanup = callback => callbacks.push(callback)

const willBeAsync = () => callbacks.some(cb => cb.constructor.name === 'AsyncFunction')

const __runCleanupCallback = (cb, code) => {
   if (!cb.called) {
      cb.called = true // Prevent double-calling
      try { return cb(code) } 
      catch (error) { console.error(`Cleanup Error: ${error.message}`) }
    }
}

export const cleanup = (code = 0) => {

  if (willBeAsync()) {
    // Use an async IIFE instead of new Promise(async ...) to avoid swallowing rejections
    return (async () => {
      for (const cb of callbacks) {
        try {
          await __runCleanupCallback(cb, code)
        } catch (error) {
          console.error(`Cleanup callback error: ${error.message}`)
        }
      }
      return true
    })()
  }

  for (const cb of callbacks) __runCleanupCallback(cb, code)
  return true
}

const originalExit = process.exit.bind(process)
const runOriginalExit = (code) => {
  originalExit(code)
}

const __exit = (code, force = true) => {
  const isAsync = willBeAsync()
  const willExit = force || !globalThis.process.env.__COMMONERS_TESTING
  const normalized = typeof code === 'number' ? code : (code === 'SIGINT' ? 0 : 1);

  if (isAsync) {
    const promise = cleanup(code) as Promise<unknown>
    return promise
    .catch(error => console.error(`Async Cleanup Error: ${error.message}`))
    .finally(() => {
      if (willExit) runOriginalExit(normalized) // Do not force exit on SIGINT
    })
  }

  try {
    cleanup(code)
  } catch (error) {
    console.error(`Sync Cleanup Error: ${error.message}`)
  }

  if (willExit) runOriginalExit(normalized) // Exit with original code
  return undefined
}

let __EXITING = {
  called: false,
  output: null
}

export const exit = (code, force = true) => {
  if (__EXITING.called) return __EXITING.output
  __EXITING.called = true
  return __EXITING.output = __exit(code, force)
}

// Register exit event handlers for cleanup.
// Each handler checks __COMMONERS_TESTING at call time (not registration time) because
// cleanup.ts may be imported before the testing flag is set. In testing mode, the test
// runner's afterAll handler is responsible for cleanup — these handlers must not interfere
// with vitest's worker lifecycle (e.g., preventing process.exit from actually exiting).
const exitEvents = ['beforeExit', 'exit', 'SIGINT', 'SIGTERM']
exitEvents.forEach(event => process.on(event, (code) => {
  if (!globalThis.process?.env?.__COMMONERS_TESTING) exit(code, false)
}))

// Override process.exit to run cleanup before exiting.
// In testing mode, defer to the original exit to avoid interfering with vitest's worker lifecycle.
process.exit = ((code?: number) => {
  if (globalThis.process?.env?.__COMMONERS_TESTING) return originalExit(code)
  return exit(code, true)
}) as any
