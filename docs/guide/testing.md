
# Testing
Using the `@commoners/testing` package, you can easily write end-to-end tests for your application.

```bash
npm install @commoners/testing
```

Then, add the following to your `package.json`:

```json
{
    "scripts": {
        "test": "commoners test"
    }
}
```

We use `vitest` to run tests—but you can use any testing framework you like.

Here's an example test for a Web + Desktop application:

```js

import { expect, test, describe, beforeAll, afterAll } from 'vitest'
import { open, build } from '../../testing/index'

const ROOT = '../my/app'
const OUTDIR = 'dist'

const registerTests = (prod = false) => {

    const OUTPUTS = {}
    const opts = { build: { outDir: OUTDIR } }

    beforeAll(async () => {
        if (prod) OUTPUTS.build = await build(ROOT, opts)
        OUTPUTS.app = await open(ROOT, opts, prod)
    })

    afterAll(async () => Object.values(OUTPUTS).forEach(o => o.cleanup()))

    test('should load the app', async () => {
        expect(await OUTPUTS.app.page.title()).toBe('Test App')
    })

    test('should have global variable', async () => {
        expect(await OUTPUTS.app.page.evaluate(() => commoners.NAME)).toBe('Test App')
    })

}

describe('App runs in development mode', () => registerTests(false))

describe('App runs in production mode', () => registerTests(true))

```

## Mobile Testing

Mobile targets work with the same `open()` and `build()` APIs. In testing mode, mobile builds are served via a web preview server (no Xcode or Android Studio required):

```js
import { expect, test, describe, beforeAll, afterAll } from 'vitest'
import { open } from '@commoners/testing'

const ROOT = '../my/app'

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

    test('services are accessible', async () => {
        const services = await output.page.evaluate(() =>
            commoners.READY.then(() => commoners.SERVICES)
        )
        expect(services).toBeTypeOf('object')
    })
})
```

For details on native emulator testing, see the [Mobile target documentation](/guide/targets/mobile#testing).
