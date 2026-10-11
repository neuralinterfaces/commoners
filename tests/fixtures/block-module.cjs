// Preload (node -r) that makes the modules named in COMMONERS_BLOCK_MODULES (comma-separated)
// unresolvable, as if they were not installed
const Module = require('node:module')
const process = require('node:process')

const blocked = (process.env.COMMONERS_BLOCK_MODULES || '').split(',').filter(Boolean)
const resolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (blocked.includes(request)) {
    const error = new Error(`Cannot find module '${request}'`)
    error.code = 'MODULE_NOT_FOUND'
    throw error
  }
  return resolveFilename.call(this, request, ...rest)
}
