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
    return new Promise(async resolve => {
      for (const cb of callbacks) await __runCleanupCallback(cb, code)
      resolve(true)
    })
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

const exitEvents = ['beforeExit', 'exit', 'SIGINT', 'SIGTERM']
exitEvents.forEach(event => process.on(event, (code) => exit(code, false))) // Register exit events, do not force exit though
process.exit = exit as any
