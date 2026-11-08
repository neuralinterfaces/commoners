// Preload (node -r) that makes desktop and PWA tooling unresolvable, as if not installed:
// proves a web build never loads them and a desktop build explains what to install
const Module = require('node:module')

const BLOCKED = ['electron', 'electron-builder', 'vite-plugin-pwa']
const isBlocked = request =>
  BLOCKED.some(name => request === name || request.startsWith(name + '/'))

const resolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (isBlocked(request)) {
    const error = new Error(`Cannot find module '${request}'`)
    error.code = 'MODULE_NOT_FOUND'
    throw error
  }
  return resolveFilename.call(this, request, ...rest)
}

// import() goes through the ESM resolver, so block it there too
Module.register(
  'data:text/javascript,' +
    encodeURIComponent(`
      const blocked = ${JSON.stringify(BLOCKED)}
      export async function resolve(specifier, context, next) {
        if (blocked.some(name => specifier === name || specifier.startsWith(name + '/'))) {
          const error = new Error("Cannot find package '" + specifier + "'")
          error.code = 'ERR_MODULE_NOT_FOUND'
          throw error
        }
        return next(specifier, context)
      }
    `)
)
