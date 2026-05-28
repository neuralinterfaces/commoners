
# Testing
Using the `@commoners/testing` package, you can write end-to-end tests for your application.

```bash
npm install @commoners/testing
```

We use `vitest` to run tests — but you can use any testing framework you like.

## Setup

Add the testing plugin to your `commoners.config.ts`:

```js
import testingPlugin from '@commoners/testing/plugin'

export default {
    plugins: {
        __testing: testingPlugin({ remoteDebuggingPort: 8315 }),
        // ... other plugins
    }
}
```

The testing plugin enables CDP (Chrome DevTools Protocol) connections for Playwright to control the Electron app.

## Basic Example

```js
import { expect, test, describe, beforeAll, afterAll } from 'vitest'
import { open, build } from '@commoners/testing'

const ROOT = '../my/app'

describe('App runs in development mode', () => {
    const output = {}

    beforeAll(async () => {
        Object.assign(output, await open(ROOT))
    })

    afterAll(async () => output.cleanup())

    test('should load the app', async () => {
        expect(await output.page.title()).toBe('My App')
    })

    test('should have global variable', async () => {
        expect(await output.page.evaluate(() => commoners.NAME)).toBe('My App')
    })
})
```

## `open()` Return Value

`open(root, overrides?, useBuild?)` returns:

| Property | Type | Description |
|----------|------|-------------|
| `page` | `Page` | Main application page (Playwright Page with auto-recovery) |
| `pages` | `Record<string, Page>` | Config-keyed pages (auto-updated when new windows appear) |
| `browser` | `Browser` | Playwright Browser instance |
| `url` | `string` | Dev server URL |
| `findPage` | `(predicate, timeout?) => Promise<Page \| null>` | Find a page by URL predicate |
| `waitForPage` | `(key, timeout?) => Promise<Page \| null>` | Wait for a config-keyed page to appear |
| `cleanup` | `() => Promise<void>` | Cleanup handler |

## Multi-Window Testing

Apps with multiple windows (auth splash screens, popups, etc.) can access each window by its config key:

```js
const output = await open(ROOT, { target: 'electron' })

// Pages declared in commoners.config.ts pages: { home, settings }
output.pages.home       // Main window
output.pages.settings   // Settings page (when navigated)

// Plugin pages (created async in ready() hooks)
const authPage = await output.waitForPage('auth', 15000)
if (authPage) {
    await authPage.fill('#password', 'secret')
    await authPage.click('#submit')
}

// Find by URL pattern
const popup = await output.findPage(url => url.includes('popup.html'))
```

The `pages` record auto-updates via CDP events when plugins create new BrowserWindows.

## Desktop Testing

For desktop (Electron) targets:

```js
describe('Desktop', () => {
    const output = {}

    beforeAll(async () => {
        Object.assign(output, await open(ROOT, { target: 'electron' }))
    })

    afterAll(() => output.cleanup())

    test('Plugin IPC works', async () => {
        const result = await output.page.evaluate((msg) => {
            return commoners.READY.then(({ myPlugin }) => myPlugin.echo(msg))
        }, 'hello')
        expect(result).toBe('hello')
    })

    test('Desktop controls are available', async () => {
        const desktop = await output.page.evaluate(() => {
            return commoners.READY.then(() => ({
                hasQuit: 'quit' in commoners.DESKTOP,
                hasId: '__id' in commoners.DESKTOP,
            }))
        })
        expect(desktop.hasQuit).toBe(true)
    })
})
```

## Mobile Testing

Mobile targets work with the same `open()` and `build()` APIs. In testing mode, mobile builds are served via a web preview server (no Xcode or Android Studio required):

```js
describe('Mobile app', () => {
    const output = {}

    beforeAll(async () => {
        Object.assign(output, await open(ROOT, { target: 'mobile' }))
    })

    afterAll(() => output.cleanup())

    test('MOBILE flag is set', async () => {
        const isMobile = await output.page.evaluate(() => commoners.MOBILE)
        expect(isMobile).toBe(true)
    })
})
```

## Build Testing

Test production builds:

```js
import { build, open } from '@commoners/testing'

describe('Production build', () => {
    const output = {}

    beforeAll(async () => {
        await build(ROOT, { target: 'electron' })
        Object.assign(output, await open(ROOT, { target: 'electron' }, true))
    })

    afterAll(() => output.cleanup())

    test('runs in production mode', async () => {
        const prod = await output.page.evaluate(() => commoners.PROD)
        expect(prod).toBe(true)
    })
})
```

For details on native emulator testing, see the [Mobile target documentation](/guide/targets/mobile#testing).
