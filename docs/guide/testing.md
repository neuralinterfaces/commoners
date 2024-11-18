
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
