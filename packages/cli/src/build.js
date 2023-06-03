import ts from 'typescript'
import { readFileSync } from "fs"

export const transpile = (filePath, options = { module: 'es2015' }) => {
      const source = readFileSync(filePath, 'utf8').toString()
    const output = ts.transpileModule(source, { compilerOptions: options })
    return output.outputText
}

export const loadModule = async (filePath) => {
  const transpiled = transpile(filePath)
  const dataUri = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(transpiled);
  const loaded = await import(dataUri)
  return loaded
}
