# Services
Services are independent processes accessible via network requests.

## Usage
### Configuration
To declare a service, simply add the source file path to the `commoners.config.js` file:
```js
export default {
    services: {
        test: './services/test/server.ts'
    },
}
```
##### Advanced Publish Options
All services can be marked for publication to a remote server or removal from the final build, depending on the target platform.

```js
export default {
    // ...
    services: {
        test: {
            src: './services/test/server.ts'
            publish: 'https://test.server.com', // Remote for all builds
            // publish: { local: 'https://test.server.com' }, // Remote for local builds (desktop). Removed on remote builds (web, mobile)
            // publish: { remote: 'https://test.server.com' }, // Remote for remote builds (web, mobile). Local for local builds (desktop)
            // publish: { remote: 'https://test.server.com', local: false }, // Remote for remote builds (web, mobile). Removed on local builds (desktop)
            // publish: false, // Removed on all builds
        }
    }
}
```

Only Node.js services without a build command will be automatically published in `desktop` builds. All other service publish options must be manually configured.

### Frontend
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

### Backend
Commoners internally handles `host` and `port` assignment. As such, you must instantiate your server using the `HOST` and `PORT` environment variables:

```js
import http from 'node:http';
const host = process.env.HOST || ''
const port = process.env.PORT || 8000
http.createServer((req, res) => { /* ... */ }).listen(port, host, () => console.log(`Server running at http://${host}:${port}/`));
```

## Supported Services

### [Node.js](https://nodejs.org)
Services written in JavaScript or TypeScript are automatically bundled using [esbuild](https://esbuild.github.io) and [pkg](https://www.npmjs.com/package/pkg).

```js
export default {
    // ...
    services: {
        node: './services/node/server.ts'
    }
}
```

For a complete Node service example, see the [Node Service](./node.md) documentation.


### Python
Python services require additional configuration for production builds. This is because Python services must be packaged into an `.exe` file for distribution.

When working with Python services, ensure that you're executing your application in a virtual environment with the necessary dependencies. We recommend using [miniconda](https://docs.conda.io/en/latest/miniconda.html) and distributing an `environment.yml` file with your project.

For a complete Python service example, see the [Python Service](./python.md) documentation.

#### Development
Python services can be instantiated from the configuration file as long as the required environment is active where the application is running.

```js
export default {
    // ...
    services: {
        python: './services/python/main.py'
    }
}
```

#### Production
For use in a production environment, Python services must be packaged into an `.exe` file. We recommend using `pyinstaller` to create a standalone executable.

> For a complete Python service example, see the [Python Service](./python.md) documentation.

The following configuration will allow you to include the `--onedir` bundle from PyInstaller in your `desktop` builds:

```js

const pythonService = {
    name: 'python',
    src: './services/python/main.py',
    outDir: 'dist/pyinstaller',
}

export default {
    // ...
    services: {
        /// ...
        [pythonService.name]: {
            src: pythonService.src,
            build: `python -m PyInstaller --name ${pythonService.name} --onedir --clean ${pythonService.src} --distpath ${pythonService.outDir}`,
            publish: {
                src: pythonService.name, // The relative executable location in the base directory
                base: `${pythonService.outDir}/${pythonService.name}`, // The base directory to copy
            }
        }
    }
}
```

> **Note:** You must refrain from using the same `--name` argument as your `--distpath` final directory, as PyInstaller uses the `[distpath]/../[name]` directory to store temporary files.

You can also use the included helper function to declare Python services:

```js
import { python } from '@commoners/solidarity/services'

const pythonService = {
    name: 'python',
    src: './services/python/main.py',
}

export default {
    // ...
    services: {
        /// ...
        ...python.services([ pythonService ])
    }
}
```

### Compiled Languages
Compiled languages (e.g. C++, Rust, etc.) require additional configuration for production builds _and_ development use. This is because compiled languages must be built before they can be run.

```js

const cppService = {
    name: 'cpp',
    src: './services/cpp/main.cpp',
    outFile: `./build/cpp/server.exe`,
}

export default {
    // ...
    services: {
        cpp: {
            src: cppService.src,

            build: `g++ ${cppService.src} -o ${cppService.outFile}`, // Simple version

            // build: async ({ src, out }) => {
            //     const os = await import('node:os')
            //     const isWindows = os.platform() === 'win32'
            //     const { mkdirSync } = await import('node:fs')
            //     const { dirname, resolve } = await import('node:path')
            //     mkdirSync(dirname(out), { recursive: true }) // Ensure base and asset output directory exists
            //     const buildCommand = `g++ ${resolve(src)} -o ${resolve(out)} -std=c++11`
            //     if (isWindows) return buildCommand + ` -lws2_32` // Windows requires additional linking
            //     return buildCommand
            // },

            publish: cppService.outFile,
        }
    }
}
```

For a complete compiled service example, see the [C++ Service](./cpp.md) documentation.

### Remote
Third-party API endpoints are sometimes useful to register as services.

```js
export default {
    // ...
    services: {
        remote: 'https://example.com/api'
    }
}
```
