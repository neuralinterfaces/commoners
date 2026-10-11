import { describe, test, expect } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

// Node's ES modules have no `require`. A bare require() in core's ESM build throws (or, inside a
// try/catch, silently takes the fallback path) for every consumer that imports the package as ESM.
// Use createRequire(import.meta.url) or a static import instead.
const dist = join(__dirname, '..', 'packages', 'core', 'dist')

// require() inside a code string generated for another process is not executed here
const ALLOWED = [/module\.exports = require\(path\)/]

describe('core ESM build', () => {
  test.skipIf(!existsSync(dist))('contains no bare require() calls', () => {
    const offenders: string[] = []
    for (const file of readdirSync(dist).filter(f => /\.(m?js)$/.test(f))) {
      const code = readFileSync(join(dist, file), 'utf8')
      for (const match of code.matchAll(/(?<![\w.$])require\(/g)) {
        const context = code.slice(Math.max(0, match.index! - 40), match.index! + 40)
        if (!ALLOWED.some(pattern => pattern.test(context))) offenders.push(`${file}: …${context}…`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// A config file is bundled into one ES module before Node loads it. wasm-pack's `--target nodejs`
// output is CommonJS that finds its .wasm through `__dirname`, which ES modules do not have, so
// bundling it in fails with "__dirname is not defined in ES module scope". Such packages
// (`*-wasm`, `wasm-*`) stay external, and Node loads them as CommonJS from node_modules.
describe('config loading from the ESM build', () => {
  const main = join(dist, 'main.mjs')

  test.skipIf(!existsSync(main))(
    'a config that imports a wasm-pack (CommonJS, __dirname) package loads',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'commoners-esm-config-'))
      try {
        const pkg = join(root, 'node_modules', 'fake-sense-wasm')
        mkdirSync(pkg, { recursive: true })
        writeFileSync(
          join(pkg, 'package.json'),
          JSON.stringify({ name: 'fake-sense-wasm', main: 'index.js' })
        )
        writeFileSync(join(pkg, 'data.txt'), 'loaded-next-to-the-module')
        writeFileSync(
          join(pkg, 'index.js'),
          [
            "const { readFileSync } = require('fs')",
            "const { join } = require('path')",
            "module.exports.value = readFileSync(join(__dirname, 'data.txt'), 'utf8')",
          ].join('\n')
        )
        writeFileSync(
          join(root, 'package.json'),
          JSON.stringify({ name: 'esm-config', type: 'module' })
        )
        writeFileSync(join(root, 'index.html'), '<!doctype html><title>x</title>')
        writeFileSync(
          join(root, 'commoners.config.ts'),
          [
            "import { value } from 'fake-sense-wasm'",
            "export default { name: 'esm-config', value }",
          ].join('\n')
        )

        const script =
          `const { loadConfigFromFile } = await import(${JSON.stringify(pathToFileURL(main).href)});` +
          `const config = await loadConfigFromFile(${JSON.stringify(root)});` +
          `console.log('RESULT=' + JSON.stringify({ value: config.value }));` +
          `process.exit(0)`
        let output: string
        try {
          output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
            cwd: root,
            env: { ...process.env, NODE_PATH: '' },
            encoding: 'utf8',
            stdio: 'pipe',
          })
        } catch (error: any) {
          output = `${error.stdout ?? ''}${error.stderr ?? ''}`
        }
        const result = output.match(/RESULT=(.*)/)?.[1]
        expect(result, output).toBe(JSON.stringify({ value: 'loaded-next-to-the-module' }))
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    }
  )
})
