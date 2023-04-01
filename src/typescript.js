import path from "path"
import { spawnProcess } from "./processes.js"

export const transpile = async (filePath, config) => {
  
  // Convert Typescript file and/or return the JS file
  if (filePath.slice(-3) === '.ts') {
      const relPath = path.relative( process.cwd(), filePath )
      const outDir = path.join(path.join(process.cwd(), config.outDir ?? 'dist'),  path.dirname(relPath)) // Create file in the expected dist location
      await spawnProcess('tsc', [filePath, '--outDir', outDir, '--module', 'nodenext']) // Is a single file
      return path.join(outDir, `${path.parse(filePath).name}.js`)
  }

  return filePath
}

export const loadModule = async (filePath, config) => {
  const destination = await transpile(filePath, config)
  return await import(destination)
}