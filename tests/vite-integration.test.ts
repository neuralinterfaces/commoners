/**
 * Tests for Vite integration issues:
 * 1. process.env accessible in commoners.config.ts during browser config bundling
 * 2. process.env values are preserved (not replaced with empty polyfill)
 * 3. vite.base path forwarded correctly through config loading and mergeConfig
 * 4. VITE_* env vars loaded via envPrefix and inlined by Vite in built output
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { bundleConfig } from '../packages/core/utils/assets'
import { loadConfigFromFile } from '@commoners/solidarity'

// Use a temp directory inside the repo so Vite's path resolution works
// (vite:build-html resolves paths relative to CWD, which is the repo root)
const testDir = join(__dirname, '..', '.commoners', '.tmp', 'vite-integration-test')

beforeAll(() => {
  mkdirSync(testDir, { recursive: true })
})

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Helper: write a minimal commoners config and index.html to a temp directory
// ---------------------------------------------------------------------------
function setupProject(name: string, configCode: string, extras?: Record<string, string>): string {
  const dir = join(testDir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'commoners.config.ts'), configCode)
  writeFileSync(join(dir, 'index.html'), '<html><body></body></html>')
  if (extras) {
    for (const [path, content] of Object.entries(extras)) {
      const fullPath = join(dir, path)
      mkdirSync(resolve(fullPath, '..'), { recursive: true })
      writeFileSync(fullPath, content)
    }
  }
  return dir
}

// ────────────────────────────────────────────────────────
// 1. process.env in config — browser bundle must not crash
// ────────────────────────────────────────────────────────
describe('process.env in config bundling', () => {
  test('browser config bundle succeeds when config references process.env', async () => {
    const dir = setupProject(
      'process-env-browser',
      `
      export default {
        plugins: {
          test: { load: () => console.log('loaded') },
        },
        vite: {
          base: process.env.VITE_BASE_PATH || '/',
          define: {
            'import.meta.env.VITE_CUSTOM': JSON.stringify(process.env.VITE_CUSTOM || 'default'),
          },
        },
      }
    `
    )

    const outFile = join(dir, '.commoners', 'commoners.config.mjs')
    mkdirSync(join(dir, '.commoners'), { recursive: true })

    // Browser bundling should handle process.env without crashing
    await expect(
      bundleConfig(join(dir, 'commoners.config.ts'), outFile, {
        node: false,
        desktop: false,
        target: 'web',
      })
    ).resolves.not.toThrow()

    expect(existsSync(outFile)).toBe(true)
  })

  test('electron config bundle succeeds when config references process.env', async () => {
    const dir = setupProject(
      'process-env-electron',
      `
      export default {
        name: 'Test App',
        plugins: {
          test: { load: () => console.log('loaded') },
        },
        vite: {
          base: process.env.VITE_BASE_PATH || '/',
        },
      }
    `
    )

    const outFile = join(dir, '.commoners', 'commoners.config.cjs')
    mkdirSync(join(dir, '.commoners'), { recursive: true })

    await expect(
      bundleConfig(join(dir, 'commoners.config.ts'), outFile, {
        node: true,
        desktop: true,
        target: 'electron',
      })
    ).resolves.not.toThrow()

    expect(existsSync(outFile)).toBe(true)
  })
})

// ────────────────────────────────────────────────────────
// 2. process.env values preserved in initial config loading
// ────────────────────────────────────────────────────────
describe('process.env values in config evaluation', () => {
  test('process.env values set before loading are available in commoners.config.ts', async () => {
    // Set an env var before loading the config
    process.env.VITE_BASE_PATH = '/test-portal/'

    const dir = setupProject(
      'process-env-values',
      `
      export default {
        name: 'Env Values Test',
        vite: {
          base: process.env.VITE_BASE_PATH || '/',
        },
      }
    `
    )

    try {
      const config = await loadConfigFromFile(dir)
      // The initial esbuild load runs with platform: 'node', so process.env should work
      expect(config.vite).toBeDefined()
      expect(config.vite.base).toBe('/test-portal/')
    } finally {
      delete process.env.VITE_BASE_PATH
    }
  })

  test('browser bundle preserves process.env values (not replaced with empty polyfill)', async () => {
    // Set env var so it's available during bundling
    process.env.VITE_BUNDLE_TEST = 'real_value'

    const dir = setupProject(
      'process-env-preserved',
      `
      const myBase = process.env.VITE_BUNDLE_TEST || 'fallback'
      export default {
        plugins: {
          test: {
            // Embed the env value in a plugin so it appears in the browser bundle output
            load: () => myBase,
          },
        },
      }
    `
    )

    const outFile = join(dir, '.commoners', 'commoners.config.mjs')
    mkdirSync(join(dir, '.commoners'), { recursive: true })

    try {
      await bundleConfig(join(dir, 'commoners.config.ts'), outFile, {
        node: false,
        desktop: false,
        target: 'web',
      })

      const content = readFileSync(outFile, 'utf-8')
      // The browser bundle should contain the actual value, not a runtime
      // process.env lookup that would fail in the browser
      expect(
        content.includes('real_value') || !content.includes('process.env'),
        'Browser bundle should inline process.env values or not reference process.env at runtime'
      ).toBe(true)
    } finally {
      delete process.env.VITE_BUNDLE_TEST
    }
  })
})

// ────────────────────────────────────────────────────────
// 3. vite.base forwarded to Vite config
// ────────────────────────────────────────────────────────
describe('vite.base path support', () => {
  test('user-specified vite.base is preserved after config loading', async () => {
    const dir = setupProject(
      'base-path',
      `
      export default {
        name: 'Base Path Test',
        vite: {
          base: '/portal/',
        },
      }
    `
    )

    const config = await loadConfigFromFile(dir)
    expect(config.vite).toBeDefined()
    expect(config.vite.base).toBe('/portal/')
  })

  test('vite.base overrides default ./ in resolveViteConfig via mergeConfig', async () => {
    const dir = setupProject(
      'base-merge',
      `
      export default {
        name: 'Base Merge Test',
        vite: {
          base: '/subpath/',
        },
      }
    `
    )

    const config = await loadConfigFromFile(dir)
    const { resolveViteConfig } = await import('../packages/core/vite/index.js')

    const viteConfig = await resolveViteConfig(
      {
        ...config,
        target: 'web',
        outDir: join(dir, '.commoners'),
        extensions: {},
        pages: {},
      },
      { dev: false },
      true
    )

    // mergeConfig should let user's /subpath/ override the default ./
    expect(viteConfig.base).toBe('/subpath/')
  })

  test('vite.base with process.env works end-to-end', async () => {
    process.env.VITE_BASE_PATH = '/dynamic-base/'

    const dir = setupProject(
      'base-env',
      `
      export default {
        name: 'Base Env Test',
        vite: {
          base: process.env.VITE_BASE_PATH || '/',
        },
      }
    `
    )

    try {
      const config = await loadConfigFromFile(dir)
      const { resolveViteConfig } = await import('../packages/core/vite/index.js')

      const viteConfig = await resolveViteConfig(
        {
          ...config,
          target: 'web',
          outDir: join(dir, '.commoners'),
          extensions: {},
          pages: {},
        },
        { dev: false },
        true
      )

      expect(viteConfig.base).toBe('/dynamic-base/')
    } finally {
      delete process.env.VITE_BASE_PATH
    }
  })
})

// ────────────────────────────────────────────────────────
// 4. VITE_* env var inlining
// ────────────────────────────────────────────────────────
describe('VITE_* environment variable inlining', () => {
  test('VITE_* vars from .env are picked up by resolveViteConfig', async () => {
    const dir = setupProject('vite-env-loading', `export default { name: 'Env Test' }\n`, {
      '.env': 'VITE_TEST_VAR=hello_world\n',
    })

    const config = await loadConfigFromFile(dir)
    const { resolveViteConfig } = await import('../packages/core/vite/index.js')

    const viteConfig = await resolveViteConfig(
      {
        ...config,
        target: 'web',
        outDir: join(dir, '.commoners'),
        extensions: {},
        pages: {},
      },
      { dev: false },
      true
    )

    // envPrefix should include VITE_ so Vite's built-in env replacement works
    expect(viteConfig.envPrefix).toContain('VITE_')
  })

  test('VITE_* vars are inlined in Vite build output via standard import.meta.env', async () => {
    const dir = setupProject('vite-inline', `export default { name: 'Inline Test' }\n`, {
      '.env': 'VITE_TEST_INLINE=inlined_value_123\n',
      'src/main.js': 'document.title = import.meta.env.VITE_TEST_INLINE;\n',
      'index.html':
        '<!DOCTYPE html><html><body><script type="module" src="./src/main.js"></script></body></html>',
    })

    const vite = await import('vite')

    const outDir = join(dir, 'dist')

    // Build with plain Vite + commoners envPrefix to test env inlining
    await vite.build({
      root: dir,
      base: './',
      logLevel: 'silent',
      envPrefix: ['VITE_', 'COMMONERS_'],
      build: {
        outDir,
        emptyOutDir: true,
        write: true,
      },
    })

    // Scan built JS for the inlined value
    const allFiles = readdirSync(outDir, { recursive: true }) as string[]
    const jsFiles = allFiles.filter(f => String(f).endsWith('.js'))

    let foundInlined = false
    let foundRuntimeLookup = false

    for (const file of jsFiles) {
      const content = readFileSync(join(outDir, String(file)), 'utf-8')
      if (content.includes('inlined_value_123')) foundInlined = true
      // Bug pattern: runtime property lookup instead of inlined literal
      if (content.match(/\.VITE_TEST_INLINE\b/) && !content.includes('"inlined_value_123"'))
        foundRuntimeLookup = true
    }

    expect(foundInlined, 'VITE_TEST_INLINE should be inlined as literal string in built JS').toBe(
      true
    )
    expect(foundRuntimeLookup, 'Should NOT have runtime property lookup for VITE_TEST_INLINE').toBe(
      false
    )
  })

  test('VITE_* vars are inlined when building through commoners resolveViteConfig', async () => {
    const dir = setupProject(
      'vite-inline-commoners',
      `export default { name: 'Inline Commoners Test' }\n`,
      {
        '.env': 'VITE_COMMONERS_INLINE=commoners_inlined_456\n',
        'src/app.js': 'window.__val = import.meta.env.VITE_COMMONERS_INLINE;\n',
        'index.html':
          '<!DOCTYPE html><html><body><script type="module" src="./src/app.js"></script></body></html>',
      }
    )

    const config = await loadConfigFromFile(dir)
    const vite = await import('vite')
    const { resolveViteConfig } = await import('../packages/core/vite/index.js')

    const outDir = join(dir, 'dist')

    const viteConfig = await resolveViteConfig(
      {
        ...config,
        target: 'web',
        outDir,
        extensions: {},
        pages: {},
      },
      { dev: false },
      true
    )

    // Build through the commoners-resolved Vite config
    await vite.build({
      ...viteConfig,
      logLevel: 'silent',
      build: {
        ...viteConfig.build,
        outDir,
        emptyOutDir: true,
        write: true,
      },
    })
    const allFiles = readdirSync(outDir, { recursive: true }) as string[]
    const jsFiles = allFiles.filter(f => String(f).endsWith('.js'))

    let foundInlined = false
    for (const file of jsFiles) {
      const content = readFileSync(join(outDir, String(file)), 'utf-8')
      if (content.includes('commoners_inlined_456')) foundInlined = true
    }

    expect(foundInlined, 'VITE_COMMONERS_INLINE should be inlined in the built output').toBe(true)
  })
})
