import { expect, test, describe, beforeAll, afterAll } from 'vitest'

import { getNormalizedTarget } from '@commoners/solidarity'

import { build, open } from '@commoners/testing'
import { checkAssets } from './assets'
import { verifyAsarIntegrity, printVerificationResult } from './asar/verify'

import config from '../examples/demo/commoners.config'

import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { getLocalIP } from '../packages/core/assets/services/ip'

const hasCommand = (cmd: string): boolean => {
  try {
    execSync(process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export const EXTRA_OUTPUT_LOCATIONS = ['build']

export const scopedBuildOutDir = join('.commoners', 'custom_output_dir')

const getRandomNumber = () => Math.random().toString(36).substring(7)

const getMinutes = minutes => minutes * 60 * 1000

export const projectBase = join(__dirname, '..', 'examples', 'demo') // Refer to the demo project base outside of the tests directory

const getServices = async output => {
  if (output.page) {
    const { SERVICES } = await output.page.evaluate(() => commoners.READY.then(() => commoners))
    return SERVICES ?? {}
  }

  return output.services
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const localIP = getLocalIP()

const e2eTests = {
  pages: (output, { target: _target }) => {
    describe('Page navigation', () => {
      test('PAGES contains expected page entries', async () => {
        const pages = await output.page.evaluate(() => {
          return commoners.READY.then(() => Object.keys(commoners.PAGES))
        })
        expect(pages).toContain('home')
        expect(pages).toContain('services')
      })

      test('PAGES entries are callable functions', async () => {
        const types = await output.page.evaluate(() => {
          return commoners.READY.then(() =>
            Object.fromEntries(Object.entries(commoners.PAGES).map(([k, v]) => [k, typeof v]))
          )
        })
        Object.values(types).forEach(t => expect(t).toBe('function'))
      })
    })
  },
  serviceLifecycle: (output, { target }) => {
    const normalizedTarget = getNormalizedTarget(target)
    if (normalizedTarget !== 'desktop') return

    describe('Service lifecycle (desktop)', () => {
      test('Services have status property', async () => {
        const statuses = await output.page.evaluate(() => {
          return commoners.READY.then(() => {
            const services = commoners.SERVICES
            return Object.fromEntries(
              Object.entries(services).map(([k, v]) => [k, typeof v.status])
            )
          })
        })
        Object.values(statuses).forEach(t => expect(t).toBe('function'))
      })

      test('Active services report running status', async () => {
        const result = await output.page.evaluate(() => {
          return commoners.READY.then(() => {
            const services = commoners.SERVICES
            const first = Object.values(services).find(s => s.status)
            return first ? first.status() : null
          })
        })
        // Active local services should have a truthy status
        if (result !== null) expect(result).toBeTruthy()
      })
    })
  },
  plugins: (output, { target: _target }, isDev = true) => {
    describe('Plugin features are working as expected', () => {
      test('Will pass messages between contexts', async () => {
        const randomId = getRandomNumber()

        const echo = await output.page.evaluate(input => {
          const { commoners } = globalThis
          return commoners.READY.then(({ checks }) => checks.echo(input))
        }, randomId)

        expect(echo).toEqual(randomId)
      })

      test('Correct env is accessed', async () => {
        const env = await output.page.evaluate(() => {
          const { commoners } = globalThis
          return commoners.READY.then(({ checks }) => checks.env)
        })

        expect(env.COMMONERS_ENV_FOR_ALL_MODES).toBeTruthy()

        if (isDev) expect(env.COMMONERS_ONLY_DEV).toBeTruthy()
        else expect(env.COMMONERS_ONLY_PROD).toBeTruthy()
      })

      test('Source file is resolved', async () => {
        const src = await output.page.evaluate(() => {
          const { commoners } = globalThis
          return commoners.READY.then(({ checks }) => checks.src)
        })

        expect(src).toBeTypeOf('string')
        expect(src.endsWith('checks.ts')).toBe(true)
      })
    })
  },
  basic: (output, { target }, isDev = true) => {
    const normalizedTarget = getNormalizedTarget(target)

    describe('Basic E2E Test', () => {
      test('Commoners global variable is available', async () => {
        const commoners = await output.page.evaluate(() => (globalThis.commoners ? true : false))
        expect(commoners, 'Commoners is not available on the page').toBe(true)
      })

      test('Commoners global variable is properly defined', async () => {
        const userPkg = await import(join(projectBase, 'package.json'), {
          with: { type: 'json' },
        }).then(m => m.default)

        const COMMONERS = await output.page.evaluate(() => {
          const { commoners } = globalThis
          return commoners.READY.then(() => commoners)
        })

        const {
          NAME,
          VERSION,
          PLUGINS,

          PAGES,
          SERVICES,
          READY,

          DESKTOP,
          MOBILE,
          WEB,

          DEV,
          PROD,

          ENV,
        } = COMMONERS

        const isDesktop = normalizedTarget === 'desktop'
        const availableByDefault = isDev || isDesktop

        expect(NAME, 'Name does not natch').toBe(config.name)
        expect(VERSION, 'Version does not match').toBe(userPkg.version)

        expect(WEB, 'Web flag does not match').toBe(normalizedTarget === 'web')
        expect(MOBILE, 'Mobile flag does not match').toBe(normalizedTarget === 'mobile')

        expect(READY, 'Ready promise is not the expected type').instanceOf(Object) // Resolved Promise

        // Existence Checks
        expect(PAGES, 'Pages dictionary is not the expected type').instanceOf(Object)

        // Build Mode Changes
        expect(DEV, 'Dev flag does not match').toBe(
          isDev ? `ws://${localIP}:${process.env['COMMONERS_WEBSOCKET_PORT']}` : false
        )
        expect(PROD, 'Prod flag does not match').toBe(!isDev)

        expect(
          ENV.COMMONERS_ENV_FOR_ALL_MODES,
          'Commoners custom environment variable does not match'
        ).toBeTruthy()

        // Plugin Checks
        expect('checks' in PLUGINS, 'Checks plugin is not enabled').toBe(true) // Test checks existence
        expect('localServices' in PLUGINS, 'Local services plugin is not enabled').toBe(
          isDev || isDesktop
        )

        // Service Checks
        expect(SERVICES, 'Services dictionary is not the expected type').instanceOf(Object)

        Object.entries(SERVICES).forEach(([name, service]) => {
          const shouldBePublished = availableByDefault || !!service.url

          // Web / PWA / Mobile builds will have cleared services (that are not remote)
          expect(name in SERVICES, `${name} is not published correctly`).toBe(shouldBePublished)

          if (shouldBePublished) {
            expect(typeof service.url).toBe('string')
            if ('port' in service) expect(parseInt(new URL(service.url).port)).toBe(service.port)
          }
        })

        // Desktop-Related Tests
        if (isDesktop) {
          // // NOTE: Only run on the backend. No loaded value to check on the frontend
          // expect('splash' in PLUGINS, "Splash plugin is not enabled").toBe(true);
          // expect('__testing' in PLUGINS, "Testing plugin is not enabled").toBe(true);

          // Desktop metadata
          expect(COMMONERS.TARGET, 'Target should be electron').toBe('electron')
          expect(typeof COMMONERS.ROOT, 'ROOT should be a string').toBe('string')

          // Desktop controls
          expect(DESKTOP, 'Desktop flag is not the expected type').instanceOf(Object)
          expect('quit' in DESKTOP, 'Desktop flag does not have a quit function').toBe(true)
          expect('__id' in DESKTOP, 'Desktop flag does not have an __id value').toBe(true)
          expect('__main' in DESKTOP, 'Desktop flag does not have a __main flag').toBe(true)

          // Check desktop service controls
          const allWithClose = Object.values(SERVICES).filter(service => 'close' in service)
          expect(
            allWithClose.length,
            'Each service does not have a close function'
          ).toBeGreaterThan(0)

          const allWithOnClosed = Object.values(SERVICES).filter(service => 'onClosed' in service)
          expect(
            allWithOnClosed.length,
            'Each service does not have an onClosed function'
          ).toBeGreaterThan(0)

          const allWithStatus = Object.values(SERVICES).filter(service => 'status' in service)
          expect(allWithStatus.length, 'Each service does not have a status value').toBeGreaterThan(
            0
          )
        } else expect(DESKTOP).toBe(false)
      })
    })
  },
}

export const getMockOutput = () => {
  return {
    cleanup: () => {},
  }
}

export const registerStartTest = (name, { target = 'web' } = {}, enabled = true) => {
  const describeCommand = enabled ? describe : describe.skip

  describeCommand(`${name} (Start)`, () => {
    const output = getMockOutput()
    beforeAll(async () => {
      const _output = await open(projectBase, { target })
      Object.assign(output, _output)
    })

    afterAll(async () => await output.cleanup())

    test('All assets are generated', async () => checkAssets(projectBase, undefined, { target }))

    const echoServices = [
      'http',
      'express',
      // 'manual',
      'manualAutobuild',
      // 'manualCustomLocation',
      ...(hasCommand('python') || hasCommand('python3') ? ['basic-python', 'numpy'] : []),
      ...(hasCommand('g++') ? ['cpp'] : []),
      ...(hasCommand('cargo') ? ['rust'] : []),
      'dynamicNode',
    ]

    // const services = [
    //   ...echoServices,
    //   'remote',
    //   // 'publishedToRemoteLocation',
    //   // 'localForDesktop',
    //   // 'remoteOnDesktop_removedOtherwise',
    //   // 'removedOnDesktop'
    // ]

    echoServices.forEach(name => serviceTests.echo(name, output))

    e2eTests.basic(output, { target })
    e2eTests.plugins(output, { target })
    e2eTests.pages(output, { target })
    e2eTests.serviceLifecycle(output, { target })
  })
}

type PublishOption = boolean | string | ((...args: unknown[]) => unknown)
type BuildOptions = { target?: string; publish?: PublishOption; launch?: boolean }

export const registerBuildTest = (
  name,
  { target = 'web', publish = false, launch = true }: BuildOptions = {},
  enabled = true
) => {
  const describeCommand = enabled ? describe : describe.skip

  const isElectron = target === 'electron'
  const isMobile = target === 'mobile'

  describeCommand(`${name} (Build)`, () => {
    let triggerAssetsBuilt
    let triggerBuildComplete
    const assetsBuilt = new Promise(res => (triggerAssetsBuilt = res))
    const buildComplete = new Promise(res => (triggerBuildComplete = res))

    const skipNativePackaging = isMobile // Halt Capacitor native packaging in tests (no Xcode/Android Studio needed)

    // Mobile builds are now testable via web preview
    const describeFn = describe

    const buildWaitTime = isElectron ? getMinutes(10) : isMobile ? getMinutes(5) : undefined // Wait for Electron packaging (up to 10min) or mobile (up to 5min)

    // Define inputs
    const opts = { target, outDir: scopedBuildOutDir, build: {} }

    const hooks = {
      onBuildAssets: assetDir => {
        triggerAssetsBuilt(assetDir)
        if (skipNativePackaging) return null
      },
    }

    // Setup build for testing
    const output = getMockOutput()

    beforeAll(async () => {
      // Set publish option if specified
      if (publish) {
        if (typeof publish === 'function') publish = await publish()
        Object.assign(opts.build, { publish })
      }

      const _output = await build(projectBase, opts, hooks)
      Object.assign(output, _output)

      // Store build metadata for later use
      triggerBuildComplete(_output)
    }, buildWaitTime)

    // Cleanup build outputs
    afterAll(async () => await output.cleanup(EXTRA_OUTPUT_LOCATIONS))

    test('All build assets have been created', async () => {
      const baseDir = (await assetsBuilt) as string
      checkAssets(projectBase, baseDir, { build: true, target })
    })

    // Add ASAR integrity verification for Electron builds (only when code-signed)
    if (isElectron && publish) {
      test('ASAR integrity is properly configured', async () => {
        // Use the artifact directory (final output), not the web directory (temp build)
        const builtOutput = (await buildComplete) as any
        const { metadata = {} } = builtOutput
        const artifactDir = metadata?.artifact || (await assetsBuilt)

        // Find the built .app or .exe
        const { name } = config
        let appPath: string | null = null

        if (process.platform === 'darwin') {
          // macOS - look for .app bundle in mac-arm64 or mac-x64 subdirectory
          const macDir = join(artifactDir, 'mac-arm64')
          appPath = join(macDir, `${name}.app`)
        } else if (process.platform === 'win32') {
          // Windows - look for .exe
          appPath = join(artifactDir, `${name}.exe`)
        }

        if (!appPath) {
          console.warn('⚠️  Skipping ASAR integrity test - unsupported platform')
          return
        }

        const result = verifyAsarIntegrity(appPath)

        // Print detailed results
        printVerificationResult(result)

        // Assert on critical checks
        expect(result.checks.asarExists, 'ASAR file should exist').toBe(true)
        expect(result.checks.metadataExists, 'ASAR integrity metadata should exist').toBe(true)
        expect(result.checks.hashMatches, 'ASAR hash should match embedded hash').toBe(true)

        // Fuse detection is a warning, not a failure
        if (!result.checks.fuseDetected) {
          console.warn('⚠️  Fuse sentinel not detected - this may cause issues')
        }

        // Overall success
        expect(result.success, 'ASAR integrity verification should pass').toBe(true)
      })
    }

    if (launch) {
      describeFn('Launched application tests', async () => {
        const launchOutput = getMockOutput()
        beforeAll(async () => {
          // Wait for build to complete first
          const assetDir = await assetsBuilt
          // For mobile builds, use the actual asset directory (web assets are in a temp dir, not the user outDir)
          const launchOpts = isMobile ? { ...opts, outDir: assetDir } : opts
          const _output = await open(projectBase, launchOpts, true)
          Object.assign(launchOutput, _output)
        })

        afterAll(() => launchOutput.cleanup())

        e2eTests.basic(launchOutput, { target }, false)
        e2eTests.plugins(launchOutput, { target }, false)
        e2eTests.pages(launchOutput, { target })
        e2eTests.serviceLifecycle(launchOutput, { target })
      })
    }
  })
}

const waitForService = async (url: string, timeoutMs = 30000) => {
  const start = Date.now()
  let delay = 250
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      /* retry */
    }
    await sleep(delay)
    delay = Math.min(delay * 1.5, 3000)
  }
  return false
}

export const serviceTests = {
  // Ensure a basic echo test passes on the chosen service
  echo: (id, output) => {
    test(`Service Echo Test (${id})`, { timeout: 90000 }, async () => {
      const services = await getServices(output)
      const service = services[id]
      if (!service?.url) return

      const baseUrl = service.url
      const ready = await waitForService(baseUrl, 60000)
      expect(ready, `Service '${id}' at ${baseUrl} did not become ready within 60s`).toBe(true)

      const randomNumber = getRandomNumber()
      const res = await fetch(new URL('echo', baseUrl), {
        method: 'POST',
        body: JSON.stringify({ randomNumber }),
      }).then(res => res.json())
      expect(res.randomNumber).toBe(randomNumber)
    })
  },
}
