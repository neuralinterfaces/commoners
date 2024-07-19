import { builtinModules } from 'node:module'

type InlineConfig = import('vite').InlineConfig

export function withExternalBuiltins(config: InlineConfig) {

    const copy = { ...config }

    const builtins = builtinModules.filter(e => !e.startsWith('_')); builtins.push('electron', ...builtins.map(m => `node:${m}`))
  
    const buildOptionsCopy = copy.build = { ...copy.build ??= {} }
    const rollupOptionsCopy = buildOptionsCopy.rollupOptions = { ...buildOptionsCopy.rollupOptions ??= {} }
  
    let external = rollupOptionsCopy.external

    if (Array.isArray(external) || typeof external === 'string' || external instanceof RegExp) external = builtins.concat(external as string[])
    
      else if (typeof external === 'function') {
      const original = external
      external = (source, importer, isResolved) => builtins.includes(source) ? true : original(source, importer, isResolved)
    }

    else external = builtins

    rollupOptionsCopy.external = external
  
    return copy
  }
  
  