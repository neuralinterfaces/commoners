import ts from 'typescript'
import { readFileSync } from "fs"

export const transpile = async (filePath, config = {}) => {
  
  // Convert Typescript file and/or return the JS file
  if (filePath.slice(-3) === '.ts') {
      const source = readFileSync(filePath, 'utf8').toString()
      const output = ts.transpileModule(source, { compilerOptions: { module: 'es2015' } })
      const dataUri = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(output.outputText);
      const loaded = await import(dataUri)
      return loaded
  }

  return filePath
}

export const loadModule = async (filePath, config) => await transpile(filePath, config)