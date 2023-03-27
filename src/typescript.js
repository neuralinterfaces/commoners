import path from "path"
import { spawnProcess } from "./processes.js"

export const transpile = async (filePath) => {
  
  // Convert Typescript file and/or return the JS file
  if (filePath.slice(-3) === '.ts') {
      const relPath = path.relative( process.cwd(), filePath )
      const outDir = path.join(path.join(process.cwd(), 'dist'),  path.dirname(relPath)) // Create file in the expected dist location
      await spawnProcess('tsc', [filePath, '--outDir', outDir, '--module', 'nodenext']) // Is a single file
      return path.join(outDir, `${path.parse(filePath).name}.js`)
  }

  return filePath
}

export const loadModule = async (filePath) => {
  const destination = await transpile(filePath)
  return await import(destination)
}