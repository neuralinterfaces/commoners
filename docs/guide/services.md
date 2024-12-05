
# Services
Services are independent processes that the main application depends on. These may be `local` or `remote` based on the distributed application files.

> **Note:** Commoners currently supports `.js`, `.ts`, `.py`, and `.exe` services.

To declare a service, you simply add the source file path to the `commoners.config.js` file:
```js
export default {
    services: {
        test: './services/test/index.ts'
    },
}
```

Before using a service, it's good practice to:
1. Check for the existence of the service.
2. Instantiate the appropriate URL from the `commoners` global object.

```js
    const { SERVICES } = commoners
    if ('test' in SERVICES) {
        const url = new URL(SERVICES.test.url)
        // ....
    }
```

If your service will be accessible from a particular URL, you'll want to make sure to instantiate your server using the `HOST` and `PORT` environment variables:

```js
import http from 'node:http';
const host = process.env.HOST
const port = process.env.PORT
http.createServer((req, res) => { /* ... */ }).listen(port)
```

## Using Services in Production
Service configurations may be different between development and production. 

For instance, `.py` services can be packaged into an `.exe` file using `pyinstaller`.

### Python
The following configuration will allow you to include the `--onedir` bundle from PyInstaller in your `desktop` builds:

```js

const pythonService = {
    name: 'python-service',
    src: 'src/main.py',
    outDir: 'dist/pyinstaller',
}

export default {
    // ...
    src: pythonService.src,
    build: `python -m PyInstaller --name ${pythonService.name} --onedir --clean ${pythonService.src} --distpath ${pythonService.outDir}`,
     publish: {
        src: pythonService.name, // The relative executable location in the base directory
        base: `${pythonService.outDir}/${pythonService.name}`, // The base directory to copy
    }
}
```

> **Note:** You must refrain from using the same `--name` argument as your `--distpath` final directory, as PyInstaller uses the `[distpath]/../[name]` directory to store temporary files.

You can also use the included helper function to declare Python services:

```js
import { services } from '@commoners/solidarity'

const pythonService = {
    name: 'python-service',
    src: 'src/main.py'
}

export default {
    // ...
    services: services.python.services([ pythonService ])
}
```