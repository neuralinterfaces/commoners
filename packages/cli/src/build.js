import ts from 'typescript'
import { readFileSync } from "fs"
import { join, parse } from 'path'
import * as esbuild from 'esbuild'

export const transpileTo = async (src, outDir, options) => {
  const outfile = join(outDir, `${parse(src).name}.js`)
  await esbuild.build({
    entryPoints: [ src ],
    external: ['*.node'],
    bundle: true,
    outfile,
    platform: 'node'
  })

  return outfile
}

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
