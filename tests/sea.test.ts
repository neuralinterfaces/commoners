import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createSEA, isSEASupported, estimateSEASize } from '../packages/core/utils/sea'
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const tmpDir = join(tmpdir(), 'commoners-sea-test')

beforeAll(() => {
  mkdirSync(tmpDir, { recursive: true })
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe.skipIf(!isSEASupported())('SEA (Single Executable Application)', () => {
  test('isSEASupported() returns true on Node 20+', () => {
    const [major] = process.versions.node.split('.').map(Number)
    expect(major).toBeGreaterThanOrEqual(20)
    expect(isSEASupported()).toBe(true)
  })

  test('estimateSEASize() returns node binary size + bundle size', () => {
    const bundleSize = 1024
    const nodeBinarySize = statSync(process.execPath).size
    expect(estimateSEASize(bundleSize)).toBe(nodeBinarySize + bundleSize)
  })

  test(
    'createSEA() produces a working standalone executable',
    { timeout: 120_000 },
    async () => {
      // Write a trivial entry point
      const srcPath = join(tmpDir, 'hello.js')
      writeFileSync(srcPath, 'console.log("SEA_OK")')

      const outPath = join(tmpDir, 'test-sea')

      const result = await createSEA({ src: srcPath, out: outPath, sign: true })

      expect(result.success).toBe(true)
      expect(result.size).toBeGreaterThan(0)
      expect(result.error).toBeUndefined()

      // Execute the produced binary and verify output
      const stdout = execSync(`"${result.executablePath}"`, { encoding: 'utf8', timeout: 10_000 })
      expect(stdout.trim()).toBe('SEA_OK')
    }
  )

  test(
    'createSEA() returns failure for non-existent source',
    { timeout: 30_000 },
    async () => {
      const result = await createSEA({
        src: join(tmpDir, 'does-not-exist.js'),
        out: join(tmpDir, 'bad-sea'),
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    }
  )
})
