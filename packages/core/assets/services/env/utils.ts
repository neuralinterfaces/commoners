import { Stats, statSync } from "node:fs"
import { join, posix } from "node:path"

// NOTE: These are copied from https://github.com/vitejs/vite/tree/6113a9670cc9b7d29fe0bffe033f7823e36ded00/packages/vite/src/node

const isWindows = typeof process !== 'undefined' && process.platform === 'win32'
const slash = (p: string) => p.replace(/\\/g, '/')

export function tryStatSync(file: string): Stats | undefined {
    try {
      // The "throwIfNoEntry" is a performance optimization for cases where the file does not exist
      return statSync(file, { throwIfNoEntry: false })
    } catch {
      // Ignore errors
    }
}
  
const normalizePath = (id: string) => posix.normalize(isWindows ? slash(id) : id)

  
export function getEnvFilesForMode(mode: string, envDir: string): string[] {
    return [
      `.env`,
      `.env.local`,
      `.env.${mode}`,
      `.env.${mode}.local`,
    ].map((file) => normalizePath(join(envDir, file)))
}